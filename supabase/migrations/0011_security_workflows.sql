-- docregister — security boundaries and atomic clinical workflows
--
-- The browser and the Next.js API both authenticate with the caller's JWT.
-- Broad FOR ALL policies therefore made the API layer optional: anyone with a
-- valid session could write directly to the REST tables and bypass draft,
-- review and commit invariants. This migration makes the tables read-only to
-- authenticated sessions and exposes narrowly-scoped SECURITY DEFINER
-- functions for the mutations the product actually supports.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Cross-tenant referential integrity
-- ---------------------------------------------------------------------------

-- RLS controls which rows a caller can see. Foreign keys do not consult RLS,
-- so the tenant id is also carried through the relationships themselves. This
-- makes an accidental or privileged cross-clinic link fail at the constraint,
-- not merely at the API check that happened to run first.
alter table doctors
  add constraint doctors_id_clinic_key unique (id, clinic_id);

alter table patients
  add constraint patients_id_clinic_key unique (id, clinic_id),
  add constraint patients_creator_same_clinic
    foreign key (created_by, clinic_id) references doctors (id, clinic_id);

alter table transcripts
  add constraint transcripts_id_clinic_doctor_key unique (id, clinic_id, doctor_id),
  add constraint transcripts_doctor_same_clinic
    foreign key (doctor_id, clinic_id) references doctors (id, clinic_id);

alter table encounters
  add constraint encounters_id_clinic_key unique (id, clinic_id),
  add constraint encounters_doctor_same_clinic
    foreign key (doctor_id, clinic_id) references doctors (id, clinic_id),
  add constraint encounters_patient_same_clinic
    foreign key (patient_id, clinic_id) references patients (id, clinic_id),
  add constraint encounters_transcript_same_clinic_doctor
    foreign key (transcript_id, clinic_id, doctor_id)
    references transcripts (id, clinic_id, doctor_id);

alter table prescription_items
  add constraint prescription_items_encounter_same_clinic
    foreign key (encounter_id, clinic_id) references encounters (id, clinic_id);

create unique index encounters_one_per_transcript_idx
  on encounters (transcript_id) where transcript_id is not null;

-- Phase 2 adds capture_source. Until then every normal encounter is a voice
-- encounter. Reading NEW through jsonb lets this trigger remain valid both
-- before and after that column exists, without putting a forward reference in
-- this migration. A manual encounter may commit without a transcript only once
-- its row explicitly says capture_source = 'manual'.
create or replace function enforce_encounter_commit_evidence()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_source text := coalesce(to_jsonb(new) ->> 'capture_source', 'voice');
begin
  if new.status = 'committed'
     and v_source = 'voice'
     and new.transcript_id is null then
    raise exception 'a voice encounter requires a transcript before commit'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists encounters_commit_evidence on encounters;
create trigger encounters_commit_evidence
  before insert or update of status, transcript_id on encounters
  for each row execute function enforce_encounter_commit_evidence();

-- ---------------------------------------------------------------------------
-- Signed, expiring, single-use clinic invitations
-- ---------------------------------------------------------------------------

-- A private database-held HMAC key signs invite ids. The raw token is returned
-- once by issue_clinic_invite; only its digest is retained. RLS has no policies
-- on this table, so publishable-key clients cannot read the signing material.
create table app_private_settings (
  key        text primary key,
  value      bytea not null,
  created_at timestamptz not null default now()
);

alter table app_private_settings enable row level security;
revoke all on table app_private_settings from anon, authenticated;

insert into app_private_settings (key, value)
values ('clinic_invite_hmac', gen_random_bytes(32))
on conflict (key) do nothing;

create table clinic_invites (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references clinics (id) on delete cascade,
  email        text not null,
  role         clinic_role not null default 'doctor',
  token_digest bytea not null unique,
  created_by   uuid not null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  consumed_at  timestamptz,
  consumed_by  uuid,
  constraint clinic_invites_email_normalized check (email = lower(btrim(email))),
  constraint clinic_invites_member_role check (role in ('doctor', 'staff')),
  constraint clinic_invites_expiry_after_creation check (expires_at > created_at),
  constraint clinic_invites_creator_same_clinic
    foreign key (created_by, clinic_id) references doctors (id, clinic_id),
  constraint clinic_invites_consumer_fkey
    foreign key (consumed_by) references doctors (id) on delete set null,
  constraint clinic_invites_consumer_same_clinic
    foreign key (consumed_by, clinic_id) references doctors (id, clinic_id),
  constraint clinic_invites_consumption_complete
    check (consumed_by is null or consumed_at is not null)
);

create index clinic_invites_clinic_created_idx
  on clinic_invites (clinic_id, created_at desc);
create index clinic_invites_available_idx
  on clinic_invites (expires_at) where consumed_at is null;

alter table clinic_invites enable row level security;

create policy clinic_invites_owner_read on clinic_invites
  for select to authenticated
  using (
    exists (
      select 1
      from doctors d
      where d.id = auth.uid()
        and d.clinic_id = clinic_invites.clinic_id
        and d.role = 'owner'
    )
  );

revoke insert, update, delete, truncate on table clinic_invites from anon, authenticated;

