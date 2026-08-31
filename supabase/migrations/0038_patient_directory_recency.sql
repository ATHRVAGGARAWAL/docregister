-- docregister — filter the patient directory by when someone was last seen.
--
-- The directory is a search, not a time window, and that is right for finding a
-- chart by name. It is wrong for the question a dental clinic asks every
-- evening — "who did we see today" — which today can only be answered by
-- reading the register and mapping visits back to charts by eye.
--
-- Filtered in SQL rather than in the browser, because the list is paginated
-- server-side: a client-side filter would narrow the fifty rows already
-- fetched and silently claim that was the whole answer. `total_count` is a
-- window aggregate over everything that matched, so it has to be computed after
-- the recency filter or the page would say "showing 3 of 214".
--
-- `p_since` is added at the END of the argument list with a default, so every
-- existing call site keeps working unchanged. A new parameter still changes the
-- signature, though, and a defaulted parameter creates an OVERLOAD rather than
-- replacing the function — PostgREST would then see two candidates for a
-- named-argument call and fail. Hence drop, recreate, and re-issue the grant.
--
-- 0021 pinned this function's `search_path` with a standalone `alter function`
-- (0021:181), and a drop takes that with it. Carried inline below.

drop function if exists list_patients(text, int, int);

create function list_patients(
  p_search text default null,
  p_limit  int  default 50,
  p_offset int  default 0,
  -- Null means no recency filter at all, which is the directory's original
  -- behaviour and stays the default. A chart with no committed visit is
  -- excluded whenever this is set: "seen since" is a claim about a visit, and a
  -- patient who has never been seen cannot satisfy it.
  p_since  timestamptz default null
)
returns table (
  id          uuid,
  full_name   text,
  phone       text,
  age_years   int,
  last_visit  timestamptz,
  visit_count bigint,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with q as (
    select
      nullif(btrim(regexp_replace(lower(unaccent(coalesce(p_search, ''))), '\s+', ' ', 'g')), '') as needle,
      case
        when p_search ~ '[[:alpha:]]' then null
        when length(regexp_replace(coalesce(p_search, ''), '\D', '', 'g')) >= 3
          then regexp_replace(coalesce(p_search, ''), '\D', '', 'g')
        else null
      end as digits
  ),
  probe as (
    select
      q.needle,
      q.digits,
      '%' || replace(replace(replace(q.needle, '\', '\\'), '%', '\%'), '_', '\_') || '%' as needle_like
    from q
  ),
  candidates as (
    select
      p.id,
      p.full_name,
      p.phone,
      p.age_years,
      p.name_normalized,
      case
        when n.needle is null then 0::real
        when n.digits is not null then 1::real
        when left(p.name_normalized, length(n.needle)) = n.needle then 0.95::real
        when p.name_normalized like n.needle_like then 0.9::real
        else similarity(p.name_normalized, n.needle)
      end as rank
    from patients p
    cross join probe n
    where n.needle is null
       or p.name_normalized like n.needle_like
       or p.name_normalized % n.needle
       or (
            n.digits is not null
            and position(n.digits in regexp_replace(coalesce(p.phone, ''), '\D', '', 'g')) > 0
          )
  ),
  visits as (
    select
      e.patient_id,
      max(e.occurred_at) filter (where e.status = 'committed') as last_visit,
      count(e.id)        filter (where e.status = 'committed') as visit_count
    from encounters e
    where e.patient_id in (select c.id from candidates c)
    group by e.patient_id
  ),
  matched as (
    select
      c.id,
      c.full_name,
      c.phone,
      c.age_years,
      v.last_visit,
      coalesce(v.visit_count, 0) as visit_count,
      c.rank
    from candidates c
    left join visits v on v.patient_id = c.id
    -- Applied here, before the window aggregate below, so `total_count`
    -- describes the filtered query rather than the unfiltered one.
    where p_since is null
       or (v.last_visit is not null and v.last_visit >= p_since)
  )
  select
    m.id,
    m.full_name,
    m.phone,
    m.age_years,
    m.last_visit,
    m.visit_count,
    count(*) over () as total_count
  from matched m
  order by m.rank desc, m.last_visit desc nulls last, m.full_name
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;

revoke all on function list_patients(text, int, int, timestamptz) from public, anon;
grant execute on function list_patients(text, int, int, timestamptz) to authenticated;
