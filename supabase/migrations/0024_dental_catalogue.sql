-- docregister — the dental procedure catalogue, and the one predicate every
-- tooth number in this database is checked against.
--
-- This is the first migration of the dental conversion. It adds no clinical
-- rows and changes no existing function, deliberately: everything here is
-- either a new type, a new immutable helper, or a new table with its own
-- policies, so it can be applied and inspected before anything that writes a
-- patient record depends on it.
--
-- ## Why a per-clinic catalogue rather than a shipped code list
--
-- Dentistry has no equivalent of a universally-used procedure code set in
-- Indian practice. There is no CDT, prices vary by an order of magnitude
-- between a small-town clinic and a metro one, and the procedure a clinic calls
-- "RCT molar" another calls "root canal — posterior". A fixed list would need a
-- code change every time a clinic offered something it did not anticipate,
-- which is the wrong failure mode for the table that also holds the prices a
-- quote is built from.
--
-- So each clinic owns its own list, seeded with a starter set so a new clinic
-- is not staring at an empty table on day one.

-- ---------------------------------------------------------------------------
-- What a procedure applies to
-- ---------------------------------------------------------------------------

-- Not every dental procedure is per-tooth, and pretending otherwise is the
-- first thing that breaks. Scaling is per-arch or full-mouth, an OPG is one
-- image of everything, a quadrant of fillings is billed as a quadrant. A schema
-- that demanded a tooth number for all of them would collect a fictional one.
create type dental_scope as enum ('tooth', 'quadrant', 'arch', 'full_mouth', 'other');

-- ---------------------------------------------------------------------------
-- FDI validity
-- ---------------------------------------------------------------------------

-- FDI two-digit notation is not a contiguous range, and this is the whole
-- reason the check is a function rather than `between 11 and 48`. That range
-- would accept 19, 20, 29, 30, 39, 40 and 49 — seven numbers inside the bounds
-- that are not teeth. A tooth number that passes validation and does not exist
-- is a filling recorded against nothing.
--
--   Quadrants 1–4 are permanent and hold positions 1–8.
--   Quadrants 5–8 are primary and hold positions 1–5 — a child has no
--   premolars, so there is no 56 or 76.
--
-- `immutable` is required, not stylistic: PostgreSQL will not accept a function
-- in a CHECK constraint unless it is immutable, and this one depends on nothing
-- but its argument. `search_path` is pinned even though the body reads no
-- table, because 0021 established that every function in this database carries
-- the pin rather than relying on the reader to work out which ones need it.
create or replace function is_fdi_tooth(p_tooth smallint)
returns boolean
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select p_tooth is null
      or (p_tooth / 10 between 1 and 4 and p_tooth % 10 between 1 and 8)
      or (p_tooth / 10 between 5 and 8 and p_tooth % 10 between 1 and 5);
$$;

comment on function is_fdi_tooth(smallint) is
  'FDI/ISO 3950 tooth validity. Null passes so the caller decides whether a tooth is required.';

-- ---------------------------------------------------------------------------
-- The catalogue
-- ---------------------------------------------------------------------------

create table procedure_catalogue (
  id                  uuid primary key default gen_random_uuid(),
  clinic_id           uuid not null references clinics (id) on delete cascade,

  -- Stable short code the clinic types and searches on, e.g. 'RCT_MOLAR'.
  code                text not null,
  name                text not null,
  default_scope       dental_scope not null default 'tooth',

  -- Paise, matching `account_entries.amount_paise`. Every amount in this
  -- database is an integer of paise; a numeric rupee column here would put a
  -- second money convention in the schema and a rounding argument in the quote.
  default_price_paise bigint not null default 0,

  -- How many visits this normally takes. Drives the sitting counter on a
  -- procedure and the planned sittings on a treatment plan item.
  default_sittings    smallint not null default 1,

  -- Deactivated rather than deleted: historical procedures reference this row.
  is_active           boolean not null default true,
  sort_order          int not null default 0,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- `record_audit()` reads `v_row.clinic_id` and `v_row.id` unconditionally
  -- (0004), so both must exist on any audited table or the trigger throws at
  -- runtime rather than at migration time.
  constraint procedure_catalogue_code_check
    check (char_length(btrim(code)) between 1 and 40),
  constraint procedure_catalogue_name_check
    check (char_length(btrim(name)) between 1 and 120),
  constraint procedure_catalogue_price_sane
    check (default_price_paise >= 0 and default_price_paise <= 100000000000),
  constraint procedure_catalogue_sittings_sane
    check (default_sittings between 1 and 60),

  -- Total, not partial on `is_active`. A deactivated code must not be reusable:
  -- historical rows snapshot the procedure's name but reference this id, so
  -- letting a clinic recreate 'RCT_MOLAR' as something else would make two
  -- different procedures share one code in the same clinic's history.
  constraint procedure_catalogue_code_unique unique (clinic_id, code),

  -- The composite key every child table's tenant-safety FK points at. This is
  -- the house pattern — see `follow_ups` in 0015 — and it is what makes a
  -- cross-clinic link fail at the constraint rather than at a policy.
  constraint procedure_catalogue_clinic_key unique (id, clinic_id)
);

