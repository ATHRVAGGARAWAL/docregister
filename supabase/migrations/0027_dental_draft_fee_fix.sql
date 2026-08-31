-- docregister — stop the dental draft wrapper from erasing the consultation fee.
--
-- 0025 added `update_dental_draft_workflow` and had it delegate unconditionally
-- to `update_draft_with_consultation_fee_workflow`. That is wrong, and the bug
-- is silent and destructive.
--
-- The fee wrapper (0018:33) treats a null amount as an instruction to REMOVE the
-- stored fee:
--
--     when p_consultation_fee_inr is null
--       then coalesce(extracted_raw, '{}'::jsonb) - 'consultation_fee_inr'
--
-- `p_consultation_fee_inr` defaults to null, and the review sheet autosaves
-- constantly while a dentist types — so every autosave that did not happen to
-- mention money would delete an amount they had already entered. Nothing would
-- error and nothing would be logged; the number would just be gone at commit,
-- and the visit would be recorded as unpaid.
--
-- The route already knows the difference, because `/api/drafts/[id]` branches on
-- `"consultation_fee_inr" in body` — "the caller is setting the fee" is a
-- distinct fact from "the fee is null", and SQL cannot recover it from a
-- nullable argument. So it is passed explicitly.
--
-- Adding a parameter changes the signature, and a defaulted parameter creates an
-- OVERLOAD rather than replacing the function — PostgREST would then see two
-- candidates for a named-argument call and fail. Hence drop, recreate, and
-- re-issue the grants, which a drop takes with it.

drop function if exists update_dental_draft_workflow(uuid, jsonb, jsonb, int, numeric, jsonb);

create or replace function update_dental_draft_workflow(
  p_encounter_id uuid,
  p_patch jsonb,
  p_prescription jsonb default null,
  p_expected_version int default null,
  p_consultation_fee_inr numeric default null,
  p_procedures jsonb default null,
  -- False means "this call says nothing about money", and the fee is left
  -- exactly as it was. True routes through the fee wrapper, where a null then
  -- means what 0018 says it means: clear it.
  p_set_consultation_fee boolean default false
)
returns encounters
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_encounter encounters;
begin
  if p_set_consultation_fee then
    v_encounter := update_draft_with_consultation_fee_workflow(
      p_encounter_id,
      p_patch,
      p_prescription,
      p_expected_version,
      p_consultation_fee_inr
    );
  else
    v_encounter := update_draft_workflow(
      p_encounter_id,
      p_patch,
      p_prescription,
      p_expected_version
    );
  end if;

  -- Null still means "leave the existing rows alone" and `[]` still means "the
  -- dentist removed them all", matching p_prescription exactly. Collapsing the
  -- two would make every patch that does not mention procedures delete them —
  -- the same class of bug this migration exists to fix.
  if p_procedures is not null then
    perform replace_procedure_items_internal(
      p_encounter_id,
      v_encounter.clinic_id,
      p_procedures
    );
  end if;

  return v_encounter;
end;
$$;

revoke execute on function update_dental_draft_workflow(uuid, jsonb, jsonb, int, numeric, jsonb, boolean) from public, anon;
grant execute on function update_dental_draft_workflow(uuid, jsonb, jsonb, int, numeric, jsonb, boolean) to authenticated;
