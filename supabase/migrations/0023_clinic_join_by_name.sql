-- docregister — join a clinic by name, with the owner holding the door
--
-- Signup asks for a clinic name. First person to use a name creates that clinic
-- and owns it; anyone who types the same name afterwards is attached to it as a
-- PENDING member and sees nothing at all until an owner approves them.
--
-- The pending step is the whole point, so it is worth saying why it is not
-- optional. A clinic name is public: it is on the signboard, the prescription
-- pad and Google Maps. If matching a name were enough to be let in, "Apollo
-- Clinic" would be a password that every patient in the waiting room already
-- knows, and the entire tenant boundary this schema is built on — every policy
-- routing through `auth_clinic_id()` — would come down to guessing a string.
-- One tap from someone who already works there costs nothing and closes that.
--
-- Pending members are gated at `auth_clinic_id()` rather than in each policy,
-- because that function is the single choke point every clinic-scoped policy
-- already goes through. A rule added there cannot be forgotten by the next
-- table someone adds.

-- 1 ────────────────────────────────────────────────────────── clinic identity

alter table clinics add column if not exists name_normalized text;

-- Same shape as `normalize_patient_name()`, for the same reason: the value the
-- trigger stores has to be the value the lookup builds, or joining silently
-- fails for names that differ only by case or spacing.
create or replace function normalize_clinic_name()
returns trigger
language plpgsql
security invoker
set search_path = public, extensions, pg_temp
as $$
begin
  new.name_normalized := btrim(
    regexp_replace(lower(unaccent(coalesce(new.name, ''))), '\s+', ' ', 'g')
  );
  if new.name_normalized = '' then
    raise exception 'clinic name cannot be empty';
  end if;
  return new;
end;
$$;

update clinics
   set name_normalized = btrim(regexp_replace(lower(unaccent(name)), '\s+', ' ', 'g'))
 where name_normalized is null;

alter table clinics alter column name_normalized set not null;

-- Unique, so "the clinic with this name" is a question with one answer. Two
-- clinics racing the same new name is resolved by this index rather than by
-- whichever transaction happened to commit second.
create unique index if not exists clinics_name_normalized_key
  on clinics (name_normalized);

drop trigger if exists clinics_normalize_name on clinics;
create trigger clinics_normalize_name
  before insert or update of name on clinics
  for each row execute function normalize_clinic_name();

-- 2 ─────────────────────────────────────────────────────────────── membership

do $$
begin
  if not exists (select 1 from pg_type where typname = 'membership_status') then
    create type membership_status as enum ('pending', 'active');
  end if;
end $$;

-- Existing doctors default to active: they were here before this rule and were
-- admitted under the invite flow, which already proved who they were.
alter table doctors
  add column if not exists membership_status membership_status not null default 'active',
  add column if not exists requested_at timestamptz not null default now(),
  add column if not exists approved_at  timestamptz,
  add column if not exists approved_by  uuid references doctors (id) on delete set null;

create index if not exists doctors_pending_idx
  on doctors (clinic_id, requested_at desc)
  where membership_status = 'pending';

-- 3 ──────────────────────────────────────────────────────── the tenant gate

-- The one line that makes pending mean something. Every clinic-scoped policy in
-- this schema compares against this function, so a pending member resolving to
-- NULL sees no patients, no encounters, no accounts — without a single policy
-- being rewritten.
create or replace function auth_clinic_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select clinic_id
  from doctors
  where id = auth.uid()
    and membership_status = 'active'
$$;

-- A pending member still has to be able to read their OWN row, or the app
-- cannot tell "waiting for approval" from "not a doctor at all" and bounces
-- them back to the login screen they just came from. Their own row is the only
-- thing this adds: it names the clinic they asked to join, which they typed.
drop policy if exists doctors_read on doctors;
create policy doctors_read on doctors
  for select
  using (id = (select auth.uid()) or clinic_id = (select auth_clinic_id()));

-- 4 ─────────────────────────────────────────────────────────────── approval

create or replace function approve_clinic_member(p_doctor_id uuid)
returns doctors
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller  doctors%rowtype;
  v_member  doctors%rowtype;
begin
  select * into v_caller from doctors where id = auth.uid();
  if not found or v_caller.membership_status <> 'active' or v_caller.role <> 'owner' then
    raise exception 'only an active owner can admit a member'
      using errcode = 'insufficient_privilege';
  end if;

  -- Locked before the check so two owners tapping at once cannot both admit.
  select * into v_member from doctors where id = p_doctor_id for update;
  if not found or v_member.clinic_id <> v_caller.clinic_id then
    raise exception 'no such pending member in your clinic'
      using errcode = 'insufficient_privilege';
  end if;

  if v_member.membership_status = 'active' then
    return v_member;
  end if;

  update doctors
     set membership_status = 'active',
         approved_at = now(),
         approved_by = v_caller.id
   where id = p_doctor_id
  returning * into v_member;

  return v_member;
end;
$$;