create index procedure_catalogue_clinic_idx
  on procedure_catalogue (clinic_id, sort_order, name)
  where is_active;

create trigger procedure_catalogue_audit
  after insert or update or delete on procedure_catalogue
  for each row execute function record_audit();

create or replace function touch_procedure_catalogue_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger procedure_catalogue_updated_at
  before update on procedure_catalogue
  for each row execute function touch_procedure_catalogue_updated_at();

alter table procedure_catalogue enable row level security;

-- Clinic-wide read and write. The catalogue is a shared price list, not a
-- per-dentist one, and an associate who cannot see it cannot quote.
--
-- `(select auth_clinic_id())` rather than a bare call, per 0020: the scalar
-- subquery is evaluated once for the statement instead of once per row.
create policy procedure_catalogue_rw on procedure_catalogue
  for all using (clinic_id = (select auth_clinic_id()))
  with check (clinic_id = (select auth_clinic_id()));

-- ---------------------------------------------------------------------------
-- Seeding
-- ---------------------------------------------------------------------------

-- Seeded lazily, on first read, rather than at clinic creation.
--
-- The eager alternative means adding this call to `handle_new_doctor()`, whose
-- ~90-line SECURITY DEFINER body is re-declared at three separate
-- `insert into clinics` sites in 0023 — including the invite-HMAC branch. Every
-- one would have to be edited identically, and a copy error in that function is
-- a signup that half-works. The gain would be a catalogue that exists a few
-- milliseconds earlier, which nothing observes.
--
-- `on conflict do nothing` makes it safe when two tabs open the catalogue at
-- the same moment: the second insert finds the first one's rows and adds none.
create or replace function seed_clinic_procedure_catalogue(p_clinic_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into procedure_catalogue
    (clinic_id, code, name, default_scope, default_price_paise, default_sittings, sort_order)
  values
    -- Prices are plausible mid-range Indian private-practice figures and are
    -- meant to be edited. They are a starting point a clinic corrects in
    -- Settings, not a recommendation — which is why none of them is cited.
    (p_clinic_id, 'CONSULT',        'Consultation',                      'other',      30000,  1,  10),
    (p_clinic_id, 'XRAY_IOPA',      'X-ray — IOPA',                      'tooth',      20000,  1,  20),
    (p_clinic_id, 'XRAY_OPG',       'X-ray — OPG',                       'full_mouth', 80000,  1,  30),

    (p_clinic_id, 'SCALING',        'Scaling and polishing',             'full_mouth', 120000, 1, 100),
    (p_clinic_id, 'FLUORIDE',       'Fluoride application',              'full_mouth', 80000,  1, 110),
    (p_clinic_id, 'SEALANT',        'Pit and fissure sealant',           'tooth',      60000,  1, 120),

    (p_clinic_id, 'FILL_COMPOSITE', 'Composite restoration',             'tooth',      150000, 1, 200),
    (p_clinic_id, 'FILL_GIC',       'GIC restoration',                   'tooth',      100000, 1, 210),

    (p_clinic_id, 'PULPECTOMY',     'Pulpectomy (primary tooth)',        'tooth',      250000, 1, 300),
    (p_clinic_id, 'RCT_ANTERIOR',   'Root canal — anterior',             'tooth',      400000, 2, 310),
    (p_clinic_id, 'RCT_PREMOLAR',   'Root canal — premolar',             'tooth',      500000, 2, 320),
    (p_clinic_id, 'RCT_MOLAR',      'Root canal — molar',                'tooth',      650000, 3, 330),
    (p_clinic_id, 'POST_CORE',      'Post and core',                     'tooth',      350000, 1, 340),

    (p_clinic_id, 'CROWN_PFM',      'Crown — PFM',                       'tooth',      600000, 2, 400),
    (p_clinic_id, 'CROWN_ZIRCONIA', 'Crown — zirconia',                  'tooth',      1200000, 2, 410),

    (p_clinic_id, 'EXT_SIMPLE',     'Extraction — simple',               'tooth',      120000, 1, 500),
    (p_clinic_id, 'EXT_SURGICAL',   'Extraction — surgical',             'tooth',      350000, 1, 510),
    (p_clinic_id, 'EXT_THIRD_MOLAR','Extraction — third molar',          'tooth',      500000, 1, 520),

    (p_clinic_id, 'DENTURE_FULL',   'Complete denture',                  'arch',       1500000, 4, 600),
    (p_clinic_id, 'DENTURE_PARTIAL','Removable partial denture',         'arch',       800000, 3, 610),
    (p_clinic_id, 'IMPLANT',        'Implant',                           'tooth',      3500000, 3, 620),

    (p_clinic_id, 'ORTHO_METAL',    'Orthodontics — metal braces',       'full_mouth', 3500000, 24, 700),
    (p_clinic_id, 'ORTHO_CERAMIC',  'Orthodontics — ceramic braces',     'full_mouth', 5500000, 24, 710),
    (p_clinic_id, 'ORTHO_ALIGNER',  'Orthodontics — clear aligners',     'full_mouth', 15000000, 18, 720),

    (p_clinic_id, 'NIGHT_GUARD',    'Night guard',                       'full_mouth', 500000, 2, 800)
  on conflict (clinic_id, code) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Read path
-- ---------------------------------------------------------------------------

-- The catalogue, seeding it on first read if this clinic has none.
--
-- SECURITY DEFINER because it writes, and the caller's own policy is `for all`
-- — but the write is confined to the caller's own clinic, resolved from
-- `auth.uid()` here rather than taken as an argument, so there is no clinic id
-- for a caller to substitute.
create or replace function list_procedure_catalogue(p_include_inactive boolean default false)
returns setof procedure_catalogue
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid;
begin
  select clinic_id into v_clinic_id from doctors where id = auth.uid();
  if v_clinic_id is null then
    -- Not signed in, or signed in and not yet admitted to a clinic. Returning
    -- nothing is right either way; raising would make a pending doctor's
    -- settings screen an error rather than an empty list.
    return;
  end if;

  return query
    select *
    from procedure_catalogue
    where clinic_id = v_clinic_id
      and (p_include_inactive or is_active)
    order by sort_order, name;
end;
$$;

-- `stable` above is a claim this function does not modify the database, and the
-- seeding write would break it. So the seed is a separate, volatile call the
-- app makes once — not folded into the read. A `stable` function that writes is
-- accepted by PostgreSQL and then miscompiles under a query plan that calls it
-- fewer times than written.
create or replace function ensure_procedure_catalogue()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid;
begin
  select clinic_id into v_clinic_id from doctors where id = auth.uid();
  if v_clinic_id is null then
    return;
  end if;

  if not exists (select 1 from procedure_catalogue where clinic_id = v_clinic_id) then
    perform seed_clinic_procedure_catalogue(v_clinic_id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Exposure
-- ---------------------------------------------------------------------------
--
-- The 0017/0021 discipline: nothing reaches PostgREST that does not need to,
-- and `anon` reaches nothing at all. `0030` carries the full inventory; these
-- are set here so this file is correct on its own rather than briefly open
-- between migrations.

-- Internal. Called only from `ensure_procedure_catalogue`, which resolves the
-- clinic from `auth.uid()`. Exposed, it would take a clinic id as an argument
-- and write starter rows into any clinic in the database.
revoke execute on function seed_clinic_procedure_catalogue(uuid) from public, anon, authenticated;

-- A pure predicate over a smallint. It leaks nothing and is used in a check
-- constraint, but there is no reason for a browser to call it.
revoke execute on function is_fdi_tooth(smallint) from public, anon, authenticated;

-- Trigger function: picks up an EXECUTE grant simply by being created, per the
-- Supabase default privileges 0021 documents. Revoked for the same reason 0021
-- gives — it conveys nothing today and is one refactor away from doing so.
revoke execute on function touch_procedure_catalogue_updated_at() from public, anon, authenticated;

revoke execute on function list_procedure_catalogue(boolean) from public, anon;
grant execute on function list_procedure_catalogue(boolean) to authenticated;

revoke execute on function ensure_procedure_catalogue() from public, anon;
grant execute on function ensure_procedure_catalogue() to authenticated;
