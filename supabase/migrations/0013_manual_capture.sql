-- docregister — manual capture is a first-class, explicitly sourced draft
--
-- A null transcript has two very different meanings: an intentional manual
-- visit, or a voice draft whose authoritative transcription has not finished.
-- `capture_source` makes that distinction enforceable rather than leaving it
-- as a UI convention.

alter table encounters
  add column if not exists capture_source text not null default 'voice';

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'encounters_capture_source_valid'
       and conrelid = 'encounters'::regclass
  ) then
    alter table encounters
      add constraint encounters_capture_source_valid
      check (capture_source in ('voice', 'manual'));
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'encounters_committed_has_provenance'
       and conrelid = 'encounters'::regclass
  ) then
    -- NOT VALID avoids making deployment depend on the quality of legacy rows,
    -- but PostgreSQL still enforces it for every new insert and update. A
    -- provisional voice draft therefore cannot be committed, while a manual
    -- draft is allowed to have no transcript by design.
    alter table encounters
      add constraint encounters_committed_has_provenance
      check (
        status <> 'committed'
        or capture_source = 'manual'
        or transcript_id is not null
      ) not valid;
  end if;
end;
$$;

comment on column encounters.capture_source is
  'How the clinical content entered the draft. Voice commits require a transcript; manual commits intentionally do not.';

-- Create the encounter and its prescription in one transaction. The caller
-- supplies clinical values only; doctor and clinic are derived from auth.uid()
-- under the same RLS-scoped session as every other clinical workflow.
create or replace function create_manual_draft(
  p_encounter_id uuid,
  p_values       jsonb,
  p_prescription jsonb default '[]'::jsonb
)
returns encounters
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid;
  v_encounter encounters;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  select clinic_id
    into v_clinic_id
    from doctors
   where id = auth.uid();

  if v_clinic_id is null then
    raise exception 'signed-in doctor was not found'
      using errcode = 'insufficient_privilege';
  end if;

  insert into encounters (
    id,
    clinic_id,
    doctor_id,
    capture_source,
    transcript_id,
    status,
    patient_name_spoken,
    age_years,
    diagnosis,
    treatment,
    fees_inr,
    low_confidence_fields,
    extracted_raw,
    edited_by_doctor
  )
  values (
    p_encounter_id,
    v_clinic_id,
    auth.uid(),
    'manual',
    null,
    'draft',
    nullif(btrim(p_values ->> 'patient_name'), ''),
    nullif(p_values ->> 'age_years', '')::int,
    nullif(btrim(p_values ->> 'diagnosis'), ''),
    nullif(btrim(p_values ->> 'treatment'), ''),
    nullif(p_values ->> 'fees_inr', '')::numeric,
    '{}',
    p_values || jsonb_build_object(
      'capture_source', 'manual',
      'prescription', coalesce(p_prescription, '[]'::jsonb),
      'uncertain_fields', '[]'::jsonb,
      'notes_for_doctor', null
    ),
    true
  )
  returning * into v_encounter;

  insert into prescription_items (
    encounter_id,
    clinic_id,
    position,
    drug_name,
    strength,
    form,
    frequency_spoken,
    frequency_code,
    frequency_label,
    needs_review,
    duration,
    route,
    instructions
  )
  select
    p_encounter_id,
    v_clinic_id,
    (entry.ordinality - 1)::int,
    btrim(entry.item ->> 'drug_name'),
    nullif(btrim(entry.item ->> 'strength'), ''),
    nullif(btrim(entry.item ->> 'form'), ''),
    nullif(btrim(entry.item ->> 'frequency_spoken'), ''),
    nullif(btrim(entry.item ->> 'frequency_code'), ''),
    nullif(btrim(entry.item ->> 'frequency_label'), ''),
    coalesce((entry.item ->> 'needs_review')::boolean, false),
    nullif(btrim(entry.item ->> 'duration'), ''),
    nullif(btrim(entry.item ->> 'route'), ''),
    nullif(btrim(entry.item ->> 'instructions'), '')
  from jsonb_array_elements(coalesce(p_prescription, '[]'::jsonb))
       with ordinality as entry(item, ordinality)
  where nullif(btrim(entry.item ->> 'drug_name'), '') is not null;

  return v_encounter;
end;
$$;

revoke all on function create_manual_draft(uuid, jsonb, jsonb) from public;
grant execute on function create_manual_draft(uuid, jsonb, jsonb) to authenticated;
