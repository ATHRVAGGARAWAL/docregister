-- docregister — initial schema
-- Multi-doctor clinic tenancy. All PHI is clinic-scoped and isolated at the
-- database via Row Level Security, so a leaked anon key cannot cross tenants.
--
-- Residency note: this project targets ABDM's Health Data Management Policy,
-- which requires personal health data to stay within India. Create the Supabase
-- project in the Mumbai (ap-south-1) region. The schema does not enforce this;
-- project placement does.

create extension if not exists "uuid-ossp";
create extension if not exists pg_trgm;      -- fuzzy patient-name matching
create extension if not exists unaccent;     -- name normalisation

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type encounter_status as enum (
  'draft',       -- extracted from voice, awaiting doctor confirmation
  'committed',   -- doctor confirmed; counts toward the register and analytics
  'discarded'    -- doctor rejected the extraction
);

create type clinic_role as enum ('owner', 'doctor', 'staff');

create type stt_provider as enum ('sarvam', 'elevenlabs', 'indicconformer', 'mock');

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------

create table clinics (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null,
  city         text,
  -- Every date bucket in this schema is computed `at time zone 'Asia/Kolkata'`,
  -- because "today's revenue" for a clinic that closes at 8pm must not roll over
  -- at 5:30am. Storing it makes that assumption explicit and gives a future
  -- non-IST clinic one column to change instead of six function bodies.
  timezone     text not null default 'Asia/Kolkata',
  created_at   timestamptz not null default now()
);

-- One row per authenticated user. `id` mirrors auth.users.id.
create table doctors (
  id             uuid primary key references auth.users (id) on delete cascade,
  clinic_id      uuid not null references clinics (id) on delete cascade,
  full_name      text not null,
  registration_no text,                       -- state medical council number
  speciality     text,
  role           clinic_role not null default 'doctor',
  -- Languages this doctor dictates in. Seeds the STT language hint.
  dictation_langs text[] not null default array['hi-IN', 'en-IN'],
  created_at     timestamptz not null default now()
);

create index doctors_clinic_idx on doctors (clinic_id);

-- ---------------------------------------------------------------------------
-- Patients
-- ---------------------------------------------------------------------------

-- Patient identity is the hardest part of a voice-first register: the only
-- identifier the doctor speaks is a name, and names are transcribed
-- inconsistently across languages and scripts. We store a normalised form and
-- fuzzy-match against it, but a match is only ever a *suggestion* — the doctor
-- confirms the patient in the review step before anything is committed.
create table patients (
  id              uuid primary key default uuid_generate_v4(),
  clinic_id       uuid not null references clinics (id) on delete cascade,
  full_name       text not null,
  -- lower(unaccent(full_name)) with whitespace collapsed; maintained by trigger.
  name_normalized text not null,
  phone           text,                       -- the only reliable disambiguator
  age_years       int,
  sex             text,
  abha_id         text,                       -- Ayushman Bharat Health Account, optional
  notes           text,
  -- Which doctor first entered this chart. Kept for audit, not for access
  -- control — the chart belongs to the clinic, so every doctor in it can read.
  created_by      uuid references doctors (id) on delete set null,
  first_seen_at   timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  constraint patients_age_sane check (age_years is null or (age_years >= 0 and age_years <= 130))
);

create index patients_clinic_idx on patients (clinic_id);
-- Trigram index powers the fuzzy name lookup that proposes match candidates.
create index patients_name_trgm_idx on patients using gin (name_normalized gin_trgm_ops);
-- Phone is the high-precision path; unique per clinic when present.
create unique index patients_clinic_phone_idx
  on patients (clinic_id, phone) where phone is not null;

create or replace function normalize_patient_name()
returns trigger
language plpgsql
as $$
begin
  new.name_normalized :=
    regexp_replace(lower(unaccent(coalesce(new.full_name, ''))), '\s+', ' ', 'g');
  new.name_normalized := btrim(new.name_normalized);
  return new;
end;
$$;

create trigger patients_normalize_name
  before insert or update of full_name on patients
  for each row execute function normalize_patient_name();

-- ---------------------------------------------------------------------------
-- Transcripts + audio
-- ---------------------------------------------------------------------------

