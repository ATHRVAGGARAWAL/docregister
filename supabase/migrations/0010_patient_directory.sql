-- docregister — list and search every chart in the clinic
--
-- The patients workspace needs a question that `match_patients` cannot be asked:
-- "show me everyone, newest visit first, and narrow it as I type".
--
--   * `match_patients` requires a name. There is no argument that means "no
--     filter", so it can rank candidates but it can never produce a directory.
--   * Its only name test is pg_trgm's `%` operator, which is thresholded by
--     `pg_trgm.similarity_threshold`. Nothing in this repo sets it, so the
--     effective cut-off is the 0.3 default — and a three-letter prefix of a
--     ten-letter name scores well under that. Typing "sun" would return nothing
--     and then "sunita" would suddenly return a row, which reads as a broken
--     search rather than a strict one.
--   * It counts every encounter, committed or not, into `visit_count` while
--     taking `last_visit` from the same unfiltered set. A draft is a
--     consultation that has not been signed; counting it as a visit inflates
--     the number the doctor uses to judge whether this is the right chart.
--     That inconsistency is not worth propagating into a directory.
--
-- Widening `match_patients` to cover both jobs would change the ranking that
-- the review step's "is this the same patient?" prompt depends on, so this is a
-- second function rather than a fourth argument on the first.
--
-- Substring is what makes incremental typing feel right: every prefix of a name
-- matches, so the list only ever narrows as letters are added. Trigram sits
-- behind it at the stock 0.3 threshold, for names that differ by more than a
-- prefix.
--
-- The threshold is deliberately NOT lowered to chase misspellings, and it is
-- worth writing down why, because "make fuzzy search fuzzier" is the obvious
-- next change and it is wrong here. Measured against this clinic's data:
--
--     suneeta -> sunita devi    0.364     the case we would want to catch
--     rajesh  -> ramesh kumar   0.400     a different person entirely
--
-- The false positive scores HIGHER than the true one, so no threshold
-- separates them: any setting loose enough to find Suneeta from "suneeta" also
-- offers Ramesh Kumar to a doctor searching for Rajesh. That is the same
-- argument this project already makes against embeddings for patient lookup,
-- and it applies to trigrams for the same reason — orthographic distance is
-- not identity.
--
-- So the directory does not try to be clever. A misspelling narrows to nothing,
-- the doctor clears the box and scans, or searches the phone number, which is
-- exact. Resolving a *spoken* name to one chart is a different problem with a
-- different answer, and `match_patients` already solves it with an explicit
-- decisiveness test rather than a threshold.
--
-- Security invoker, and deliberately no clinic filter in the body: `patients_rw`
-- and `encounters_rw` already restrict every row to `auth_clinic_id()`. A
-- caller-supplied clinic id would be a tenant boundary that the caller chooses,
-- and re-deriving one here would only duplicate — and eventually contradict —
-- the policy that actually enforces it.

create or replace function list_patients(
  p_search text default null,
  p_limit  int  default 50,
  p_offset int  default 0
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
-- Pinned so a caller cannot shadow `patients`, `encounters` or `similarity`
-- with something in an earlier schema.
set search_path = public, pg_temp
as $$
  with q as (
    select
      -- The same expression `normalize_patient_name()` applies before storing
      -- `name_normalized`. If the two ever drift, search stops matching what
      -- the trigger wrote and the failure is silent — the list simply comes
      -- back empty for names that are plainly on file.
      nullif(btrim(regexp_replace(lower(unaccent(coalesce(p_search, ''))), '\s+', ' ', 'g')), '') as needle,
      -- Digits only, and only when the doctor typed no letters at all. A phone
      -- is stored however it was entered — "+91 98765 43210", "9876543210" —
      -- so both sides are reduced to digits before comparing. Three digits is
      -- the floor: fewer than that matches most of the clinic and tells the
      -- doctor nothing.
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
      -- `%`, `_` and `\` are LIKE metacharacters, and a doctor typing one means
      -- the character, not the wildcard. Escaping rather than stripping keeps
      -- the probe a plain `like`, which `patients_name_trgm_idx` can serve;
      -- `position()` would be literal but unindexable, and a sequential scan of
      -- every chart on every keystroke is exactly what this function exists to
      -- avoid.
      '%' || replace(replace(replace(q.needle, '\', '\\'), '%', '\%'), '_', '\_') || '%' as needle_like
    from q
  ),
  -- Filter the base table BEFORE aggregating anything.
  --
  -- The first version of this joined `patients` to `encounters` and grouped by
  -- patient, then filtered the result. That is a full aggregate of every chart
  -- and every encounter in the clinic on each debounced keystroke, and it puts
  -- the trigram operand on a CTE's output rather than on a column, so
  -- `patients_name_trgm_idx` cannot be used at all. It also made the escaping
  -- comment above a lie: nothing about a plain `like` is indexable once the
  -- value has been through a GROUP BY.
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
  -- Only the charts that survived the filter, so this aggregate is bounded by
  -- the page the doctor is about to see rather than by the size of the clinic.
  visits as (
    select
      e.patient_id,
      -- Committed only, for both. A draft has not been confirmed by anyone, so
      -- it is not yet a visit and its timestamp is not yet a "last seen" — a
      -- chart whose only encounter is an unreviewed draft honestly has no
      -- visits, and shows as such.
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
      coalesce(v.last_visit, null) as last_visit,
      coalesce(v.visit_count, 0)   as visit_count,
      c.rank
    from candidates c
    left join visits v on v.patient_id = c.id
  )
  select
    m.id,
    m.full_name,
    m.phone,
    m.age_years,
    m.last_visit,
    m.visit_count,
    -- A window aggregate over everything that matched, so the page can say
    -- "showing 50 of 214" without a second round trip and without a count that
    -- describes the slice rather than the query.
    count(*) over () as total_count
  from matched m
  order by m.rank desc, m.last_visit desc nulls last, m.full_name
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;