create or replace function decline_clinic_member(p_doctor_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller doctors%rowtype;
  v_member doctors%rowtype;
begin
  select * into v_caller from doctors where id = auth.uid();
  if not found or v_caller.membership_status <> 'active' or v_caller.role <> 'owner' then
    raise exception 'only an active owner can decline a member'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_member from doctors where id = p_doctor_id for update;
  if not found or v_member.clinic_id <> v_caller.clinic_id then
    raise exception 'no such pending member in your clinic'
      using errcode = 'insufficient_privilege';
  end if;

  -- Only ever a pending row. An active colleague is removed deliberately
  -- elsewhere, not through the same button that clears a join request.
  if v_member.membership_status <> 'pending' then
    raise exception 'that member is already active'
      using errcode = 'insufficient_privilege';
  end if;

  delete from doctors where id = p_doctor_id;
end;
$$;

revoke execute on function normalize_clinic_name() from public, anon, authenticated;

-- 5 ────────────────────────────────────────────────────────────── signup

create or replace function handle_new_doctor()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_clinic_id       uuid;
  v_full_name       text;
  v_clinic_name     text;
  v_clinic_norm     text;
  v_status          membership_status := 'active';
  v_invite_token    text;
  v_invite_id       uuid;
  v_signature       text;
  v_expected        text;
  v_secret          bytea;
  v_invite          clinic_invites%rowtype;
  v_role            clinic_role;
begin
  v_full_name := left(coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(new.email, '@', 1)
  ), 120);

  v_clinic_name  := left(nullif(btrim(new.raw_user_meta_data ->> 'clinic_name'), ''), 120);
  v_invite_token := nullif(btrim(new.raw_user_meta_data ->> 'invite_token'), '');

  if v_invite_token is not null then
    -- An invite is a stronger claim than a name: it is single-use, expiring,
    -- HMAC-signed and bound to this address, so it admits directly.
    begin
      v_invite_id := split_part(v_invite_token, '.', 1)::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid clinic invitation'
        using errcode = 'invalid_authorization_specification';
    end;

    v_signature := split_part(v_invite_token, '.', 2);
    if v_signature = '' or split_part(v_invite_token, '.', 3) <> '' then
      raise exception 'invalid clinic invitation'
        using errcode = 'invalid_authorization_specification';
    end if;

    select * into v_invite from clinic_invites where id = v_invite_id for update;

    if not found
       or v_invite.consumed_at is not null
       or v_invite.expires_at <= now()
       or v_invite.email <> lower(btrim(coalesce(new.email, ''))) then
      raise exception 'invalid or expired clinic invitation'
        using errcode = 'invalid_authorization_specification';
    end if;

    select value into strict v_secret from app_private_settings
     where key = 'clinic_invite_hmac';

    v_expected := encode(hmac(convert_to(v_invite.id::text, 'UTF8'), v_secret, 'sha256'), 'hex');

    if v_signature <> v_expected
       or digest(convert_to(v_invite_token, 'UTF8'), 'sha256') <> v_invite.token_digest then
      raise exception 'invalid clinic invitation'
        using errcode = 'invalid_authorization_specification';
    end if;

    v_clinic_id := v_invite.clinic_id;
    v_role      := v_invite.role;
    v_status    := 'active';

  elsif v_clinic_name is not null then
    v_clinic_norm := btrim(regexp_replace(lower(unaccent(v_clinic_name)), '\s+', ' ', 'g'));
    select id into v_clinic_id from clinics where name_normalized = v_clinic_norm;

    if found then
      -- Someone is already using this name. Attach, but admit nothing: a name
      -- is public, so it decides WHICH door you are standing at, never whether
      -- it opens.
      v_role   := 'doctor';
      v_status := 'pending';
    else
      begin
        insert into clinics (name, timezone) values (v_clinic_name, 'Asia/Kolkata')
        returning id into v_clinic_id;
        v_role   := 'owner';
        v_status := 'active';
      exception when unique_violation then
        -- Lost a race with another signup using the same new name in the same
        -- instant. The other one owns it; this one queues like any other joiner.
        select id into strict v_clinic_id from clinics where name_normalized = v_clinic_norm;
        v_role   := 'doctor';
        v_status := 'pending';
      end;
    end if;

  else
    -- No clinic named, no invite: a solo practice, as before. The name must not
    -- collide with an existing clinic, because falling through to a *join*
    -- here would put a stranger in a pending queue at a clinic they never
    -- named — the exact accident the pending gate exists to prevent.
    begin
      insert into clinics (name, timezone)
      values (v_full_name || '''s Clinic', 'Asia/Kolkata')
      returning id into v_clinic_id;
    exception when unique_violation then
      insert into clinics (name, timezone)
      values (v_full_name || '''s Clinic (' || left(new.id::text, 8) || ')', 'Asia/Kolkata')
      returning id into v_clinic_id;
    end;
    v_role   := 'owner';
    v_status := 'active';
  end if;

  insert into doctors (id, clinic_id, full_name, role, dictation_langs, membership_status, approved_at)
  values (
    new.id, v_clinic_id, v_full_name, v_role, array['hi-IN', 'en-IN'],
    v_status,
    case when v_status = 'active' then now() else null end
  )
  on conflict (id) do nothing;

  if v_invite_token is not null then
    update clinic_invites
       set consumed_at = now(), consumed_by = new.id
     where id = v_invite.id and consumed_at is null;

    if not found then
      raise exception 'clinic invitation was already used'
        using errcode = 'invalid_authorization_specification';
    end if;
  end if;

  return new;
end;
$function$;

revoke execute on function handle_new_doctor() from public, anon, authenticated;
