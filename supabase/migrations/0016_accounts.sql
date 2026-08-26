-- docregister — dedicated financial ledger
--
-- Money no longer belongs to the clinical encounter. Existing committed fees
-- are migrated once into a doctor-scoped account ledger, then every legacy
-- encounter/amendment field is scrubbed and kept empty for compatibility with
-- older clients and migrations.

create table account_entries (
  id                 uuid primary key default gen_random_uuid(),
  clinic_id          uuid not null references clinics (id) on delete cascade,
  doctor_id          uuid not null references doctors (id) on delete restrict,
  patient_id         uuid references patients (id) on delete set null,
  encounter_id       uuid references encounters (id) on delete set null,
  kind               text not null,
  status             text not null default 'paid',
  amount_paise       bigint not null,
  currency           text not null default 'INR',
  category           text not null,
  payment_method     text,
  counterparty       text,
  note               text,
  source             text not null default 'manual',
  occurred_at        timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint account_entries_kind_check check (kind in ('income', 'expense')),
  constraint account_entries_status_check check (status in ('paid', 'pending')),
  constraint account_entries_amount_check check (amount_paise > 0 and amount_paise <= 100000000000),
  constraint account_entries_currency_check check (currency = 'INR'),
  constraint account_entries_category_check check (char_length(btrim(category)) between 1 and 120),
  constraint account_entries_payment_method_check check (
    payment_method is null or payment_method in ('cash', 'upi', 'card', 'bank_transfer', 'other')
  ),
  constraint account_entries_counterparty_check check (counterparty is null or char_length(counterparty) <= 300),
  constraint account_entries_note_check check (note is null or char_length(note) <= 2000),
  constraint account_entries_source_check check (char_length(btrim(source)) between 1 and 80),
  constraint account_entries_doctor_same_clinic
    foreign key (doctor_id, clinic_id) references doctors (id, clinic_id)
);

create index account_entries_doctor_occurred_idx
  on account_entries (doctor_id, occurred_at desc);
create index account_entries_doctor_status_idx
  on account_entries (doctor_id, status, occurred_at desc);
create index account_entries_patient_idx
  on account_entries (patient_id, occurred_at desc)
  where patient_id is not null;
create unique index account_entries_legacy_encounter_idx
  on account_entries (encounter_id, source)
  where encounter_id is not null and source = 'legacy_visit_fee';
create unique index account_entries_manual_idempotency_idx
  on account_entries (doctor_id, source)
  where source like 'manual:%';

alter table account_entries enable row level security;

create policy account_entries_read_own on account_entries
  for select to authenticated
  using (clinic_id = auth_clinic_id() and doctor_id = auth.uid());

-- All mutations pass through the narrow workflows below. This keeps tenant,
-- owner, timestamps, and related-record checks out of browser control.
revoke insert, update, delete, truncate on table account_entries from anon, authenticated;
grant select on table account_entries to authenticated;

create trigger account_entries_audit
  after insert or update or delete on account_entries
  for each row execute function record_audit();

create or replace function touch_account_entry_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger account_entries_updated_at
  before update on account_entries
  for each row execute function touch_account_entry_updated_at();

create or replace function create_account_entry(
  p_kind text,
  p_status text,
  p_amount_paise bigint,
  p_category text,
  p_payment_method text default null,
  p_counterparty text default null,
  p_note text default null,
  p_occurred_at timestamptz default now(),
  p_patient_id uuid default null,
  p_encounter_id uuid default null,
  p_idempotency_key text default null
)
returns account_entries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doctor doctors%rowtype;
  v_entry account_entries%rowtype;
  v_source text := case
    when nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then 'manual'
    else 'manual:' || left(btrim(p_idempotency_key), 120)
  end;
