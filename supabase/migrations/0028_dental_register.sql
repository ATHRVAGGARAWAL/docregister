-- docregister — put teeth in the register.
--
-- `register_search` returns the drugs of every visit and nothing about what was
-- actually done to a tooth, which for a dental practice is the wrong summary:
-- the question a dentist asks a list of visits is almost always "when did I
-- last touch that tooth", and today the register cannot answer it.
--
-- Adding a column to a `returns table` changes the function's return type, and
-- PostgreSQL will not let `create or replace` do that — hence a drop. A drop
-- also takes the grants and the `search_path` pin with it, and 0021 set that pin
-- with a standalone `alter function` (0021:184), so recreating without carrying
-- it inline would silently leave both functions unpinned. Written into the body
-- here for exactly that reason.
--
-- `register_totals` is untouched in behaviour but is dropped and recreated in
-- the same file, because its argument list is unchanged and its pin came from
-- the same `alter` block — leaving it alone would be correct, so it IS left
-- alone. Only `register_search` changes.

drop function if exists register_search(uuid, timestamptz, text, text, int, int);

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
  -- New. Pre-formatted "36 MO Composite" strings, built here rather than in the
  -- app so the register list and its CSV export cannot drift apart.
  procedures text[],
  total_count bigint,
  committed_count bigint,
  draft_count bigint,
  discarded_count bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with base as (
    select e.id, e.occurred_at, e.patient_id,
      coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(e.patient_name_spoken), ''), 'Unnamed') as patient_name,
      e.age_years, e.diagnosis, e.treatment, e.is_new_patient, e.visit_number,
      e.status::text as status,
      coalesce((
        select array_agg(pi.drug_name order by pi.position)
        from prescription_items pi
        where pi.encounter_id = e.id and pi.drug_name is not null
      ), '{}'::text[]) as drugs,
      -- Tooth first, then surfaces, then the procedure: the same order
      -- `procedureChip` uses in src/lib/dental/procedure.ts, because a dentist
      -- scanning this column is looking for the number.
      coalesce((
        select array_agg(
          btrim(
            concat_ws(' ',
              nullif(ep.tooth_fdi::text, ''),
              nullif(array_to_string(ep.surfaces, ''), ''),
              ep.procedure_name,
              case
                when ep.sitting_number is null then null
                when ep.total_sittings is null then '(' || ep.sitting_number || ')'
                else '(' || ep.sitting_number || '/' || ep.total_sittings || ')'
              end
            )
          )
          order by ep.position
        )
        from encounter_procedures ep
        where ep.encounter_id = e.id
      ), '{}'::text[]) as procedures
    from encounters e
    left join patients p on p.id = e.patient_id
    where e.doctor_id = auth.uid()
      and p_doctor_id = auth.uid()
      and e.occurred_at >= p_from
      and e.status in ('committed', 'draft', 'discarded')
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
        or exists (select 1 from unnest(drugs) d where d ilike '%' || btrim(p_query) || '%')
        -- Searching the procedure strings means a bare "36" finds every visit
        -- that touched that tooth, which is the single most useful query a
        -- dentist can run against a register and was impossible before.
        or exists (select 1 from unnest(procedures) pr where pr ilike '%' || btrim(p_query) || '%'))
  ), metrics as (
    select count(*) as total_count,
      count(*) filter (where status = 'committed') as committed_count,
      count(*) filter (where status = 'draft') as draft_count,
      count(*) filter (where status = 'discarded') as discarded_count
    from filtered
  )
  select f.id, f.occurred_at, f.patient_id, f.patient_name, f.age_years,
    f.diagnosis, f.treatment, f.is_new_patient, f.visit_number, f.status,
    f.drugs, f.procedures, m.total_count, m.committed_count, m.draft_count,
    m.discarded_count
  from filtered f cross join metrics m
  order by f.occurred_at desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;

revoke all on function register_search(uuid, timestamptz, text, text, integer, integer) from public, anon;
grant execute on function register_search(uuid, timestamptz, text, text, integer, integer) to authenticated;
