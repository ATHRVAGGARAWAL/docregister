-- docregister — search and total the register in Postgres, not after the fact
--
-- `/api/register` loaded up to 300 rows and then filtered them in JavaScript.
-- Two consequences, both silent:
--
--   * A search over a 90-day window only ever matched within the newest 300
--     encounters. In a busy clinic older visits simply were not findable, and
--     nothing said so — the result looked like "no such patient" rather than
--     "not searched". Same for the drafts filter.
--   * The workspace's headline rupee figure was summed from the returned page,
--     so it was the total of the first 300 visits presented as the total for
--     the period.
--
-- Filtering and totalling belong in the same query as the limit. `total_count`
-- and `total_fees` are window aggregates over the filtered set, so they describe
-- everything that matched, not the slice being displayed.
--
-- Security invoker: `encounters_rw` and `clinic_read` already scope every row to
-- the caller's clinic, and the explicit doctor filter narrows it further.

create or replace function register_search(
  p_doctor_id uuid,
  p_from      timestamptz,
  p_query     text default null,
  p_status    text default null,
  p_limit     int  default 200,
  p_offset    int  default 0
)
returns table (
  id             uuid,
  occurred_at    timestamptz,
  patient_id     uuid,
  patient_name   text,
  age_years      int,
  diagnosis      text,
  treatment      text,
  fees_inr       numeric,
  is_new_patient boolean,
  visit_number   int,
  status         text,
  drugs          text[],
  total_count    bigint,
  total_fees     numeric
)
language sql
stable
as $$
  with base as (
    select
      e.id,
      e.occurred_at,
      e.patient_id,
      -- The linked chart wins over the spoken name: the chart is what a human
      -- confirmed, the spoken name is what a recogniser heard.
      coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(e.patient_name_spoken), ''), 'Unnamed') as patient_name,
      e.age_years,
      e.diagnosis,
      e.treatment,
      e.fees_inr,
      e.is_new_patient,
      e.visit_number,
      e.status::text as status,
      coalesce(
        array_agg(pi.drug_name order by pi.position) filter (where pi.drug_name is not null),
        '{}'::text[]
      ) as drugs
    from encounters e
    left join patients p on p.id = e.patient_id
    left join prescription_items pi on pi.encounter_id = e.id
    where e.doctor_id = p_doctor_id
      and e.occurred_at >= p_from
      and e.status in ('committed', 'draft')
      and (p_status is null or e.status::text = p_status)
    group by e.id, p.full_name
  ),
  filtered as (
    select * from base
    where p_query is null
       or btrim(p_query) = ''
       or patient_name ilike '%' || btrim(p_query) || '%'
       or diagnosis    ilike '%' || btrim(p_query) || '%'
       or treatment    ilike '%' || btrim(p_query) || '%'
       or exists (
            select 1 from unnest(drugs) as d
            where d ilike '%' || btrim(p_query) || '%'
          )
  )
  select
    f.id, f.occurred_at, f.patient_id, f.patient_name, f.age_years,
    f.diagnosis, f.treatment, f.fees_inr, f.is_new_patient, f.visit_number,
    f.status, f.drugs,
    count(*)              over () as total_count,
    coalesce(sum(f.fees_inr) over (), 0) as total_fees
  from filtered f
  order by f.occurred_at desc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;