begin
  select * into v_doctor from doctors where id = auth.uid();
  if not found then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  if p_kind not in ('income', 'expense') then
    raise exception 'invalid account entry kind' using errcode = 'check_violation';
  end if;
  if p_status not in ('paid', 'pending') then
    raise exception 'invalid account entry status' using errcode = 'check_violation';
  end if;
  if p_amount_paise is null or p_amount_paise <= 0 or p_amount_paise > 100000000000 then
    raise exception 'invalid account entry amount' using errcode = 'check_violation';
  end if;
  if nullif(btrim(coalesce(p_category, '')), '') is null then
    raise exception 'an account category is required' using errcode = 'check_violation';
  end if;
  if p_payment_method is not null
     and p_payment_method not in ('cash', 'upi', 'card', 'bank_transfer', 'other') then
    raise exception 'invalid payment method' using errcode = 'check_violation';
  end if;
  if p_occurred_at is null then
    raise exception 'an account date is required' using errcode = 'check_violation';
  end if;

  if p_patient_id is not null and not exists (
    select 1 from patients where id = p_patient_id and clinic_id = v_doctor.clinic_id
  ) then
    raise exception 'patient not found' using errcode = 'no_data_found';
  end if;
  if p_encounter_id is not null and not exists (
    select 1 from encounters
     where id = p_encounter_id
       and clinic_id = v_doctor.clinic_id
       and doctor_id = v_doctor.id
  ) then
    raise exception 'encounter not found' using errcode = 'no_data_found';
  end if;

  if v_source <> 'manual' then
    select * into v_entry
      from account_entries
     where doctor_id = v_doctor.id and source = v_source;
    if found then return v_entry; end if;
  end if;

  insert into account_entries (
    clinic_id, doctor_id, patient_id, encounter_id, kind, status,
    amount_paise, category, payment_method, counterparty, note, source, occurred_at
  ) values (
    v_doctor.clinic_id, v_doctor.id, p_patient_id, p_encounter_id, p_kind, p_status,
    p_amount_paise, left(btrim(p_category), 120), p_payment_method,
    left(nullif(btrim(coalesce(p_counterparty, '')), ''), 300),
    left(nullif(btrim(coalesce(p_note, '')), ''), 2000), v_source, p_occurred_at
  ) returning * into v_entry;

  return v_entry;
end;
$$;

revoke all on function create_account_entry(text, text, bigint, text, text, text, text, timestamptz, uuid, uuid, text) from public, anon;
grant execute on function create_account_entry(text, text, bigint, text, text, text, text, timestamptz, uuid, uuid, text) to authenticated;

create or replace function update_account_entry_status(
  p_entry_id uuid,
  p_status text
)
returns account_entries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entry account_entries%rowtype;
begin
  if p_status not in ('paid', 'pending') then
    raise exception 'invalid account entry status' using errcode = 'check_violation';
  end if;

  update account_entries
     set status = p_status
   where id = p_entry_id
     and clinic_id = auth_clinic_id()
     and doctor_id = auth.uid()
  returning * into v_entry;

  if not found then
    raise exception 'account entry not found' using errcode = 'no_data_found';
  end if;
  return v_entry;
end;
$$;

revoke all on function update_account_entry_status(uuid, text) from public, anon;
grant execute on function update_account_entry_status(uuid, text) to authenticated;

