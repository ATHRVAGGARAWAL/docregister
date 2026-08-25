-- First-login provisioning.
--
-- A doctor who clicks a magic link has an `auth.users` row and nothing else.
-- Every RLS policy in this schema keys off `auth_clinic_id()`, which reads the
-- `doctors` table — so a user without a doctors row can see nothing at all, not
-- even to create their own clinic. That is a deadlock, and the standard way out
-- is a SECURITY DEFINER trigger that runs outside RLS.
--
-- Doing it in a trigger rather than in the auth callback also means it happens
-- exactly once, inside the same transaction that creates the user, no matter
-- which client signed them in.

create or replace function handle_new_doctor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid;
  v_invite_clinic uuid;
  v_full_name text;
begin
  v_full_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    -- Fall back to the email local part: "dr.mehta@clinic.in" -> "dr.mehta".
    -- Ugly, but a nameless doctor in the register is worse, and it is editable
    -- in settings.
    split_part(new.email, '@', 1)
  );

  -- An invited doctor carries their clinic id in user metadata; everyone else
  -- gets a clinic of their own and becomes its owner.
  v_invite_clinic := nullif(new.raw_user_meta_data ->> 'clinic_id', '')::uuid;

  if v_invite_clinic is not null and exists (select 1 from clinics where id = v_invite_clinic) then
    v_clinic_id := v_invite_clinic;
  else
    insert into clinics (name, timezone)
    values (v_full_name || '''s Clinic', 'Asia/Kolkata')
    returning id into v_clinic_id;
  end if;

  -- No email column here on purpose. `auth.users.email` is the source of truth
  -- and changes when a doctor updates their sign-in address; a copy in `doctors`
  -- would silently go stale. `getCurrentDoctor()` reads it off the session.
  insert into doctors (id, clinic_id, full_name, role, dictation_langs)
  values (
    new.id,
    v_clinic_id,
    v_full_name,
    -- The cast is required: a CASE over bare literals resolves to `text`, and
    -- Postgres will not implicitly narrow that to the enum.
    (case when v_invite_clinic is null then 'owner' else 'doctor' end)::clinic_role,
    array['hi-IN', 'en-IN']
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function handle_new_doctor();
