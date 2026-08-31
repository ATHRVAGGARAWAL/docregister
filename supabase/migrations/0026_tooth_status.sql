-- docregister — what a procedure does to a tooth, so a chart can show the mouth
-- rather than a list of visits.
--
-- `encounter_procedures` records events: on this date, this was done to that
-- tooth. That is the right thing to store and the wrong thing to show. A
-- dentist opening a chart is asking "what is the state of this mouth" — which
-- teeth are missing, which are crowned, which have already had a root canal —
-- and answering that from raw events means reading every past visit.
--
-- ## Why the effect lives on the catalogue and not in application code
--
-- The obvious shortcut is a lookup in TypeScript: names containing "extraction"
-- make a tooth missing, names containing "crown" crown it. That works for
-- exactly as long as every clinic uses the starter list. The catalogue is
-- clinic-owned by design (0024) — a clinic will add "Extraction — retained
-- root" or rename things into Hindi — and the day it does, the shortcut stops
-- marking teeth as missing and nobody notices, because a chart that shows a
-- tooth as present looks perfectly normal.
--
-- So the clinic declares it. `tooth_effect` is a property of the procedure,
-- editable alongside its price, and an unrecognised custom procedure defaults
-- to `none`: it appears in the visit history and changes no tooth state. That
-- is the safe direction to fail. Showing nothing is recoverable; showing a
-- tooth as sound when it was extracted is not.

create type tooth_effect as enum (
  'none',         -- consultation, x-ray, advice: recorded, changes no state
  'restores',     -- filling. Accumulates surfaces.
  'root_treats',  -- RCT, pulpectomy
  'crowns',       -- crown, bridge abutment
  'extracts',     -- the tooth is gone
  'implants',     -- a fixture replaces a missing tooth
  'seals'         -- pit and fissure sealant
);

alter table procedure_catalogue
  add column tooth_effect tooth_effect not null default 'none';

comment on column procedure_catalogue.tooth_effect is
  'What this procedure does to the state of a tooth. Drives the derived chart; ''none'' is the safe default for a custom procedure.';

-- Backfill the starter list. Matched on `code` rather than `name`, because the
-- code is the stable identifier and a clinic may already have renamed a row.
update procedure_catalogue set tooth_effect = 'restores'
  where code in ('FILL_COMPOSITE', 'FILL_GIC');
update procedure_catalogue set tooth_effect = 'root_treats'
  where code in ('RCT_ANTERIOR', 'RCT_PREMOLAR', 'RCT_MOLAR', 'PULPECTOMY');
-- Post and core is part of the crown build-up and is what a crown seats on, so
-- on its own it leaves the tooth root-treated rather than crowned.
update procedure_catalogue set tooth_effect = 'root_treats'
  where code = 'POST_CORE';
update procedure_catalogue set tooth_effect = 'crowns'
  where code in ('CROWN_PFM', 'CROWN_ZIRCONIA');
update procedure_catalogue set tooth_effect = 'extracts'
  where code in ('EXT_SIMPLE', 'EXT_SURGICAL', 'EXT_THIRD_MOLAR');
update procedure_catalogue set tooth_effect = 'implants'
  where code = 'IMPLANT';
update procedure_catalogue set tooth_effect = 'seals'
  where code = 'SEALANT';

-- Everything else stays 'none' deliberately: consultation, both x-rays,
-- scaling, fluoride, dentures, orthodontics and a night guard are all real
-- procedures that do not change the state of an individual tooth. Dentures and
-- orthodontics act on an arch, which the chart shows through the visit history
-- rather than by recolouring thirty-two crowns.

-- ---------------------------------------------------------------------------
-- The seeder learns the effects
-- ---------------------------------------------------------------------------