-- The transcript of record is the *batch* result, not the live stream. The live
-- WebSocket transcript exists only to give the doctor feedback while speaking.
create table transcripts (
  id             uuid primary key default uuid_generate_v4(),
  clinic_id      uuid not null references clinics (id) on delete cascade,
  doctor_id      uuid not null references doctors (id) on delete cascade,
  -- Supabase Storage object path in the private `recordings` bucket.
  audio_path     text,
  audio_mime     text,
  duration_ms    int,
  provider       stt_provider not null,
  model          text,
  language_hint  text,
  -- BCP-47 tag the recogniser reported, e.g. 'hi-IN'. Code-mixed speech usually
  -- comes back as the matrix language, which is why it is a hint and not a fact.
  language_code  text,
  confidence     real,
  -- True when the primary engine failed and the fallback produced this text.
  -- Surfaced in the review sheet: the doctor should read a degraded transcript
  -- more carefully, not be told it is as good as the usual one.
  degraded       boolean not null default false,
  -- Raw provider output, shown verbatim to the doctor. Never overwritten by the
  -- LLM: the clinician must always be able to see what was actually said.
  raw_text       text not null,
  -- Romanised form (Sarvam `translit` mode) when available; easier to skim for
  -- a doctor reading code-mixed Hindi/Punjabi on a phone.
  roman_text     text,
  live_text      text,                        -- interim stream text, for debugging
  created_at     timestamptz not null default now()
);

