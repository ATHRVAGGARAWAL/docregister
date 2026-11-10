-- Clerk owns sign-in. Keep the UUIDs referenced by clinical records stable.
alter table doctors add column clerk_user_id text unique;
alter table doctors add column email text;
update doctors d set email = lower(u.email) from auth.users u where u.id = d.id;
alter table doctors drop constraint doctors_id_fkey;
alter table doctors alter column id set default gen_random_uuid();
drop trigger if exists on_auth_user_created on auth.users;

-- The API gateway verifies Clerk's signature before these claims reach SQL.
-- Never cast Clerk's user_... subjects to UUID, and never trust client metadata
-- for a doctor ID or a clinic ID. Unknown identities resolve to NULL.
create or replace function current_doctor_id()
returns uuid language sql stable security definer
set search_path = public, pg_temp
as $$
  select id from doctors
  where clerk_user_id = (
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )
    and (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sid') is not null
    and (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sts') is distinct from 'pending'
$$;
revoke all on function current_doctor_id() from public, anon;
grant execute on function current_doctor_id() to authenticated, service_role;

-- Rebind the existing workflow bodies and policies without changing their
-- scope, role checks, audit behavior, function grants, or record identifiers.
-- auth.uid() is Supabase-owned; leave that managed function untouched.
do $$
declare r record; v_sql text;
begin
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and p.prosrc like '%auth.uid()%'
  loop
    execute replace(pg_get_functiondef(r.oid), 'auth.uid()', 'public.current_doctor_id()');
  end loop;
  for r in
    select p.polname, n.nspname, c.relname,
      pg_get_expr(p.polqual, p.polrelid) as using_expr,
      pg_get_expr(p.polwithcheck, p.polrelid) as check_expr
    from pg_policy p join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'storage')
  loop
    if coalesce(r.using_expr, '') like '%auth.uid()%'
       or coalesce(r.check_expr, '') like '%auth.uid()%' then
      v_sql := format('alter policy %I on %I.%I', r.polname, r.nspname, r.relname);
      if r.using_expr is not null then
        v_sql := v_sql || ' using (' || replace(r.using_expr, 'auth.uid()', 'public.current_doctor_id()') || ')';
      end if;
      if r.check_expr is not null then
        v_sql := v_sql || ' with check (' || replace(r.check_expr, 'auth.uid()', 'public.current_doctor_id()') || ')';
      end if;
      execute v_sql;
    end if;
  end loop;
end;
$$;

-- Anonymous policies call auth_clinic_id(), which returns NULL for strangers.
grant execute on function current_doctor_id() to anon;

create or replace function is_platform_admin()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from doctors d join admin_emails a on a.email = lower(d.email)
    where d.id = current_doctor_id() and d.membership_status = 'active'
  )
$$;

-- Called only by the server after verifying Clerk's primary email. It can
-- link an unclaimed legacy doctor, or create a new/pending clinic membership.
-- Email alone never grants access to an existing clinic.
create or replace function provision_clerk_doctor(
  p_clerk_user_id text,
  p_email text,
  p_full_name text,
  p_clinic_name text default null
)
returns doctors language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_doctor doctors%rowtype;
  v_clinic uuid;
  v_name text := left(btrim(p_full_name), 120);
  v_email text := lower(btrim(p_email));
  v_clinic_name text := left(nullif(btrim(p_clinic_name), ''), 120);
  v_status membership_status := 'active';
  v_role clinic_role := 'owner';
begin
  if p_clerk_user_id !~ '^user_[A-Za-z0-9]+$'
     or v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or nullif(v_name, '') is null then
    raise exception 'verified identity is required' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_clerk_user_id, 0));
  select * into v_doctor from doctors where clerk_user_id = p_clerk_user_id;
  if found then return v_doctor; end if;

  -- A verified Clerk address can claim only an unclaimed, verified legacy
  -- identity. Lock the row so two Clerk accounts cannot claim it concurrently.
  select d.* into v_doctor from doctors d join auth.users u on u.id = d.id
    where lower(d.email) = v_email and u.email_confirmed_at is not null
    for update of d;
  if found then
    if v_doctor.clerk_user_id is not null and v_doctor.clerk_user_id <> p_clerk_user_id then
      raise exception 'this doctor already has a linked account' using errcode = '23505';
    end if;
    update doctors set clerk_user_id = p_clerk_user_id where id = v_doctor.id returning * into v_doctor;
    return v_doctor;
  end if;
  -- First load can probe for a legacy account without creating a practice.
  if v_clinic_name is null then return null; end if;

  -- Lock normalized clinic identity as well to make first-owner creation safe.
  perform pg_advisory_xact_lock(hashtextextended(
    btrim(regexp_replace(lower(unaccent(v_clinic_name)), '\s+', ' ', 'g')), 1
  ));
  select id into v_clinic from clinics where name_normalized =
    btrim(regexp_replace(lower(unaccent(v_clinic_name)), '\s+', ' ', 'g'));
  if found then
    v_status := 'pending'; v_role := 'doctor';
  else
    insert into clinics(name, timezone) values(v_clinic_name, 'Asia/Kolkata') returning id into v_clinic;
  end if;
  insert into doctors (clerk_user_id, email, clinic_id, full_name, role, practice_role, membership_status, approved_at, dictation_langs)
    values (p_clerk_user_id, v_email, v_clinic, v_name, v_role,
      case when v_role = 'owner' then 'owner'::practice_role else 'dentist'::practice_role end,
      v_status, case when v_status = 'active' then now() end, array['hi-IN','en-IN'])
    returning * into v_doctor;
  return v_doctor;
end;
$$;
revoke all on function provision_clerk_doctor(text,text,text,text) from public, anon, authenticated;
grant execute on function provision_clerk_doctor(text,text,text,text) to service_role;
revoke insert, update, delete, truncate on doctors from anon, authenticated;

notify pgrst, 'reload schema';
