-- docregister — what was done, to which tooth.
--
-- The dental counterpart of `prescription_items`, and deliberately its mirror
-- image: denormalised `clinic_id`, a `position` ordinal, no stable id across
-- saves, written by one internal function that replaces the whole set. A
-- dentist still prescribes drugs, so this sits beside that table rather than
-- replacing it — but for a dental visit this is the substance and the
-- prescription is the footnote.
--
-- ## Where this is written, and where it is not
--
-- Not at commit. `commit_encounter_workflow` (0011:1004) only flips `status`
-- and assigns `visit_number`/`is_new_patient`/`committed_at`; every clinical row
-- already exists by then, written at **draft save**. So nothing in the commit
-- path changes for this feature, and the rows are captured by the status flip
-- exactly as prescription lines are.
--
-- ## Why wrappers instead of new parameters on the draft writers
--
-- The obvious move is `+ p_procedures jsonb` on `save_extracted_draft`,
-- `update_draft_workflow` and friends. Adding a parameter changes the
-- signature, which means `drop function` → recreate → re-grant → re-revoke —
-- and recreating means retyping ~250 lines of SECURITY DEFINER body across five
-- functions, including `update_draft_workflow`'s `pg_attribute` probe and its
-- dynamic `execute` for `draft_version`. A transcription slip in any of them is
-- an auth check that quietly stops checking.
--
-- 0018 already set the alternative: `update_draft_with_consultation_fee_workflow`
-- extends the draft-save path by *delegating* to it and then doing its own
-- write. The wrappers below follow that precedent exactly. No existing function
-- body is touched, so no existing grant, revoke or `search_path` pin can be
-- lost — which is the failure 0021 spends a page warning about.
--
-- The cost is one extra RPC name per entry point, and a wrapper that calls a
-- wrapper on the fee path. That is a price worth paying to leave 0011 alone.

-- ---------------------------------------------------------------------------
-- Which arch
-- ---------------------------------------------------------------------------

-- A separate enum rather than reusing `quadrant`, because "upper" is not a
-- quadrant and encoding it as "1 or 2" would mean every reader of the column
-- has to know that convention. There are exactly two values and they are not
-- going to change.
create type dental_arch as enum ('upper', 'lower');

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------