-- Same signature, so `create or replace` keeps the revoke 0024 put on it. The
-- `search_path` pin is carried in the body rather than added by a later `alter`
-- — 0021's closing note records that `create or replace` silently drops an
-- `alter function ... set search_path`, so writing it inline is the only form
-- that survives a future edit to this function.
create or replace function seed_clinic_procedure_catalogue(p_clinic_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into procedure_catalogue
    (clinic_id, code, name, default_scope, default_price_paise, default_sittings, sort_order, tooth_effect)
  values
    (p_clinic_id, 'CONSULT',        'Consultation',                  'other',      30000,   1,  10, 'none'),
    (p_clinic_id, 'XRAY_IOPA',      'X-ray — IOPA',                  'tooth',      20000,   1,  20, 'none'),
    (p_clinic_id, 'XRAY_OPG',       'X-ray — OPG',                   'full_mouth', 80000,   1,  30, 'none'),

    (p_clinic_id, 'SCALING',        'Scaling and polishing',         'full_mouth', 120000,  1, 100, 'none'),
    (p_clinic_id, 'FLUORIDE',       'Fluoride application',          'full_mouth', 80000,   1, 110, 'none'),
    (p_clinic_id, 'SEALANT',        'Pit and fissure sealant',       'tooth',      60000,   1, 120, 'seals'),

    (p_clinic_id, 'FILL_COMPOSITE', 'Composite restoration',         'tooth',      150000,  1, 200, 'restores'),
    (p_clinic_id, 'FILL_GIC',       'GIC restoration',               'tooth',      100000,  1, 210, 'restores'),

    (p_clinic_id, 'PULPECTOMY',     'Pulpectomy (primary tooth)',    'tooth',      250000,  1, 300, 'root_treats'),
    (p_clinic_id, 'RCT_ANTERIOR',   'Root canal — anterior',         'tooth',      400000,  2, 310, 'root_treats'),
    (p_clinic_id, 'RCT_PREMOLAR',   'Root canal — premolar',         'tooth',      500000,  2, 320, 'root_treats'),
    (p_clinic_id, 'RCT_MOLAR',      'Root canal — molar',            'tooth',      650000,  3, 330, 'root_treats'),
    (p_clinic_id, 'POST_CORE',      'Post and core',                 'tooth',      350000,  1, 340, 'root_treats'),

    (p_clinic_id, 'CROWN_PFM',      'Crown — PFM',                   'tooth',      600000,  2, 400, 'crowns'),
    (p_clinic_id, 'CROWN_ZIRCONIA', 'Crown — zirconia',              'tooth',      1200000, 2, 410, 'crowns'),

    (p_clinic_id, 'EXT_SIMPLE',     'Extraction — simple',           'tooth',      120000,  1, 500, 'extracts'),
    (p_clinic_id, 'EXT_SURGICAL',   'Extraction — surgical',         'tooth',      350000,  1, 510, 'extracts'),
    (p_clinic_id, 'EXT_THIRD_MOLAR','Extraction — third molar',      'tooth',      500000,  1, 520, 'extracts'),

    (p_clinic_id, 'DENTURE_FULL',   'Complete denture',              'arch',       1500000, 4, 600, 'none'),
    (p_clinic_id, 'DENTURE_PARTIAL','Removable partial denture',     'arch',       800000,  3, 610, 'none'),
    (p_clinic_id, 'IMPLANT',        'Implant',                       'tooth',      3500000, 3, 620, 'implants'),

    (p_clinic_id, 'ORTHO_METAL',    'Orthodontics — metal braces',   'full_mouth', 3500000, 24, 700, 'none'),
    (p_clinic_id, 'ORTHO_CERAMIC',  'Orthodontics — ceramic braces', 'full_mouth', 5500000, 24, 710, 'none'),
    (p_clinic_id, 'ORTHO_ALIGNER',  'Orthodontics — clear aligners', 'full_mouth', 15000000, 18, 720, 'none'),

    (p_clinic_id, 'NIGHT_GUARD',    'Night guard',                   'full_mouth', 500000,  2, 800, 'none')
  on conflict (clinic_id, code) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- The read
-- ---------------------------------------------------------------------------

-- Every tooth-level procedure a patient has had, oldest first, carrying the
-- effect the catalogue declares.
--
-- Deliberately *not* the derived state. The precedence rules — an implant
-- restoring a tooth that an extraction removed, surfaces accumulating across
-- visits — are order-dependent logic that belongs where it can be unit-tested
-- against named cases, which is `src/lib/dental/tooth-status.ts`. This function
-- does the one thing SQL does better: the join and the ordering.
--
-- Only committed encounters. A draft is a suggestion until a dentist confirms
-- it, and a chart that turns a tooth grey because someone half-dictated an
-- extraction would break the rule the whole product is built on.
create or replace function patient_tooth_procedures(p_patient_id uuid)
returns table (
  encounter_id   uuid,
  occurred_at    timestamptz,
  tooth_fdi      smallint,
  surfaces       text[],
  procedure_name text,
  tooth_effect   tooth_effect,
  status         text,
  sitting_number smallint,
  total_sittings smallint
)
language sql
security invoker
stable
set search_path = public, pg_temp
as $$
  select
    e.id,
    e.occurred_at,
    p.tooth_fdi,
    p.surfaces,
    p.procedure_name,
    coalesce(c.tooth_effect, 'none'::tooth_effect),
    p.status,
    p.sitting_number,
    p.total_sittings
  from encounter_procedures p
  join encounters e on e.id = p.encounter_id
  left join procedure_catalogue c on c.id = p.catalogue_id
  where e.patient_id = p_patient_id
    and e.status = 'committed'
    and p.tooth_fdi is not null
  order by e.occurred_at, p.position;
$$;

revoke execute on function patient_tooth_procedures(uuid) from public, anon;
grant execute on function patient_tooth_procedures(uuid) to authenticated;
