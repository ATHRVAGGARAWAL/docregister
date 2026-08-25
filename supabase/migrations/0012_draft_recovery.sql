-- Draft recovery and optimistic edits.
--
-- Drafts are deliberately recoverable: deleting one from the review surface
-- marks it discarded, rather than removing the transcript or the extraction.
-- The version is bumped by the draft API and lets a second tab report a
-- conflict instead of silently overwriting the doctor's newer edits.

alter table encounters
  add column if not exists draft_version integer not null default 1;

alter table encounters
  add constraint encounters_draft_version_sane
  check (draft_version > 0);

-- `register_search` originally returned only totals for the selected page
-- filter. Keep the page query, but expose the committed/draft totals needed by
-- the register header. The companion function below makes totals available
-- even when pagination requests an empty page.
drop function if exists register_search(uuid, timestamptz, text, text, integer, integer);

create or replace function register_search(
  p_doctor_id uuid,
  p_from      timestamptz,
  p_query     text default null,
  p_status    text default null,
  p_limit     int  default 50,
  p_offset    int  default 0
)
returns table (
  id                uuid,
  occurred_at       timestamptz,
  patient_id        uuid,
  patient_name      text,
  age_years         int,
  diagnosis         text,
  treatment         text,
  fees_inr          numeric,
  is_new_patient    boolean,
  visit_number      int,
  status            text,
  drugs             text[],
  total_count       bigint,
  total_fees        numeric,
  committed_count   bigint,
  committed_fees    numeric,
  draft_count       bigint,
  draft_fees        numeric
)
language sql
stable
security invoker
as $$
  with base as (
    select
      e.id, e.occurred_at, e.patient_id,
      coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(e.patient_name_spoken), ''), 'Unnamed') as patient_name,
      e.age_years, e.diagnosis, e.treatment, e.fees_inr,
      e.is_new_patient, e.visit_number, e.status::text as status,
      coalesce(array_agg(pi.drug_name order by pi.position)
        filter (where pi.drug_name is not null), '{}'::text[]) as drugs
    from encounters e
    left join patients p on p.id = e.patient_id
    left join prescription_items pi on pi.encounter_id = e.id
    where e.doctor_id = p_doctor_id
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
    select
      count(*) as total_count,
      coalesce(sum(fees_inr), 0) as total_fees,
      count(*) filter (where status = 'committed') as committed_count,
      coalesce(sum(fees_inr) filter (where status = 'committed'), 0) as committed_fees,
      count(*) filter (where status = 'draft') as draft_count,
      coalesce(sum(fees_inr) filter (where status = 'draft'), 0) as draft_fees
    from filtered
  )
  select f.id, f.occurred_at, f.patient_id, f.patient_name, f.age_years,
    f.diagnosis, f.treatment, f.fees_inr, f.is_new_patient, f.visit_number,
    f.status, f.drugs, m.total_count, m.total_fees, m.committed_count,
    m.committed_fees, m.draft_count, m.draft_fees
  from filtered f cross join metrics m
  order by f.occurred_at desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;

create or replace function register_totals(
  p_doctor_id uuid,
  p_from      timestamptz,
  p_query     text default null
)
returns table (
  total_count bigint,
  total_fees numeric,
  committed_count bigint,
  committed_fees numeric,
  draft_count bigint,
  draft_fees numeric
)
language sql
stable
security invoker
as $$
  with base as (
    select e.status::text as status, e.fees_inr,
      coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(e.patient_name_spoken), ''), 'Unnamed') as patient_name,
      e.diagnosis, e.treatment,
      coalesce(array_agg(pi.drug_name order by pi.position)
        filter (where pi.drug_name is not null), '{}'::text[]) as drugs
    from encounters e
    left join patients p on p.id = e.patient_id
    left join prescription_items pi on pi.encounter_id = e.id
    where e.doctor_id = p_doctor_id and e.occurred_at >= p_from
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
  select count(*), coalesce(sum(fees_inr), 0),
    count(*) filter (where status = 'committed'),
    coalesce(sum(fees_inr) filter (where status = 'committed'), 0),
    count(*) filter (where status = 'draft'),
    coalesce(sum(fees_inr) filter (where status = 'draft'), 0)
  from matched;
$$;