create table encounter_procedures (
  id           uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references encounters (id) on delete cascade,
  clinic_id    uuid not null references clinics (id) on delete cascade,

  -- The catalogue entry this came from, and the name as it read at the time.
  --
  -- Both, not either. The id is what analytics group by and what a price is
  -- looked up through; the snapshot is what the record says a year later when
  -- the clinic has renamed "RCT molar" to something else. A record that
  -- silently re-words itself when a price list is edited is not a record.
  catalogue_id   uuid,
  procedure_name text not null,

  -- Where in the mouth. Exactly one of these three is set, decided by `scope`
  -- and enforced below — see `encounter_procedures_scope_consistent`.
  scope     dental_scope not null default 'tooth',
  tooth_fdi smallint,
  quadrant  smallint,
  arch      dental_arch,

  -- Crown surfaces, e.g. {M,O,D}. Only meaningful for a per-tooth procedure.
  surfaces text[] not null default '{}',

  -- Multi-sitting work. "RCT 36, second of three."
  sitting_number smallint,
  total_sittings smallint,

  -- The treatment-plan item this fulfils, when it came from a plan.
  --
  -- Nullable and deliberately un-FK'd here: `treatment_plan_items` does not
  -- exist until 0027, which adds the composite foreign key as `not valid` and
  -- then validates it — the same two-step 0013 uses for
  -- `encounters_committed_has_provenance`.
  plan_item_id uuid,

  status       text not null default 'completed',
  notes        text,

  -- The tooth reference could not be resolved from speech. Drives the review
  -- sheet's highlight, and is cleared the moment a dentist picks a tooth.
  needs_review boolean not null default false,

  position     int not null default 0,

  constraint encounter_procedures_name_check
    check (char_length(btrim(procedure_name)) between 1 and 160),
  constraint encounter_procedures_notes_check
    check (notes is null or char_length(notes) <= 1000),
  constraint encounter_procedures_status_check
    check (status in ('planned', 'in_progress', 'completed')),

  -- FDI validity, not a range. 0024 explains why `between 11 and 48` is wrong.
  constraint encounter_procedures_tooth_valid
    check (is_fdi_tooth(tooth_fdi)),
  constraint encounter_procedures_quadrant_valid
    check (quadrant is null or quadrant between 1 and 8),

  -- Exactly one location column per scope, and none where the scope has no
  -- location. Without this a row can claim to be a per-tooth procedure and
  -- carry no tooth, which is the shape that later renders as a filling on
  -- nothing.
  constraint encounter_procedures_scope_consistent check (
    case scope
      when 'tooth'    then tooth_fdi is not null and quadrant is null and arch is null
      when 'quadrant' then quadrant  is not null and tooth_fdi is null and arch is null
      when 'arch'     then arch      is not null and tooth_fdi is null and quadrant is null
      else tooth_fdi is null and quadrant is null and arch is null
    end
  ),

  -- Surfaces belong to a crown, so they are only meaningful on a tooth.
  constraint encounter_procedures_surfaces_scoped
    check (scope = 'tooth' or cardinality(surfaces) = 0),
  constraint encounter_procedures_surfaces_valid
    check (surfaces <@ array['M','O','I','D','B','F','L','P']::text[]),

  constraint encounter_procedures_sittings_sane check (
    (sitting_number is null or sitting_number between 1 and 60)
    and (total_sittings is null or total_sittings between 1 and 60)
    and (sitting_number is null or total_sittings is null or sitting_number <= total_sittings)
  ),

  -- Tenant safety at the constraint rather than at a policy, per 0011's note:
  -- a cross-clinic link fails here even under a definer function.
  constraint encounter_procedures_encounter_same_clinic
    foreign key (encounter_id, clinic_id) references encounters (id, clinic_id),
  constraint encounter_procedures_catalogue_same_clinic
    foreign key (catalogue_id, clinic_id) references procedure_catalogue (id, clinic_id)
);

-- Deduped in the database as well as the app: these arrays end up inside
-- amendment snapshots, and {M,O,M} versus {M,O} would make a no-op edit replay
-- as a change. A subquery is not allowed in a CHECK, so this is a table
-- constraint expressed as an immutable helper.
create or replace function surfaces_are_distinct(p_surfaces text[])
returns boolean
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select p_surfaces is null
      or cardinality(p_surfaces) = (select count(distinct s) from unnest(p_surfaces) s);
$$;

alter table encounter_procedures
  add constraint encounter_procedures_surfaces_distinct
  check (surfaces_are_distinct(surfaces));

-- Revoked like every other internal helper. A CHECK constraint keeps working
-- without the grant — PostgreSQL resolves the function when the constraint is
-- created, and every write to this table arrives through a SECURITY DEFINER
-- function anyway — so the grant buys the app nothing and would hand `anon` a
-- callable PostgREST endpoint. Same reasoning 0021 gives for the trigger
-- functions it revoked, and the same reasoning as `is_fdi_tooth` in 0024.
revoke execute on function surfaces_are_distinct(text[]) from public, anon, authenticated;

-- The only read this table serves: every procedure of one encounter, in order.
create index encounter_procedures_encounter_idx
  on encounter_procedures (encounter_id, position);

-- Tooth-level history for a patient's chart, and the register's tooth search.
create index encounter_procedures_tooth_idx
  on encounter_procedures (clinic_id, tooth_fdi)
  where tooth_fdi is not null;

create trigger encounter_procedures_audit
  after insert or update or delete on encounter_procedures
  for each row execute function record_audit();

alter table encounter_procedures enable row level security;

-- Read within your own clinic; every write goes through the internal writer.
-- This matches how `account_entries` is locked down in 0016 rather than how
-- `prescription_items` is: there is no reason for a browser to hold an insert
-- grant on a clinical table when one definer function owns the write path.
revoke insert, update, delete, truncate on encounter_procedures from anon, authenticated;

create policy encounter_procedures_read on encounter_procedures
  for select using (clinic_id = (select auth_clinic_id()));

