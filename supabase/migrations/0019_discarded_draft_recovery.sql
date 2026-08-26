-- Keep intentionally discarded drafts recoverable from the register.
--
-- The normal "All" view still contains only confirmed visits and drafts that
-- need review. Discarded drafts appear only when explicitly requested, so they
-- do not inflate clinical register totals or analytics.

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
  draft_count bigint,
  discarded_count bigint
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
      and e.status in ('committed', 'draft', 'discarded')
    group by e.id, p.full_name
  ), filtered as (
    select * from base
    where (
        (p_status is null and status in ('committed', 'draft'))
        or (p_status in ('committed', 'draft', 'discarded') and status = p_status)
      )
      and (p_query is null or btrim(p_query) = ''
        or patient_name ilike '%' || btrim(p_query) || '%'
        or diagnosis ilike '%' || btrim(p_query) || '%'
        or treatment ilike '%' || btrim(p_query) || '%'
        or exists (select 1 from unnest(drugs) d where d ilike '%' || btrim(p_query) || '%'))
  ), metrics as (
    select count(*) as total_count,
      count(*) filter (where status = 'committed') as committed_count,
      count(*) filter (where status = 'draft') as draft_count,
      count(*) filter (where status = 'discarded') as discarded_count
    from filtered
  )
  select f.id, f.occurred_at, f.patient_id, f.patient_name, f.age_years,
    f.diagnosis, f.treatment, f.is_new_patient, f.visit_number, f.status,
    f.drugs, m.total_count, m.committed_count, m.draft_count,
    m.discarded_count
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
returns table (
  total_count bigint,
  committed_count bigint,
  draft_count bigint,
  discarded_count bigint
)
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
    where e.doctor_id = auth.uid()
      and p_doctor_id = auth.uid()
      and e.occurred_at >= p_from
      and e.status in ('committed', 'draft', 'discarded')
    group by e.id, p.full_name
  ), matched as (
    select * from base
    where p_query is null or btrim(p_query) = ''
      or patient_name ilike '%' || btrim(p_query) || '%'
      or diagnosis ilike '%' || btrim(p_query) || '%'
      or treatment ilike '%' || btrim(p_query) || '%'
      or exists (select 1 from unnest(drugs) d where d ilike '%' || btrim(p_query) || '%')
  )
  select
    count(*) filter (where status in ('committed', 'draft')),
    count(*) filter (where status = 'committed'),
    count(*) filter (where status = 'draft'),
    count(*) filter (where status = 'discarded')
  from matched;
$$;

revoke all on function register_search(uuid, timestamptz, text, text, integer, integer) from public, anon;
grant execute on function register_search(uuid, timestamptz, text, text, integer, integer) to authenticated;
revoke all on function register_totals(uuid, timestamptz, text) from public, anon;
grant execute on function register_totals(uuid, timestamptz, text) to authenticated;