create or replace function account_entries_search(
  p_from timestamptz,
  p_to timestamptz,
  p_kind text default null,
  p_status text default null,
  p_query text default null,
  p_limit int default 100,
  p_offset int default 0
)
returns table (
  id uuid,
  kind text,
  status text,
  amount_paise bigint,
  currency text,
  category text,
  payment_method text,
  counterparty text,
  note text,
  patient_id uuid,
  encounter_id uuid,
  source text,
  occurred_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language sql
stable
security invoker
as $$
  with filtered as (
    select ae.*
      from account_entries ae
     where ae.doctor_id = auth.uid()
       and ae.clinic_id = auth_clinic_id()
       and ae.occurred_at >= p_from
       and ae.occurred_at < p_to
       and (p_kind is null or ae.kind = p_kind)
       and (p_status is null or ae.status = p_status)
       and (
         p_query is null or btrim(p_query) = ''
         or ae.category ilike '%' || btrim(p_query) || '%'
         or ae.counterparty ilike '%' || btrim(p_query) || '%'
         or ae.note ilike '%' || btrim(p_query) || '%'
         or ae.payment_method ilike '%' || btrim(p_query) || '%'
       )
  )
  select f.id, f.kind, f.status, f.amount_paise, f.currency, f.category,
    f.payment_method, f.counterparty, f.note, f.patient_id, f.encounter_id,
    f.source, f.occurred_at, f.created_at, f.updated_at, count(*) over ()
  from filtered f
  order by f.occurred_at desc, f.created_at desc
  limit least(greatest(p_limit, 1), 200)
  offset greatest(p_offset, 0);
$$;

create or replace function account_entries_summary(
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  received_paise bigint,
  pending_paise bigint,
  expenses_paise bigint,
  net_paise bigint
)
language sql
stable
security invoker
as $$
  select
    coalesce(sum(amount_paise) filter (where kind = 'income' and status = 'paid'), 0)::bigint,
    coalesce(sum(amount_paise) filter (where kind = 'income' and status = 'pending'), 0)::bigint,
    coalesce(sum(amount_paise) filter (where kind = 'expense' and status = 'paid'), 0)::bigint,
    (
      coalesce(sum(amount_paise) filter (where kind = 'income' and status = 'paid'), 0)
      - coalesce(sum(amount_paise) filter (where kind = 'expense' and status = 'paid'), 0)
    )::bigint
  from account_entries
  where doctor_id = auth.uid()
    and clinic_id = auth_clinic_id()
    and occurred_at >= p_from
    and occurred_at < p_to;
$$;

revoke all on function account_entries_search(timestamptz, timestamptz, text, text, text, int, int) from public, anon;
grant execute on function account_entries_search(timestamptz, timestamptz, text, text, text, int, int) to authenticated;
revoke all on function account_entries_summary(timestamptz, timestamptz) from public, anon;
grant execute on function account_entries_summary(timestamptz, timestamptz) to authenticated;

-- Preserve historical takings before sealing the old encounter field. The
-- latest amendment snapshot wins because it was the effective amount shown by
-- the app before this migration.
insert into account_entries (
  clinic_id, doctor_id, patient_id, encounter_id, kind, status, amount_paise,
  category, payment_method, counterparty, note, source, occurred_at
)
select
  e.clinic_id,
  e.doctor_id,
  e.patient_id,
  e.id,
  'income',
  'paid',
  round((case when a.has_fee then a.fees_inr else e.fees_inr end) * 100)::bigint,
  'Consultation',
  'other',
  coalesce(p.full_name, e.patient_name_spoken),
  'Imported from the legacy visit fee field',
  'legacy_visit_fee',
  e.occurred_at
from encounters e
left join patients p on p.id = e.patient_id
left join lateral (
  select true as has_fee, case
    when ea.after_values ->> 'fees_inr' ~ '^[0-9]+(\.[0-9]{1,2})?$'
      then (ea.after_values ->> 'fees_inr')::numeric
    else null
  end as fees_inr
  from encounter_amendments ea
  where ea.encounter_id = e.id and ea.after_values ? 'fees_inr'
  order by ea.revision desc
  limit 1
) a on true
where e.status = 'committed'
  and (case when a.has_fee then a.fees_inr else e.fees_inr end) > 0
on conflict do nothing;

-- Strip money from every clinical JSON surface as well as the compatibility
-- column. The ledger above is now the sole authoritative financial store.
-- Some pre-0013 committed rows intentionally remain outside the NOT VALID
-- provenance constraint. Updating an unrelated fee column would otherwise
-- make PostgreSQL re-check that constraint and abort this historical cleanup.
alter table encounters
  drop constraint if exists encounters_committed_has_provenance;

update encounters
   set fees_inr = null,
       extracted_raw = case
         when jsonb_typeof(extracted_raw) = 'object' then extracted_raw - 'fees_inr'
         else extracted_raw
       end,
       low_confidence_fields = array_remove(low_confidence_fields, 'fees_inr')
 where fees_inr is not null
    or (jsonb_typeof(extracted_raw) = 'object' and extracted_raw ? 'fees_inr')
    or 'fees_inr' = any(low_confidence_fields);

alter table encounters
  add constraint encounters_committed_has_provenance
  check (
    status <> 'committed'
    or capture_source = 'manual'
    or transcript_id is not null
  ) not valid;

drop trigger if exists encounter_amendments_append_only on encounter_amendments;

update encounter_amendments
   set before_values = before_values - 'fees_inr',
       after_values = after_values - 'fees_inr'
 where before_values ? 'fees_inr' or after_values ? 'fees_inr';

create trigger encounter_amendments_append_only
  before update or delete on encounter_amendments
  for each row execute function prevent_encounter_amendment_mutation();

create or replace function strip_encounter_financial_fields()
returns trigger
language plpgsql
as $$
begin
  new.fees_inr := null;
  if jsonb_typeof(new.extracted_raw) = 'object' then
    new.extracted_raw := new.extracted_raw - 'fees_inr';
  end if;
  new.low_confidence_fields := array_remove(coalesce(new.low_confidence_fields, '{}'), 'fees_inr');
  return new;
end;
$$;

create trigger encounters_no_financial_fields
  before insert or update on encounters
  for each row execute function strip_encounter_financial_fields();

alter table encounters
  add constraint encounters_fees_deprecated_empty check (fees_inr is null);

-- Fee-free application entry point. The legacy function remains callable only
-- as an implementation detail for compatibility with already-deployed clients.
create or replace function save_clinical_draft(
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
  p_prescription jsonb
)
returns encounters
language sql
security invoker
as $$
  select save_extracted_draft(
    p_encounter_id, p_transcript_id, p_patient_name_spoken, p_age_years,
    p_diagnosis, p_treatment, null, p_extracted_raw,
    p_low_confidence_fields, p_extraction_model, p_extraction_confidence,
    p_prescription
  );
$$;

revoke all on function save_clinical_draft(uuid, uuid, text, int, text, text, jsonb, text[], text, real, jsonb) from public, anon;
grant execute on function save_clinical_draft(uuid, uuid, text, int, text, text, jsonb, text[], text, real, jsonb) to authenticated;

create or replace function strip_amendment_financial_fields()
returns trigger
language plpgsql
as $$
begin
  new.before_values := new.before_values - 'fees_inr';
  new.after_values := new.after_values - 'fees_inr';
  return new;
end;
$$;

create trigger encounter_amendments_no_financial_fields
  before insert on encounter_amendments
  for each row execute function strip_amendment_financial_fields();

-- Register search now returns clinical rows and visit counts only.
drop function if exists register_search(uuid, timestamptz, text, text, integer, integer);
create function register_search(
  p_doctor_id uuid,
  p_from timestamptz,
  p_query text default null,
  p_status text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  occurred_at timestamptz,
  patient_id uuid,
  patient_name text,
  age_years int,
  diagnosis text,
  treatment text,
  is_new_patient boolean,
  visit_number int,
  status text,
  drugs text[],
  total_count bigint,
  committed_count bigint,
  draft_count bigint
)
language sql
stable
security invoker
as $$
  with base as (
    select e.id, e.occurred_at, e.patient_id,
      coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(e.patient_name_spoken), ''), 'Unnamed') as patient_name,
      e.age_years, e.diagnosis, e.treatment, e.is_new_patient, e.visit_number,
      e.status::text as status,
      coalesce(array_agg(pi.drug_name order by pi.position)
        filter (where pi.drug_name is not null), '{}'::text[]) as drugs
    from encounters e
    left join patients p on p.id = e.patient_id
    left join prescription_items pi on pi.encounter_id = e.id
    where e.doctor_id = auth.uid()
      and p_doctor_id = auth.uid()
      and e.occurred_at >= p_from
      and e.status in ('committed', 'draft')
    group by e.id, p.full_name
  ), filtered as (
    select * from base
    where (p_status is null or status = p_status)
      and (p_query is null or btrim(p_query) = ''
        or patient_name ilike '%' || btrim(p_query) || '%'
        or diagnosis ilike '%' || btrim(p_query) || '%'
        or treatment ilike '%' || btrim(p_query) || '%'
        or exists (select 1 from unnest(drugs) d where d ilike '%' || btrim(p_query) || '%'))
  ), metrics as (
    select count(*) as total_count,
      count(*) filter (where status = 'committed') as committed_count,
      count(*) filter (where status = 'draft') as draft_count
    from filtered
  )
  select f.id, f.occurred_at, f.patient_id, f.patient_name, f.age_years,
    f.diagnosis, f.treatment, f.is_new_patient, f.visit_number, f.status,
    f.drugs, m.total_count, m.committed_count, m.draft_count
  from filtered f cross join metrics m
  order by f.occurred_at desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;