-- ---------------------------------------------------------------------------
-- The writer
-- ---------------------------------------------------------------------------

-- A sibling of `replace_prescription_items_internal` (0011:320), not an
-- extension of it. The two validators have genuinely different shapes — one is
-- about drug names and frequencies, the other about tooth numbers and surfaces
-- — and widening the existing signature would ripple into 0021's inventory for
-- no benefit.
--
-- Same contract as its sibling: full replacement, `position` from array
-- ordinality so a client can never send it, every text field truncated on the
-- way in, and revoked from everyone so only another definer function can call
-- it.
create or replace function replace_procedure_items_internal(
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
    raise exception 'procedures must be an array' using errcode = 'check_violation';
  end if;

  if jsonb_array_length(p_items) > 100 then
    raise exception 'an encounter cannot contain more than 100 procedures'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) item
    where jsonb_typeof(item) <> 'object'
       or not (item ? 'procedure_name')
       or jsonb_typeof(item -> 'procedure_name') <> 'string'
       or nullif(btrim(item ->> 'procedure_name'), '') is null
       or (item ? 'catalogue_id' and jsonb_typeof(item -> 'catalogue_id') not in ('string', 'null'))
       or (item ? 'scope' and jsonb_typeof(item -> 'scope') not in ('string', 'null'))
       or (item ? 'tooth_fdi' and jsonb_typeof(item -> 'tooth_fdi') not in ('number', 'null'))
       or (item ? 'quadrant' and jsonb_typeof(item -> 'quadrant') not in ('number', 'null'))
       or (item ? 'arch' and jsonb_typeof(item -> 'arch') not in ('string', 'null'))
       or (item ? 'surfaces' and jsonb_typeof(item -> 'surfaces') not in ('array', 'null'))
       or (item ? 'sitting_number' and jsonb_typeof(item -> 'sitting_number') not in ('number', 'null'))
       or (item ? 'total_sittings' and jsonb_typeof(item -> 'total_sittings') not in ('number', 'null'))
       or (item ? 'status' and jsonb_typeof(item -> 'status') not in ('string', 'null'))
       or (item ? 'notes' and jsonb_typeof(item -> 'notes') not in ('string', 'null'))
       or (item ? 'needs_review' and jsonb_typeof(item -> 'needs_review') not in ('boolean', 'null'))
  ) then
    raise exception 'procedures contain an invalid item' using errcode = 'check_violation';
  end if;

  delete from encounter_procedures where encounter_id = p_encounter_id;

  insert into encounter_procedures (
    encounter_id,
    clinic_id,
    catalogue_id,
    procedure_name,
    scope,
    tooth_fdi,
    quadrant,
    arch,
    surfaces,
    sitting_number,
    total_sittings,
    status,
    notes,
    needs_review,
    position
  )
  select
    p_encounter_id,
    p_clinic_id,
    -- Looked up against the catalogue *and* this clinic. That join is the
    -- tenant check: an id belonging to another clinic resolves to null rather
    -- than linking across the boundary, and the composite FK would refuse it
    -- even if this missed.
    (
      select c.id
      from procedure_catalogue c
      where c.id = nullif(item ->> 'catalogue_id', '')::uuid
        and c.clinic_id = p_clinic_id
    ),
    left(btrim(item ->> 'procedure_name'), 160),
    coalesce(nullif(item ->> 'scope', '')::dental_scope, 'tooth'),
    (item ->> 'tooth_fdi')::smallint,
    (item ->> 'quadrant')::smallint,
    nullif(item ->> 'arch', '')::dental_arch,
    -- Deduped and ordered here as well as in the app, so a hand-made API call
    -- cannot store {M,O,M} and make a later no-op edit replay as a change.
    coalesce(
      (
        select array_agg(distinct upper(btrim(s.value)))
        from jsonb_array_elements_text(coalesce(item -> 'surfaces', '[]'::jsonb)) s(value)
        where nullif(btrim(s.value), '') is not null
      ),
      '{}'::text[]
    ),
    (item ->> 'sitting_number')::smallint,
    (item ->> 'total_sittings')::smallint,
    coalesce(nullif(btrim(item ->> 'status'), ''), 'completed'),
    left(nullif(btrim(item ->> 'notes'), ''), 1000),
    coalesce((item ->> 'needs_review')::boolean, false),
    (ordinality - 1)::int
  from jsonb_array_elements(p_items) with ordinality as rows(item, ordinality);