create or replace function issue_clinic_invite(
  p_email text,
  p_role clinic_role default 'doctor',
  p_expires_in interval default interval '7 days'
)
returns table (invite_id uuid, invite_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_actor       doctors%rowtype;
  v_secret      bytea;
  v_invite_id   uuid := gen_random_uuid();
  v_signature   text;
  v_token       text;
  v_expires_at  timestamptz;
  v_email       text := lower(btrim(coalesce(p_email, '')));
begin
  select * into v_actor from doctors where id = auth.uid();
  if not found then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  if v_actor.role <> 'owner' and not is_platform_admin() then
    raise exception 'only a clinic owner can invite members'
      using errcode = 'insufficient_privilege';
  end if;

  if v_email = '' or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'a valid invite email is required' using errcode = 'check_violation';
  end if;

  if p_role not in ('doctor', 'staff') then
    raise exception 'an invite role must be doctor or staff' using errcode = 'check_violation';
  end if;

  if p_expires_in < interval '15 minutes' or p_expires_in > interval '30 days' then
    raise exception 'invite expiry must be between 15 minutes and 30 days'
      using errcode = 'check_violation';
  end if;

  select value into strict v_secret
  from app_private_settings
  where key = 'clinic_invite_hmac';

  v_signature := encode(
    hmac(convert_to(v_invite_id::text, 'UTF8'), v_secret, 'sha256'),
    'hex'
  );
  v_token := v_invite_id::text || '.' || v_signature;
  v_expires_at := now() + p_expires_in;

  insert into clinic_invites (
    id, clinic_id, email, role, token_digest, created_by, expires_at
  )
  values (
    v_invite_id,
    v_actor.clinic_id,
    v_email,
    p_role,
    digest(convert_to(v_token, 'UTF8'), 'sha256'),
    v_actor.id,
    v_expires_at
  );

  return query select v_invite_id, v_token, v_expires_at;
end;
$$;

revoke all on function issue_clinic_invite(text, clinic_role, interval) from public;
grant execute on function issue_clinic_invite(text, clinic_role, interval) to authenticated;

-- The old trigger trusted raw_user_meta_data.clinic_id, which is set by the
-- signing-up browser. The replacement ignores that field entirely. Membership
-- is granted only by a valid HMAC token bound to the same email, locked and
-- consumed in the transaction that creates the doctor row.
create or replace function handle_new_doctor()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_clinic_id       uuid;
  v_full_name       text;
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
  v_invite_token := nullif(btrim(new.raw_user_meta_data ->> 'invite_token'), '');

  if v_invite_token is null then
    insert into clinics (name, timezone)
    values (v_full_name || '''s Clinic', 'Asia/Kolkata')
    returning id into v_clinic_id;
    v_role := 'owner';
  else
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

    select * into v_invite
    from clinic_invites
    where id = v_invite_id
    for update;

    if not found
       or v_invite.consumed_at is not null
       or v_invite.expires_at <= now()
       or v_invite.email <> lower(btrim(coalesce(new.email, ''))) then
      raise exception 'invalid or expired clinic invitation'
        using errcode = 'invalid_authorization_specification';
    end if;

    select value into strict v_secret
    from app_private_settings
    where key = 'clinic_invite_hmac';

    v_expected := encode(
      hmac(convert_to(v_invite.id::text, 'UTF8'), v_secret, 'sha256'),
      'hex'
    );

    if v_signature <> v_expected
       or digest(convert_to(v_invite_token, 'UTF8'), 'sha256') <> v_invite.token_digest then
      raise exception 'invalid clinic invitation'
        using errcode = 'invalid_authorization_specification';
    end if;

    v_clinic_id := v_invite.clinic_id;
    v_role := v_invite.role;
  end if;

  insert into doctors (id, clinic_id, full_name, role, dictation_langs)
  values (new.id, v_clinic_id, v_full_name, v_role, array['hi-IN', 'en-IN'])
  on conflict (id) do nothing;

  if v_invite_token is not null then
    update clinic_invites
       set consumed_at = now(),
           consumed_by = new.id
     where id = v_invite.id
       and consumed_at is null;

    if not found then
      raise exception 'clinic invitation was already used'
        using errcode = 'invalid_authorization_specification';
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Internal validation and prescription replacement
-- ---------------------------------------------------------------------------

create or replace function replace_prescription_items_internal(
  p_encounter_id uuid,
  p_clinic_id uuid,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'prescription must be an array' using errcode = 'check_violation';
  end if;

  if jsonb_array_length(p_items) > 100 then
    raise exception 'a prescription cannot contain more than 100 items'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) item
    where jsonb_typeof(item) <> 'object'
       or not (item ? 'drug_name')
       or jsonb_typeof(item -> 'drug_name') <> 'string'
       or nullif(btrim(item ->> 'drug_name'), '') is null
       or (item ? 'strength' and jsonb_typeof(item -> 'strength') not in ('string', 'null'))
       or (item ? 'form' and jsonb_typeof(item -> 'form') not in ('string', 'null'))
       or (item ? 'frequency_spoken' and jsonb_typeof(item -> 'frequency_spoken') not in ('string', 'null'))
       or (item ? 'frequency_code' and jsonb_typeof(item -> 'frequency_code') not in ('string', 'null'))
       or (item ? 'frequency_label' and jsonb_typeof(item -> 'frequency_label') not in ('string', 'null'))
       or (item ? 'duration' and jsonb_typeof(item -> 'duration') not in ('string', 'null'))
       or (item ? 'route' and jsonb_typeof(item -> 'route') not in ('string', 'null'))
       or (item ? 'instructions' and jsonb_typeof(item -> 'instructions') not in ('string', 'null'))
       or (item ? 'needs_review' and jsonb_typeof(item -> 'needs_review') not in ('boolean', 'null'))
       or (item ? 'corrected' and jsonb_typeof(item -> 'corrected') not in ('boolean', 'null'))
  ) then
    raise exception 'prescription contains an invalid item' using errcode = 'check_violation';
  end if;

  delete from prescription_items where encounter_id = p_encounter_id;

  insert into prescription_items (
    encounter_id,
    clinic_id,
    drug_name,
    strength,
    form,
    frequency_spoken,
    frequency_code,
    frequency_label,
    needs_review,
    duration,
    route,
    instructions,
    corrected,
    position
  )
  select
    p_encounter_id,
    p_clinic_id,
    left(btrim(item ->> 'drug_name'), 300),
    left(nullif(btrim(item ->> 'strength'), ''), 100),
    left(nullif(btrim(item ->> 'form'), ''), 80),
    left(nullif(btrim(item ->> 'frequency_spoken'), ''), 160),
    left(nullif(btrim(item ->> 'frequency_code'), ''), 40),
    left(nullif(btrim(item ->> 'frequency_label'), ''), 160),
    coalesce((item ->> 'needs_review')::boolean, false),
    left(nullif(btrim(item ->> 'duration'), ''), 160),
    left(nullif(btrim(item ->> 'route'), ''), 80),
    left(nullif(btrim(item ->> 'instructions'), ''), 500),
    coalesce((item ->> 'corrected')::boolean, false),
    (ordinality - 1)::int
  from jsonb_array_elements(p_items) with ordinality as rows(item, ordinality);
end;
$$;

revoke all on function replace_prescription_items_internal(uuid, uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Narrow mutation workflows
-- ---------------------------------------------------------------------------

create or replace function create_transcript_workflow(
  p_id uuid,
  p_audio_path text,
  p_audio_mime text,
  p_duration_ms int,
  p_provider stt_provider,
  p_model text,
  p_language_hint text,
  p_language_code text,
  p_confidence real,
  p_degraded boolean,
  p_raw_text text,
  p_roman_text text,
  p_live_text text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doctor doctors%rowtype;
begin
  select * into v_doctor from doctors where id = auth.uid();
  if not found then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  if p_id is null or nullif(btrim(p_raw_text), '') is null then
    raise exception 'a transcript id and text are required' using errcode = 'check_violation';
  end if;
  if length(p_raw_text) > 100000 or length(coalesce(p_live_text, '')) > 100000 then
    raise exception 'transcript text is too long' using errcode = 'check_violation';
  end if;
  if p_duration_ms is not null and (p_duration_ms < 0 or p_duration_ms > 300000) then
    raise exception 'transcript duration is invalid' using errcode = 'check_violation';
  end if;
  if p_confidence is not null and (p_confidence < 0 or p_confidence > 1) then
    raise exception 'transcript confidence is invalid' using errcode = 'check_violation';
  end if;
  if p_audio_path is not null
     and p_audio_path not like v_doctor.clinic_id::text || '/' || v_doctor.id::text || '/%' then
    raise exception 'audio path is outside the caller''s clinic folder'
      using errcode = 'insufficient_privilege';
  end if;

  insert into transcripts (
    id, clinic_id, doctor_id, audio_path, audio_mime, duration_ms,
    provider, model, language_hint, language_code, confidence, degraded,
    raw_text, roman_text, live_text
  )
  values (
    p_id, v_doctor.clinic_id, v_doctor.id, p_audio_path,
    left(nullif(btrim(p_audio_mime), ''), 160), p_duration_ms,
    p_provider, left(nullif(btrim(p_model), ''), 160),
    left(nullif(btrim(p_language_hint), ''), 40),
    left(nullif(btrim(p_language_code), ''), 40), p_confidence,
    coalesce(p_degraded, false), p_raw_text,
    left(nullif(p_roman_text, ''), 100000), left(nullif(p_live_text, ''), 100000)
  );

  return p_id;
end;
$$;

revoke all on function create_transcript_workflow(uuid, text, text, int, stt_provider, text, text, text, real, boolean, text, text, text) from public;
grant execute on function create_transcript_workflow(uuid, text, text, int, stt_provider, text, text, text, real, boolean, text, text, text) to authenticated;

create or replace function save_extracted_draft(
  p_encounter_id uuid,
  p_transcript_id uuid,
  p_patient_name_spoken text,
  p_age_years int,
  p_diagnosis text,
  p_treatment text,
  p_fees_inr numeric,
  p_extracted_raw jsonb,
  p_low_confidence_fields text[],
  p_extraction_model text,
  p_extraction_confidence real,
  p_prescription jsonb
)
returns encounters
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doctor    doctors%rowtype;
  v_existing encounters%rowtype;
  v_result   encounters%rowtype;
begin
  select * into v_doctor from doctors where id = auth.uid();
  if not found then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  if p_age_years is not null and (p_age_years < 0 or p_age_years > 130) then
    raise exception 'age must be between 0 and 130' using errcode = 'check_violation';
  end if;
  if p_fees_inr is not null and (p_fees_inr < 0 or p_fees_inr > 1000000) then
    raise exception 'fees are invalid' using errcode = 'check_violation';
  end if;
  if p_extraction_confidence is not null
     and (p_extraction_confidence < 0 or p_extraction_confidence > 1) then
    raise exception 'extraction confidence is invalid' using errcode = 'check_violation';
  end if;

  if p_transcript_id is not null and not exists (
    select 1 from transcripts
    where id = p_transcript_id
      and clinic_id = v_doctor.clinic_id
      and doctor_id = v_doctor.id
  ) then
    raise exception 'transcript not found' using errcode = 'no_data_found';
  end if;

  select * into v_existing
  from encounters
  where id = p_encounter_id
  for update;

  if found then
    if v_existing.clinic_id <> v_doctor.clinic_id
       or v_existing.doctor_id <> v_doctor.id then
      raise exception 'draft not found' using errcode = 'no_data_found';
    end if;
    if v_existing.status <> 'draft' then
      raise exception 'only a draft can be extracted' using errcode = 'check_violation';
    end if;
    if v_existing.transcript_id is not null and p_transcript_id is null then
      raise exception 'an authoritative transcript is already attached'
        using errcode = 'serialization_failure';
    end if;

    update encounters
       set transcript_id          = coalesce(p_transcript_id, v_existing.transcript_id),
           patient_name_spoken    = left(nullif(btrim(p_patient_name_spoken), ''), 500),
           age_years              = p_age_years,
           diagnosis              = left(nullif(btrim(p_diagnosis), ''), 2000),
           treatment              = left(nullif(btrim(p_treatment), ''), 2000),
           fees_inr               = p_fees_inr,
           extracted_raw          = p_extracted_raw,
           low_confidence_fields  = coalesce(p_low_confidence_fields, '{}'),
           extraction_model       = left(nullif(btrim(p_extraction_model), ''), 160),
           extraction_confidence  = p_extraction_confidence
     where id = p_encounter_id
     returning * into v_result;
  else
    insert into encounters (
      id, clinic_id, doctor_id, transcript_id, status,
      patient_name_spoken, age_years, diagnosis, treatment, fees_inr,
      extracted_raw, low_confidence_fields, extraction_model,
      extraction_confidence
    )
    values (
      p_encounter_id, v_doctor.clinic_id, v_doctor.id, p_transcript_id, 'draft',
      left(nullif(btrim(p_patient_name_spoken), ''), 500), p_age_years,
      left(nullif(btrim(p_diagnosis), ''), 2000),
      left(nullif(btrim(p_treatment), ''), 2000), p_fees_inr,
      p_extracted_raw, coalesce(p_low_confidence_fields, '{}'),
      left(nullif(btrim(p_extraction_model), ''), 160), p_extraction_confidence
    )
    returning * into v_result;
  end if;

  perform replace_prescription_items_internal(
    p_encounter_id,
    v_doctor.clinic_id,
    coalesce(p_prescription, '[]'::jsonb)
  );

  return v_result;
end;
$$;

revoke all on function save_extracted_draft(uuid, uuid, text, int, text, text, numeric, jsonb, text[], text, real, jsonb) from public;
grant execute on function save_extracted_draft(uuid, uuid, text, int, text, text, numeric, jsonb, text[], text, real, jsonb) to authenticated;

create or replace function update_draft_workflow(
  p_encounter_id uuid,
  p_patch jsonb,
  p_prescription jsonb default null,
  p_expected_version int default null
)
returns encounters
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doctor       doctors%rowtype;
  v_existing     encounters%rowtype;
  v_result       encounters%rowtype;
  v_has_version  boolean;
  v_version      int;
begin
  select * into v_doctor from doctors where id = auth.uid();
  if not found then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'draft patch must be an object' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_patch) key
    where key not in ('patient_name_spoken', 'age_years', 'diagnosis', 'treatment', 'fees_inr')
  ) then
    raise exception 'draft patch contains a protected field' using errcode = 'check_violation';
  end if;
  if (p_patch ? 'patient_name_spoken' and jsonb_typeof(p_patch -> 'patient_name_spoken') not in ('string', 'null'))
     or (p_patch ? 'diagnosis' and jsonb_typeof(p_patch -> 'diagnosis') not in ('string', 'null'))
     or (p_patch ? 'treatment' and jsonb_typeof(p_patch -> 'treatment') not in ('string', 'null'))
     or (p_patch ? 'age_years' and jsonb_typeof(p_patch -> 'age_years') not in ('number', 'null'))
     or (p_patch ? 'fees_inr' and jsonb_typeof(p_patch -> 'fees_inr') not in ('number', 'null')) then
    raise exception 'draft patch contains an invalid value' using errcode = 'check_violation';
  end if;

  select * into v_existing
  from encounters
  where id = p_encounter_id
  for update;

  if not found
     or v_existing.clinic_id <> v_doctor.clinic_id
     or v_existing.doctor_id <> v_doctor.id then
    raise exception 'draft not found' using errcode = 'no_data_found';
  end if;
  if v_existing.status <> 'draft' then
    raise exception 'only a draft can be edited' using errcode = 'check_violation';
  end if;

  select exists (
    select 1 from pg_attribute
    where attrelid = 'public.encounters'::regclass
      and attname = 'draft_version'
      and not attisdropped
  ) into v_has_version;

  if v_has_version then
    execute 'select draft_version from public.encounters where id = $1'
      into v_version using p_encounter_id;
    if p_expected_version is not null and p_expected_version <> v_version then
      raise exception 'draft_version_conflict'
        using errcode = 'serialization_failure', detail = v_version::text;
    end if;
  elsif p_expected_version is not null and p_expected_version <> 1 then
    raise exception 'draft_version_conflict'
      using errcode = 'serialization_failure', detail = '1';
  end if;

  if p_patch ? 'age_years'
     and jsonb_typeof(p_patch -> 'age_years') = 'number'
     and ((p_patch ->> 'age_years')::numeric < 0 or (p_patch ->> 'age_years')::numeric > 130) then
    raise exception 'age must be between 0 and 130' using errcode = 'check_violation';
  end if;
  if p_patch ? 'fees_inr'
     and jsonb_typeof(p_patch -> 'fees_inr') = 'number'
     and ((p_patch ->> 'fees_inr')::numeric < 0 or (p_patch ->> 'fees_inr')::numeric > 1000000) then
    raise exception 'fees are invalid' using errcode = 'check_violation';
  end if;

  update encounters
     set patient_name_spoken = case when p_patch ? 'patient_name_spoken'
           then left(nullif(btrim(p_patch ->> 'patient_name_spoken'), ''), 500)
           else patient_name_spoken end,
         age_years = case when p_patch ? 'age_years'
           then case when jsonb_typeof(p_patch -> 'age_years') = 'null'
             then null else (p_patch ->> 'age_years')::int end
           else age_years end,
         diagnosis = case when p_patch ? 'diagnosis'
           then left(nullif(btrim(p_patch ->> 'diagnosis'), ''), 2000)
           else diagnosis end,
         treatment = case when p_patch ? 'treatment'
           then left(nullif(btrim(p_patch ->> 'treatment'), ''), 2000)
           else treatment end,
         fees_inr = case when p_patch ? 'fees_inr'
           then case when jsonb_typeof(p_patch -> 'fees_inr') = 'null'
             then null else (p_patch ->> 'fees_inr')::numeric end
           else fees_inr end,
         edited_by_doctor = case when p_patch = '{}'::jsonb
           then edited_by_doctor else true end
   where id = p_encounter_id
   returning * into v_result;

  if p_prescription is not null then
    perform replace_prescription_items_internal(
      p_encounter_id,
      v_doctor.clinic_id,
      p_prescription
    );
  end if;

  if v_has_version then
    execute 'update public.encounters set draft_version = draft_version + 1 where id = $1 returning *'
      into v_result using p_encounter_id;
  end if;

  return v_result;
end;
$$;

revoke all on function update_draft_workflow(uuid, jsonb, jsonb, int) from public;
grant execute on function update_draft_workflow(uuid, jsonb, jsonb, int) to authenticated;

create or replace function discard_draft_workflow(
  p_encounter_id uuid,
  p_expected_version int default null
)
returns encounters
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doctor       doctors%rowtype;
  v_existing     encounters%rowtype;
  v_result       encounters%rowtype;
  v_has_version  boolean;
  v_version      int;
begin
  select * into v_doctor from doctors where id = auth.uid();
  if not found then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  select * into v_existing from encounters where id = p_encounter_id for update;
  if not found
     or v_existing.clinic_id <> v_doctor.clinic_id
     or v_existing.doctor_id <> v_doctor.id then
    raise exception 'draft not found' using errcode = 'no_data_found';
  end if;
  if v_existing.status = 'committed' then
    raise exception 'committed visits cannot be discarded' using errcode = 'check_violation';
  end if;
  if v_existing.status = 'discarded' then
    return v_existing;
  end if;

  select exists (
    select 1 from pg_attribute
    where attrelid = 'public.encounters'::regclass
      and attname = 'draft_version'
      and not attisdropped
  ) into v_has_version;

  if v_has_version then
    execute 'select draft_version from public.encounters where id = $1'
      into v_version using p_encounter_id;
    if p_expected_version is not null and p_expected_version <> v_version then
      raise exception 'draft_version_conflict'
        using errcode = 'serialization_failure', detail = v_version::text;
    end if;
    execute $sql$update public.encounters
                   set status = 'discarded', draft_version = draft_version + 1
                 where id = $1 returning *$sql$
      into v_result using p_encounter_id;
  else
    update encounters set status = 'discarded'
    where id = p_encounter_id returning * into v_result;
  end if;

  return v_result;
end;
$$;

revoke all on function discard_draft_workflow(uuid, int) from public;
grant execute on function discard_draft_workflow(uuid, int) to authenticated;

create or replace function restore_discarded_draft_workflow(
  p_encounter_id uuid,
  p_expected_version int default null
)
returns encounters
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doctor       doctors%rowtype;
  v_existing     encounters%rowtype;
  v_result       encounters%rowtype;
  v_has_version  boolean;
  v_version      int;
begin
  select * into v_doctor from doctors where id = auth.uid();
  if not found then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  select * into v_existing from encounters where id = p_encounter_id for update;
  if not found
     or v_existing.clinic_id <> v_doctor.clinic_id
     or v_existing.doctor_id <> v_doctor.id then
    raise exception 'draft not found' using errcode = 'no_data_found';
  end if;
  if v_existing.status = 'draft' then
    return v_existing;
  end if;
  if v_existing.status <> 'discarded' then
    raise exception 'only a discarded draft can be restored' using errcode = 'check_violation';
  end if;

  select exists (
    select 1 from pg_attribute
    where attrelid = 'public.encounters'::regclass
      and attname = 'draft_version'
      and not attisdropped
  ) into v_has_version;

  if v_has_version then
    execute 'select draft_version from public.encounters where id = $1'
      into v_version using p_encounter_id;
    if p_expected_version is not null and p_expected_version <> v_version then
      raise exception 'draft_version_conflict'
        using errcode = 'serialization_failure', detail = v_version::text;
    end if;
    execute $sql$update public.encounters
                   set status = 'draft', draft_version = draft_version + 1
                 where id = $1 returning *$sql$
      into v_result using p_encounter_id;
  else
    update encounters set status = 'draft'
    where id = p_encounter_id returning * into v_result;
  end if;

  return v_result;
end;
$$;

revoke all on function restore_discarded_draft_workflow(uuid, int) from public;
grant execute on function restore_discarded_draft_workflow(uuid, int) to authenticated;

create or replace function update_doctor_profile_workflow(
  p_full_name text,
  p_registration_no text,
  p_speciality text,
  p_dictation_langs text[]
)
returns doctors
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result doctors%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if nullif(btrim(p_full_name), '') is null or length(p_full_name) > 120 then
    raise exception 'a valid full name is required' using errcode = 'check_violation';
  end if;
  if length(coalesce(p_registration_no, '')) > 80
     or length(coalesce(p_speciality, '')) > 100 then
    raise exception 'profile field is too long' using errcode = 'check_violation';
  end if;
  if coalesce(array_length(p_dictation_langs, 1), 0) = 0
     or not (p_dictation_langs <@ array['en-IN', 'hi-IN', 'pa-IN']::text[]) then
    raise exception 'unsupported dictation language' using errcode = 'check_violation';
  end if;

  update doctors
     set full_name = btrim(p_full_name),
         registration_no = nullif(btrim(p_registration_no), ''),
         speciality = nullif(btrim(p_speciality), ''),
         dictation_langs = array(select distinct unnest(p_dictation_langs))
   where id = auth.uid()
   returning * into v_result;

  if not found then
    raise exception 'doctor profile not found' using errcode = 'no_data_found';
  end if;
  return v_result;
end;
$$;

revoke all on function update_doctor_profile_workflow(text, text, text, text[]) from public;
grant execute on function update_doctor_profile_workflow(text, text, text, text[]) to authenticated;

create or replace function create_patient_workflow(
  p_full_name text,
  p_phone text default null,
  p_age_years int default null,
  p_sex text default null,
  p_abha_id text default null,
  p_notes text default null
)
returns patients
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doctor doctors%rowtype;
  v_result patients%rowtype;
begin
  select * into v_doctor from doctors where id = auth.uid();
  if not found then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if nullif(btrim(p_full_name), '') is null then
    raise exception 'a patient name is required' using errcode = 'check_violation';
  end if;
  if p_age_years is not null and (p_age_years < 0 or p_age_years > 130) then
    raise exception 'age must be between 0 and 130' using errcode = 'check_violation';
  end if;

  insert into patients (
    clinic_id, full_name, phone, age_years, sex, abha_id, notes, created_by
  )
  values (
    v_doctor.clinic_id, left(btrim(p_full_name), 300),
    left(nullif(btrim(p_phone), ''), 40), p_age_years,
    left(nullif(btrim(p_sex), ''), 40), left(nullif(btrim(p_abha_id), ''), 80),
    left(nullif(btrim(p_notes), ''), 2000), v_doctor.id
  )
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function create_patient_workflow(text, text, int, text, text, text) from public;
grant execute on function create_patient_workflow(text, text, int, text, text, text) to authenticated;

create or replace function update_patient_workflow(p_patient_id uuid, p_patch jsonb)
returns patients
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doctor   doctors%rowtype;
  v_existing patients%rowtype;
  v_result   patients%rowtype;
begin
  select * into v_doctor from doctors where id = auth.uid();
  if not found then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'patient patch must be an object' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_patch) key
    where key not in ('full_name', 'phone', 'age_years', 'sex', 'abha_id', 'notes')
  ) then
    raise exception 'patient patch contains a protected field' using errcode = 'check_violation';
  end if;

  select * into v_existing from patients where id = p_patient_id for update;
  if not found or v_existing.clinic_id <> v_doctor.clinic_id then
    raise exception 'patient not found' using errcode = 'no_data_found';
  end if;

  if p_patch ? 'full_name'
     and (jsonb_typeof(p_patch -> 'full_name') <> 'string'
          or nullif(btrim(p_patch ->> 'full_name'), '') is null) then
    raise exception 'a patient name is required' using errcode = 'check_violation';
  end if;
  if (p_patch ? 'phone' and jsonb_typeof(p_patch -> 'phone') not in ('string', 'null'))
     or (p_patch ? 'sex' and jsonb_typeof(p_patch -> 'sex') not in ('string', 'null'))
     or (p_patch ? 'abha_id' and jsonb_typeof(p_patch -> 'abha_id') not in ('string', 'null'))
     or (p_patch ? 'notes' and jsonb_typeof(p_patch -> 'notes') not in ('string', 'null'))
     or (p_patch ? 'age_years' and jsonb_typeof(p_patch -> 'age_years') not in ('number', 'null')) then
    raise exception 'patient patch contains an invalid value' using errcode = 'check_violation';
  end if;
  if p_patch ? 'age_years'
     and jsonb_typeof(p_patch -> 'age_years') = 'number'
     and ((p_patch ->> 'age_years')::numeric < 0 or (p_patch ->> 'age_years')::numeric > 130) then
    raise exception 'age must be between 0 and 130' using errcode = 'check_violation';
  end if;

  update patients
     set full_name = case when p_patch ? 'full_name'
           then left(btrim(p_patch ->> 'full_name'), 300) else full_name end,
         phone = case when p_patch ? 'phone'
           then left(nullif(btrim(p_patch ->> 'phone'), ''), 40) else phone end,
         age_years = case when p_patch ? 'age_years'
           then case when jsonb_typeof(p_patch -> 'age_years') = 'null'
             then null else (p_patch ->> 'age_years')::int end
           else age_years end,
         sex = case when p_patch ? 'sex'
           then left(nullif(btrim(p_patch ->> 'sex'), ''), 40) else sex end,
         abha_id = case when p_patch ? 'abha_id'
           then left(nullif(btrim(p_patch ->> 'abha_id'), ''), 80) else abha_id end,
         notes = case when p_patch ? 'notes'
           then left(nullif(btrim(p_patch ->> 'notes'), ''), 2000) else notes end
   where id = p_patient_id
   returning * into v_result;

  return v_result;
end;
$$;

revoke all on function update_patient_workflow(uuid, jsonb) from public;
grant execute on function update_patient_workflow(uuid, jsonb) to authenticated;

create or replace function commit_encounter_workflow(
  p_encounter_id uuid,
  p_patient_id uuid default null,
  p_new_patient jsonb default null,
  p_idempotency_key text default null
)
returns table (
  encounter_id uuid,
  patient_id uuid,
  visit_number int,
  is_new_patient boolean,
  already_committed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doctor      doctors%rowtype;
  v_encounter   encounters%rowtype;
  v_holder      encounters%rowtype;
  v_patient     patients%rowtype;
  v_patient_id  uuid;
  v_prior       int;
  v_source      text;
  v_key         text := nullif(btrim(p_idempotency_key), '');
  v_name        text;
  v_phone       text;
  v_age         int;
  v_sex         text;
begin
  select * into v_doctor from doctors where id = auth.uid();
  if not found then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  select * into v_encounter from encounters where id = p_encounter_id for update;
  if not found
     or v_encounter.clinic_id <> v_doctor.clinic_id
     or v_encounter.doctor_id <> v_doctor.id then
    raise exception 'encounter not found' using errcode = 'no_data_found';
  end if;

  if v_encounter.status = 'committed' then
    return query select v_encounter.id, v_encounter.patient_id,
      v_encounter.visit_number, v_encounter.is_new_patient, true;
    return;
  end if;
  if v_encounter.status <> 'draft' then
    raise exception 'only a draft can be committed' using errcode = 'check_violation';
  end if;

  v_source := coalesce(to_jsonb(v_encounter) ->> 'capture_source', 'voice');
  if v_source = 'voice' and v_encounter.transcript_id is null then
    raise exception 'voice encounter is still provisional'
      using errcode = 'check_violation';
  end if;

  if v_key is not null and length(v_key) > 160 then
    raise exception 'idempotency key is too long' using errcode = 'check_violation';
  end if;

  if v_key is not null and v_encounter.idempotency_key is distinct from v_key then
    begin
      update encounters set idempotency_key = v_key where id = v_encounter.id;
      v_encounter.idempotency_key := v_key;
    exception when unique_violation then
      select * into v_holder
      from encounters
      where doctor_id = v_doctor.id and idempotency_key = v_key;

      if found and v_holder.status = 'committed' then
        return query select v_holder.id, v_holder.patient_id,
          v_holder.visit_number, v_holder.is_new_patient, true;
        return;
      end if;

      raise exception 'encounter commit is already in progress'
        using errcode = 'serialization_failure';
    end;
  end if;

  if (p_patient_id is null) = (p_new_patient is null) then
    raise exception 'choose exactly one existing or new patient'
      using errcode = 'check_violation';
  end if;

  if p_patient_id is not null then
    select * into v_patient
    from patients
    where id = p_patient_id and clinic_id = v_doctor.clinic_id
    for update;
    if not found then
      raise exception 'patient not found' using errcode = 'no_data_found';
    end if;
    v_patient_id := v_patient.id;
  else
    if jsonb_typeof(p_new_patient) <> 'object' then
      raise exception 'new patient must be an object' using errcode = 'check_violation';
    end if;
    if exists (
      select 1 from jsonb_object_keys(p_new_patient) key
      where key not in ('full_name', 'phone', 'age_years', 'sex')
    ) then
      raise exception 'new patient contains a protected field' using errcode = 'check_violation';
    end if;
    if (p_new_patient ? 'full_name' and jsonb_typeof(p_new_patient -> 'full_name') not in ('string', 'null'))
       or (p_new_patient ? 'phone' and jsonb_typeof(p_new_patient -> 'phone') not in ('string', 'null'))
       or (p_new_patient ? 'sex' and jsonb_typeof(p_new_patient -> 'sex') not in ('string', 'null'))
       or (p_new_patient ? 'age_years' and jsonb_typeof(p_new_patient -> 'age_years') not in ('number', 'null')) then
      raise exception 'new patient contains an invalid value' using errcode = 'check_violation';
    end if;

    v_name := coalesce(
      nullif(btrim(p_new_patient ->> 'full_name'), ''),
      nullif(btrim(v_encounter.patient_name_spoken), '')
    );
    if v_name is null then
      raise exception 'a patient name is required' using errcode = 'check_violation';
    end if;
    v_phone := left(nullif(btrim(p_new_patient ->> 'phone'), ''), 40);
    v_sex := left(nullif(btrim(p_new_patient ->> 'sex'), ''), 40);
    v_age := case
      when jsonb_typeof(p_new_patient -> 'age_years') = 'number'
        then (p_new_patient ->> 'age_years')::int
      else v_encounter.age_years
    end;
    if v_age is not null and (v_age < 0 or v_age > 130) then
      raise exception 'age must be between 0 and 130' using errcode = 'check_violation';
    end if;

    begin
      insert into patients (
        clinic_id, full_name, phone, age_years, sex, created_by
      )
      values (
        v_doctor.clinic_id, left(v_name, 300), v_phone, v_age, v_sex, v_doctor.id
      )
      returning id into v_patient_id;
    exception when unique_violation then
      -- A shared or mistyped number is not identity proof. The caller must show
      -- the existing chart and ask the clinician to select it explicitly.
      raise exception 'a patient with that phone already exists; choose the existing chart explicitly'
        using errcode = 'unique_violation', detail = 'duplicate_phone_requires_confirmation';
    end;
  end if;

  -- The patient row is already locked for an existing chart. A freshly inserted
  -- row is exclusively ours. Either way, concurrent commits cannot both assign
  -- the same next visit number.
  if p_patient_id is null then
    perform 1 from patients where id = v_patient_id for update;
  end if;

  select count(*) into v_prior
  from encounters e
  where e.patient_id = v_patient_id
    and e.status = 'committed'
    and e.id <> p_encounter_id;

  update encounters
     set patient_id = v_patient_id,
         status = 'committed',
         visit_number = v_prior + 1,
         is_new_patient = (v_prior = 0),
         committed_at = now()
   where id = p_encounter_id
   returning * into v_encounter;

  return query select v_encounter.id, v_patient_id, v_encounter.visit_number,
    v_encounter.is_new_patient, false;
end;
$$;

revoke all on function commit_encounter_workflow(uuid, uuid, jsonb, text) from public;
grant execute on function commit_encounter_workflow(uuid, uuid, jsonb, text) to authenticated;

-- The legacy function is security-invoker and can no longer mutate the table,
-- but revoking it makes the intended boundary explicit to PostgREST clients.
revoke all on function commit_encounter(uuid, uuid) from public, anon, authenticated;

-- Audio-retention cleanup still needs a narrow update path after table UPDATE
-- is revoked. The ids are intersected with the caller's clinic in the function.
create or replace function mark_audio_deleted(p_ids uuid[])
returns int
language sql
security definer
set search_path = public, pg_temp
as $$
  with caller as (
    select clinic_id from doctors where id = auth.uid()
  ), updated as (
    update transcripts t
       set audio_deleted_at = now(),
           audio_path = null
      from caller c
     where t.id = any(p_ids)
       and t.clinic_id = c.clinic_id
    returning 1
  )
  select count(*)::int from updated;
$$;

revoke all on function mark_audio_deleted(uuid[]) from public;
grant execute on function mark_audio_deleted(uuid[]) to authenticated;

-- `prune_rate_limits` predates this boundary and is SECURITY DEFINER. Leaving
-- its default PUBLIC execute privilege would let any signed-in client erase
-- every doctor's rate-limit buckets and then spend a fresh window. Cleanup is
-- an operator/service-role concern, never a browser RPC.
revoke all on function prune_rate_limits() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Audit coverage and explicit sensitive-read logging
-- ---------------------------------------------------------------------------

drop trigger if exists doctors_audit on doctors;
create trigger doctors_audit
  after insert or update on doctors
  for each row execute function record_audit();

drop trigger if exists transcripts_audit on transcripts;
create trigger transcripts_audit
  after insert or update or delete on transcripts
  for each row execute function record_audit();

drop trigger if exists prescription_items_audit on prescription_items;
create trigger prescription_items_audit
  after insert or update or delete on prescription_items
  for each row execute function record_audit();

drop trigger if exists clinic_invites_audit on clinic_invites;
create trigger clinic_invites_audit
  after insert or update or delete on clinic_invites
  for each row execute function record_audit();

create or replace function log_sensitive_access(
  p_action audit_action,
  p_entity text,
  p_entity_id uuid default null,
  p_detail jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doctor doctors%rowtype;
begin
  select * into v_doctor from doctors where id = auth.uid();
  if not found then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if p_action not in ('read', 'export') then
    raise exception 'only read and export access can be logged here'
      using errcode = 'check_violation';
  end if;
  if p_entity not in ('patient', 'encounter', 'transcript', 'audio', 'register', 'audit_log') then
    raise exception 'unsupported audit entity' using errcode = 'check_violation';
  end if;
  if octet_length(coalesce(p_detail::text, '')) > 4096 then
    raise exception 'audit detail is too large' using errcode = 'check_violation';
  end if;

  insert into audit_log (clinic_id, actor_id, action, entity, entity_id, detail)
  values (v_doctor.clinic_id, v_doctor.id, p_action, p_entity, p_entity_id, p_detail);
end;
$$;

revoke all on function log_sensitive_access(audit_action, text, uuid, jsonb) from public;
grant execute on function log_sensitive_access(audit_action, text, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Make clinical tables read-only to authenticated clients
-- ---------------------------------------------------------------------------

drop policy if exists doctors_self_update on doctors;
drop policy if exists patients_rw on patients;
drop policy if exists transcripts_rw on transcripts;
drop policy if exists encounters_rw on encounters;
drop policy if exists prescription_items_rw on prescription_items;

create policy patients_read on patients
  for select to authenticated using (clinic_id = auth_clinic_id());
create policy transcripts_read on transcripts
  for select to authenticated using (clinic_id = auth_clinic_id());
create policy encounters_read on encounters
  for select to authenticated using (clinic_id = auth_clinic_id());
create policy prescription_items_read on prescription_items
  for select to authenticated using (clinic_id = auth_clinic_id());

revoke insert, update, delete, truncate on table clinics from anon, authenticated;
revoke insert, update, delete, truncate on table doctors from anon, authenticated;
revoke insert, update, delete, truncate on table patients from anon, authenticated;
revoke insert, update, delete, truncate on table transcripts from anon, authenticated;
revoke insert, update, delete, truncate on table encounters from anon, authenticated;
revoke insert, update, delete, truncate on table prescription_items from anon, authenticated;