drop function if exists register_totals(uuid, timestamptz, text);
create function register_totals(
  p_doctor_id uuid,
  p_from timestamptz,
  p_query text default null
)
returns table (total_count bigint, committed_count bigint, draft_count bigint)
language sql
stable
security invoker
as $$
  with base as (
    select e.status::text as status,
      coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(e.patient_name_spoken), ''), 'Unnamed') as patient_name,
      e.diagnosis, e.treatment,
      coalesce(array_agg(pi.drug_name order by pi.position)
        filter (where pi.drug_name is not null), '{}'::text[]) as drugs
    from encounters e
    left join patients p on p.id = e.patient_id
    left join prescription_items pi on pi.encounter_id = e.id
    where e.doctor_id = auth.uid() and p_doctor_id = auth.uid() and e.occurred_at >= p_from
      and e.status in ('committed', 'draft')
    group by e.id, p.full_name
  ), matched as (
    select * from base
    where p_query is null or btrim(p_query) = ''
      or patient_name ilike '%' || btrim(p_query) || '%'
      or diagnosis ilike '%' || btrim(p_query) || '%'
      or treatment ilike '%' || btrim(p_query) || '%'
      or exists (select 1 from unnest(drugs) d where d ilike '%' || btrim(p_query) || '%')
  )
  select count(*), count(*) filter (where status = 'committed'),
    count(*) filter (where status = 'draft')
  from matched;
