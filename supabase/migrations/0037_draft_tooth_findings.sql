-- Keep structured tooth findings inside a recoverable draft until commit.
-- The committed rows themselves live in tooth_findings (0030); this JSON is
-- only the editable review payload, matching how the original extraction is
-- already kept on encounters.extracted_raw.

drop function if exists update_dental_draft_workflow(uuid, jsonb, jsonb, int, numeric, jsonb, boolean);

create or replace function update_dental_draft_workflow(
  p_encounter_id uuid,
  p_patch jsonb,
  p_prescription jsonb default null,
  p_expected_version int default null,
  p_consultation_fee_inr numeric default null,
  p_procedures jsonb default null,
  p_set_consultation_fee boolean default false,
  p_tooth_findings jsonb default null
)
returns encounters
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_encounter encounters;
begin
  if p_tooth_findings is not null and jsonb_typeof(p_tooth_findings) <> 'array' then
    raise exception 'tooth findings must be an array' using errcode = 'check_violation';
  end if;

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

  if p_procedures is not null then
    perform replace_procedure_items_internal(
      p_encounter_id,
      v_encounter.clinic_id,
      p_procedures
    );
  end if;

  if p_tooth_findings is not null then
    update encounters
       set extracted_raw = coalesce(extracted_raw, '{}'::jsonb)
         || jsonb_build_object('tooth_findings', p_tooth_findings)
     where id = p_encounter_id
     returning * into v_encounter;
  end if;

  return v_encounter;
end;
$$;

revoke execute on function update_dental_draft_workflow(uuid, jsonb, jsonb, int, numeric, jsonb, boolean, jsonb) from public, anon;
grant execute on function update_dental_draft_workflow(uuid, jsonb, jsonb, int, numeric, jsonb, boolean, jsonb) to authenticated;