create index transcripts_doctor_idx on transcripts (doctor_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Encounters (the daily register)
-- ---------------------------------------------------------------------------

create table encounters (
  id            uuid primary key default uuid_generate_v4(),
  clinic_id     uuid not null references clinics (id) on delete cascade,
  doctor_id     uuid not null references doctors (id) on delete cascade,
  patient_id    uuid references patients (id) on delete set null,
  transcript_id uuid references transcripts (id) on delete set null,

  status        encounter_status not null default 'draft',
  occurred_at   timestamptz not null default now(),

  -- The five fields the product extracts from speech.
  patient_name_spoken text,                   -- as transcribed, before matching
  age_years     int,
  diagnosis     text,
  treatment     text,
  fees_inr      numeric(10, 2),

  -- Denormalised at commit time so analytics never needs a correlated subquery.
  is_new_patient boolean,
  visit_number   int,

  -- Extraction provenance, for audit and for measuring model quality over time.
  extraction_model      text,
  extraction_confidence real,
  -- Fields the model was unsure about; drives the review UI's highlight state.
  low_confidence_fields text[] not null default '{}',
  -- Untouched model output, kept for audit even after the doctor edits.
  extracted_raw jsonb,
  edited_by_doctor boolean not null default false,

  -- Client-supplied UUID that makes the capture→commit pipeline idempotent:
  -- a retried upload cannot create a duplicate register entry.
  idempotency_key text,

  created_at    timestamptz not null default now(),
  committed_at  timestamptz,

  constraint encounters_fees_sane check (fees_inr is null or fees_inr >= 0),
  constraint encounters_age_sane  check (age_years is null or (age_years >= 0 and age_years <= 130)),
  -- A committed encounter must name a real patient.
  constraint encounters_committed_needs_patient
    check (status <> 'committed' or patient_id is not null)
);

create unique index encounters_idempotency_idx
  on encounters (doctor_id, idempotency_key) where idempotency_key is not null;

-- Primary analytics index: daily revenue and patient volume for a clinic.
create index encounters_clinic_day_idx
  on encounters (clinic_id, occurred_at desc) where status = 'committed';
-- Per-doctor register view.
create index encounters_doctor_day_idx
  on encounters (doctor_id, occurred_at desc) where status = 'committed';
-- Powers historical recall ("what did I prescribe X last time").
create index encounters_patient_time_idx
  on encounters (patient_id, occurred_at desc) where status = 'committed';
-- Drafts awaiting review, newest first.
create index encounters_pending_idx
  on encounters (doctor_id, created_at desc) where status = 'draft';

-- ---------------------------------------------------------------------------
-- Prescription line items
-- ---------------------------------------------------------------------------

-- `treatment` on the encounter is the free-text clinical narrative. This table
-- is the structured form, produced by the dosage normaliser. Indian dosage
-- shorthand (BD, TDS, SOS, 1-0-1) is never emitted reliably by any STT engine,
-- so it is parsed downstream rather than trusted from the transcript.
create table prescription_items (
  id           uuid primary key default uuid_generate_v4(),
  encounter_id uuid not null references encounters (id) on delete cascade,
  clinic_id    uuid not null references clinics (id) on delete cascade,
  drug_name    text not null,
  strength     text,          -- '500 mg'
  form         text,          -- 'tab' | 'cap' | 'syrup' | 'inj'
  -- Both forms are kept. `frequency_spoken` is what the doctor actually said,
  -- in whatever language ("do baar", "ਦੋ ਵਾਰ", "1-0-1"); `frequency_code` is the
  -- canonical code the rule table derived from it. Storing only the code would
  -- throw away the evidence, and storing only the speech would make the register
  -- unqueryable.
  frequency_spoken text,
  frequency_code   text,      -- 'OD' | 'BD' | 'TDS' | 'QID' | 'HS' | 'SOS' | …
  frequency_label  text,      -- display form, falls back to the spoken text
  -- The rule table did not recognise the spoken frequency. Flags the row in the
  -- review sheet; cleared the moment a doctor types the frequency themselves.
  needs_review boolean not null default false,
  duration     text,          -- '5 days'
  route        text,          -- 'PO' | 'IV' | 'IM' | 'topical'
  instructions text,          -- 'after food'
  -- True when the doctor corrected the parsed drug name. Feeds the per-doctor
  -- vocabulary bias list so the same mistake gets less likely over time.
  corrected    boolean not null default false,
  position     int not null default 0
);

create index prescription_items_encounter_idx on prescription_items (encounter_id, position);
-- Per-doctor prescribing frequency, used to seed STT vocabulary biasing.
create index prescription_items_drug_idx on prescription_items (clinic_id, drug_name);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

-- Resolves the caller's clinic once per statement. STABLE + a security-definer
-- read avoids the recursive-policy trap of selecting from `doctors` inside a
-- policy that is itself on `doctors`.
create or replace function auth_clinic_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select clinic_id from doctors where id = auth.uid();
$$;

alter table clinics            enable row level security;
alter table doctors            enable row level security;
alter table patients           enable row level security;
alter table transcripts        enable row level security;
alter table encounters         enable row level security;
alter table prescription_items enable row level security;

create policy clinic_read on clinics
  for select using (id = auth_clinic_id());

create policy doctors_read on doctors
  for select using (clinic_id = auth_clinic_id());
create policy doctors_self_update on doctors
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Clinical tables: full access within your own clinic, nothing outside it.
create policy patients_rw on patients
  for all using (clinic_id = auth_clinic_id())
  with check (clinic_id = auth_clinic_id());

create policy transcripts_rw on transcripts
  for all using (clinic_id = auth_clinic_id())
  with check (clinic_id = auth_clinic_id());

create policy encounters_rw on encounters
  for all using (clinic_id = auth_clinic_id())
  with check (clinic_id = auth_clinic_id());

create policy prescription_items_rw on prescription_items
  for all using (clinic_id = auth_clinic_id())
  with check (clinic_id = auth_clinic_id());

-- ---------------------------------------------------------------------------
-- Commit path
-- ---------------------------------------------------------------------------

-- Commits a reviewed draft. Assigns visit_number and is_new_patient inside the
-- same transaction that flips the status, so analytics can read those columns
-- directly instead of recomputing "was this their first visit" at query time.
create or replace function commit_encounter(p_encounter_id uuid, p_patient_id uuid)
returns encounters
language plpgsql
security invoker
as $$
declare
  v_prior int;
  v_row   encounters;
begin
  -- Serialise commits for one patient. `v_prior` is a read that decides a write,
  -- so without this lock two visits committed at the same moment can both read
  -- "3 prior" and both become visit 4. Locking the patient row rather than the
  -- encounter is what makes the count stable, and it only ever contends between
  -- two commits for the same person.
  perform 1 from patients where id = p_patient_id for update;

  select count(*) into v_prior
  from encounters
  where patient_id = p_patient_id
    and status = 'committed'
    and id <> p_encounter_id;

  update encounters
     set patient_id     = p_patient_id,
         status         = 'committed',
         visit_number   = v_prior + 1,
         is_new_patient = (v_prior = 0),
         committed_at   = now()
   where id = p_encounter_id
     and status = 'draft'
  returning * into v_row;

  if v_row.id is null then
    -- Not a draft. If it is already committed to this same patient, the caller
    -- is a retry — a double-tap on a slow connection — so return what the first
    -- call produced instead of failing. The API route catches most of these
    -- before they reach here; this closes the window where two requests pass
    -- that check simultaneously.
    select * into v_row
    from encounters
    where id = p_encounter_id
      and status = 'committed'
      and patient_id = p_patient_id;

    if v_row.id is null then
      raise exception 'encounter % is not a draft (already committed to another patient, discarded, or missing)',
        p_encounter_id;
    end if;
  end if;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Analytics
-- ---------------------------------------------------------------------------

-- One row per day in range, including days with no activity, so the dashboard
-- chart never has to fill gaps client-side.
create or replace function clinic_daily_stats(
  p_from date,
  p_to   date,
  p_doctor_id uuid default null
)
returns table (
  day            date,
  revenue_inr    numeric,
  patient_count  bigint,
  new_patients   bigint,
  returning_patients bigint
)
language sql
stable
security invoker
as $$
  with days as (
    select generate_series(p_from, p_to, interval '1 day')::date as day
  )
  select
    d.day,
    coalesce(sum(e.fees_inr), 0)                                   as revenue_inr,
    count(e.id)                                                    as patient_count,
    count(e.id) filter (where e.is_new_patient)                    as new_patients,
    count(e.id) filter (where e.is_new_patient is false)           as returning_patients
  from days d
  left join encounters e
    on (e.occurred_at at time zone 'Asia/Kolkata')::date = d.day
   and e.status = 'committed'
   and e.clinic_id = auth_clinic_id()
   and (p_doctor_id is null or e.doctor_id = p_doctor_id)
  group by d.day
  order by d.day;
$$;

-- Fuzzy patient lookup for the review step. Returns ranked candidates; the
-- caller must present them for confirmation rather than auto-selecting.
create or replace function match_patients(
  p_name  text,
  p_phone text default null,
  p_limit int default 5
)
returns table (
  id           uuid,
  full_name    text,
  phone        text,
  age_years    int,
  last_visit   timestamptz,
  visit_count  bigint,
  similarity   real
)
language sql
stable
security invoker
as $$
  select
    p.id,
    p.full_name,
    p.phone,
    p.age_years,
    max(e.occurred_at)                                   as last_visit,
    count(e.id) filter (where e.status = 'committed')    as visit_count,
    -- An exact phone match outranks any name similarity.
    case
      when p_phone is not null and p.phone = p_phone then 1.0::real
      else similarity(p.name_normalized,
                      btrim(regexp_replace(lower(unaccent(p_name)), '\s+', ' ', 'g')))
    end                                                  as similarity
  from patients p
  left join encounters e on e.patient_id = p.id
  where p.clinic_id = auth_clinic_id()
    and (
      (p_phone is not null and p.phone = p_phone)
      or p.name_normalized % btrim(regexp_replace(lower(unaccent(p_name)), '\s+', ' ', 'g'))
    )
  group by p.id, p.full_name, p.phone, p.age_years, p.name_normalized
  order by similarity desc, last_visit desc nulls last
  limit p_limit;
$$;

-- The doctor's own most-prescribed drugs. Sent to the STT engine as a
-- vocabulary hint — a full Indian formulary is far too large to bias with, but
-- the ~100 drugs a given doctor actually writes fits comfortably.
create or replace function doctor_top_drugs(p_doctor_id uuid, p_limit int default 60)
returns table (drug_name text, uses bigint)
language sql
stable
security invoker
as $$
  select pi.drug_name, count(*) as uses
  from prescription_items pi
  join encounters e on e.id = pi.encounter_id
  where e.doctor_id = p_doctor_id
    and e.clinic_id = auth_clinic_id()
  group by pi.drug_name
  order by uses desc
  limit p_limit;
$$;
