-- docregister — commit_encounter must refuse a patient from another clinic
--
-- `commit_encounter` took `p_patient_id` on trust. The lock it acquires,
--
--   perform 1 from patients where id = p_patient_id for update;
--
-- looks like a check and is not one: PERFORM does not raise when it matches
-- nothing, and under RLS a patient belonging to another clinic simply is not
-- visible, so this matched zero rows and carried on. The UPDATE that follows
-- then passed its own `with check (clinic_id = auth_clinic_id())` because that
-- clause tests the *encounter's* clinic, not the patient's, and the foreign key
-- on `encounters.patient_id` does not consult RLS either. The net effect was
-- that a caller who knew a patient id from another clinic could attach their
-- own encounter to it.
--
-- The fix leans on RLS rather than re-deriving the clinic: the row is invisible
-- to a caller outside its clinic, so `found` is false and we refuse. Keeping
-- the test on the existing locking statement means there is exactly one place
-- the patient is looked up, and no second query to drift out of step with it.
--
-- A composite foreign key on (patient_id, clinic_id) would enforce this in the
-- schema rather than in the function, which is stronger. It needs a unique
-- index on patients (id, clinic_id) and a rewrite of the existing constraint,
-- so it is deliberately left out of a security patch.

create or replace function commit_encounter(p_encounter_id uuid, p_patient_id uuid)
returns encounters
language plpgsql
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

  -- RLS hides other clinics' patients, so a miss here means the id was either
  -- invented or belongs to someone else's register. Both are refusals.
  if not found then
    raise exception 'patient % is not in this clinic', p_patient_id
      using errcode = 'check_violation';
  end if;

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