$$;

drop function if exists clinic_daily_stats(date, date, uuid);
create function clinic_daily_stats(
  p_from date,
  p_to date,
  p_doctor_id uuid default null
)
returns table (
  day date,
  patient_count bigint,
  new_patients bigint,
  returning_patients bigint
)
language sql
stable
security invoker
as $$
  with days as (
    select generate_series(p_from, p_to, interval '1 day')::date as day
  )
  select d.day,
    count(e.id) as patient_count,
    count(e.id) filter (where e.is_new_patient) as new_patients,
    count(e.id) filter (where e.is_new_patient is false) as returning_patients
  from days d
  left join encounters e
    on (e.occurred_at at time zone 'Asia/Kolkata')::date = d.day
   and e.status = 'committed'
   and e.clinic_id = auth_clinic_id()
   and e.doctor_id = auth.uid()
  group by d.day
  order by d.day;
$$;

revoke all on function register_search(uuid, timestamptz, text, text, integer, integer) from public, anon;
grant execute on function register_search(uuid, timestamptz, text, text, integer, integer) to authenticated;
revoke all on function register_totals(uuid, timestamptz, text) from public, anon;
grant execute on function register_totals(uuid, timestamptz, text) to authenticated;
revoke all on function clinic_daily_stats(date, date, uuid) from public, anon;
grant execute on function clinic_daily_stats(date, date, uuid) to authenticated;

comment on table account_entries is
  'Doctor-scoped income and expense ledger. This is the sole authoritative financial store.';
comment on column encounters.fees_inr is
  'Deprecated compatibility column. Forced to null; use account_entries.';
