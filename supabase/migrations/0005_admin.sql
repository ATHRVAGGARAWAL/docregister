-- docregister — platform admin allowlist
--
-- `clinic_role` has had an 'owner' value since 0001, and nothing reads it.
-- Every policy in that migration keys off clinic *membership* through
-- `auth_clinic_id()`, so an owner and a doctor in the same clinic have byte-
-- identical rights today. This migration does not change that, and it is worth
-- being blunt about it: it establishes *who* the owner is so that enforcement
-- has something to key off when it lands. Granting the label is not granting
-- power, and treating it as though it were is how a permission model ends up
-- decorative.
--
-- What it does buy immediately: an allowlisted address is an owner however it
-- signs in. Without this, an admin who happens to accept a clinic invite is
-- provisioned 'doctor' by 0003 and there is no route back to owner short of
-- hand-editing the table.

-- ---------------------------------------------------------------------------
-- The allowlist
-- ---------------------------------------------------------------------------

create table if not exists admin_emails (
  -- Stored lower-cased and compared lower-cased. Postgres `text` is
  -- case-sensitive and mail providers are not, so `Athrv@…` and `athrv@…` are
  -- one account to Supabase Auth and would be two rows here.
  email    text primary key check (email = lower(email)),
  note     text,
  added_at timestamptz not null default now()
);

-- RLS on, no policies, deliberately. The only readers are the SECURITY DEFINER
-- functions below, which bypass RLS; for everyone else the table returns zero
-- rows through PostgREST. An allowlist that any signed-in doctor could read is
-- a shortlist of the accounts worth attacking.
alter table admin_emails enable row level security;

insert into admin_emails (email, note)
values ('athrvaggarwal@gmail.com', 'project owner')
on conflict (email) do nothing;

-- ---------------------------------------------------------------------------
-- Helper, for enforcement that does not exist yet
-- ---------------------------------------------------------------------------

create or replace function is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from auth.users u
      join admin_emails a on a.email = lower(u.email)
     where u.id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Provisioning: same as 0003, plus the allowlist check
-- ---------------------------------------------------------------------------

create or replace function handle_new_doctor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id     uuid;
  v_invite_clinic uuid;
  v_full_name     text;
  v_is_admin      boolean;
begin
  v_full_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(new.email, '@', 1)
  );

  v_invite_clinic := nullif(new.raw_user_meta_data ->> 'clinic_id', '')::uuid;

  if v_invite_clinic is not null and exists (select 1 from clinics where id = v_invite_clinic) then
    v_clinic_id := v_invite_clinic;
  else
    insert into clinics (name, timezone)
    values (v_full_name || '''s Clinic', 'Asia/Kolkata')
    returning id into v_clinic_id;
  end if;

  -- Read against the allowlist, not against a literal. A hardcoded address in
  -- a trigger body can only be changed by shipping a migration, which means
  -- the person locked out is the one who has to deploy the fix.
  select exists (select 1 from admin_emails where email = lower(new.email))
    into v_is_admin;

  insert into doctors (id, clinic_id, full_name, role, dictation_langs)
  values (
    new.id,
    v_clinic_id,
    v_full_name,
    (case
       when v_is_admin then 'owner'
       when v_invite_clinic is null then 'owner'
       else 'doctor'
     end)::clinic_role,
    array['hi-IN', 'en-IN']
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Catch up anyone who signed in before they were allowlisted
-- ---------------------------------------------------------------------------

update doctors d
   set role = 'owner'
  from auth.users u
 where u.id = d.id
   and d.role <> 'owner'
   and exists (select 1 from admin_emails a where a.email = lower(u.email));