end;
$$;

revoke all on function replace_procedure_items_internal(uuid, uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Entry points
-- ---------------------------------------------------------------------------

-- Extraction-time draft save, plus procedures.
create or replace function save_dental_draft(
  p_encounter_id uuid,
  p_transcript_id uuid,
  p_patient_name_spoken text,
  p_age_years int,
  p_diagnosis text,
  p_treatment text,
  p_extracted_raw jsonb,
  p_low_confidence_fields text[],
  p_extraction_model text,
  p_extraction_confidence real,
  p_prescription jsonb,
  p_procedures jsonb default '[]'::jsonb
)
returns encounters
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_encounter encounters;
begin
  -- Delegate first: `save_clinical_draft` owns every auth and ownership check,
  -- and it stays the only place they are written.
  v_encounter := save_clinical_draft(
    p_encounter_id,
    p_transcript_id,
    p_patient_name_spoken,
    p_age_years,
    p_diagnosis,
    p_treatment,
    p_extracted_raw,
    p_low_confidence_fields,
    p_extraction_model,
    p_extraction_confidence,
    p_prescription
  );

  perform replace_procedure_items_internal(
    p_encounter_id,
    v_encounter.clinic_id,
    coalesce(p_procedures, '[]'::jsonb)
  );

  return v_encounter;
end;
$$;

revoke execute on function save_dental_draft(uuid, uuid, text, int, text, text, jsonb, text[], text, real, jsonb, jsonb) from public, anon;
grant execute on function save_dental_draft(uuid, uuid, text, int, text, text, jsonb, text[], text, real, jsonb, jsonb) to authenticated;

-- Autosave from the review sheet, plus procedures.
--
-- `p_procedures` follows `p_prescription`'s convention exactly: null means
-- "leave the existing rows alone", `[]` means "the dentist removed them all".
-- Collapsing those two would make every patch that does not mention procedures
-- silently delete them.
create or replace function update_dental_draft_workflow(
  p_encounter_id uuid,
  p_patch jsonb,
  p_prescription jsonb default null,
  p_expected_version int default null,
  p_consultation_fee_inr numeric default null,
  p_procedures jsonb default null
)
returns encounters
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_encounter encounters;
begin
  -- Through the fee wrapper rather than around it, so the fee path keeps
  -- working unchanged and there is still exactly one place the draft version is
  -- checked and bumped.
  v_encounter := update_draft_with_consultation_fee_workflow(
    p_encounter_id,
    p_patch,
    p_prescription,
    p_expected_version,
    p_consultation_fee_inr
  );

  if p_procedures is not null then
    perform replace_procedure_items_internal(
      p_encounter_id,
      v_encounter.clinic_id,
      p_procedures
    );
  end if;

  return v_encounter;
end;
$$;

revoke execute on function update_dental_draft_workflow(uuid, jsonb, jsonb, int, numeric, jsonb) from public, anon;
grant execute on function update_dental_draft_workflow(uuid, jsonb, jsonb, int, numeric, jsonb) to authenticated;

-- Manual (typed, not dictated) capture, plus procedures.
create or replace function create_manual_dental_draft(
  p_encounter_id uuid,
  p_values jsonb,
  p_prescription jsonb default '[]'::jsonb,
  p_procedures jsonb default '[]'::jsonb
)
returns encounters
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_encounter encounters;
begin
  v_encounter := create_manual_draft(p_encounter_id, p_values, p_prescription);

  perform replace_procedure_items_internal(
    p_encounter_id,
    v_encounter.clinic_id,
    coalesce(p_procedures, '[]'::jsonb)
  );

  return v_encounter;
end;
$$;

revoke execute on function create_manual_dental_draft(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function create_manual_dental_draft(uuid, jsonb, jsonb, jsonb) to authenticated;

comment on table encounter_procedures is
  'What was done, to which tooth. Written at draft save by replace_procedure_items_internal; the commit path does not touch it.';
