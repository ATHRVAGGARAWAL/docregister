-- docregister — carry a reviewed consultation amount into Accounts
--
-- The amount remains separate from the clinical encounter: it is kept in the
-- draft's extraction JSON while the doctor reviews it, then becomes a linked
-- Accounts row in the same transaction that commits the visit.

create unique index if not exists account_entries_visit_fee_encounter_idx
  on account_entries (encounter_id, source)
  where encounter_id is not null and source = 'visit_consultation_fee';

create or replace function update_draft_with_consultation_fee_workflow(
  p_encounter_id uuid,
  p_patch jsonb,
  p_prescription jsonb default null,
  p_expected_version int default null,
  p_consultation_fee_inr numeric default null
)
returns encounters
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result encounters%rowtype;
begin
  if p_consultation_fee_inr is not null
     and (p_consultation_fee_inr <= 0 or p_consultation_fee_inr > 1000000) then
    raise exception 'consultation amount is invalid' using errcode = 'check_violation';
  end if;

  select * into v_result
    from update_draft_workflow(
      p_encounter_id,
      p_patch,
      p_prescription,
      p_expected_version
    );

  update encounters
     set extracted_raw = case
       when p_consultation_fee_inr is null
         then coalesce(extracted_raw, '{}'::jsonb) - 'consultation_fee_inr'
       else jsonb_set(
         coalesce(extracted_raw, '{}'::jsonb),
         '{consultation_fee_inr}',
         to_jsonb(p_consultation_fee_inr),
         true
       )
     end
   where id = p_encounter_id
   returning * into v_result;

  return v_result;
end;
$$;

revoke all on function update_draft_with_consultation_fee_workflow(uuid, jsonb, jsonb, int, numeric) from public, anon;
grant execute on function update_draft_with_consultation_fee_workflow(uuid, jsonb, jsonb, int, numeric) to authenticated;

create or replace function commit_encounter_with_income_workflow(
  p_encounter_id uuid,
  p_patient_id uuid default null,
  p_new_patient jsonb default null,
  p_idempotency_key text default null,
  p_amount_paise bigint default null
)
returns table (
  encounter_id uuid,
  patient_id uuid,
  visit_number int,
  is_new_patient boolean,
  already_committed boolean,
  account_entry_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_commit record;
  v_encounter encounters%rowtype;
  v_patient_name text;
  v_account_entry_id uuid;
begin
  if p_amount_paise is not null
     and (p_amount_paise <= 0 or p_amount_paise > 100000000) then
    raise exception 'consultation amount is invalid' using errcode = 'check_violation';
  end if;

  select * into v_commit
    from commit_encounter_workflow(
      p_encounter_id,
      p_patient_id,
      p_new_patient,
      p_idempotency_key
    );

  if p_amount_paise is not null then
    select e.*
      into v_encounter
      from encounters e
     where e.id = v_commit.encounter_id
       and e.doctor_id = auth.uid();

    if not found then
      raise exception 'encounter not found' using errcode = 'no_data_found';
    end if;

    select coalesce(p.full_name, v_encounter.patient_name_spoken, 'Patient')
      into v_patient_name
      from patients p
     where p.id = v_encounter.patient_id;

    v_patient_name := coalesce(v_patient_name, v_encounter.patient_name_spoken, 'Patient');

    insert into account_entries (
      clinic_id,
      doctor_id,
      patient_id,
      encounter_id,
      kind,
      status,
      amount_paise,
      category,
      payment_method,
      counterparty,
      note,
      source,
      occurred_at
    ) values (
      v_encounter.clinic_id,
      v_encounter.doctor_id,
      v_encounter.patient_id,
      v_encounter.id,
      'income',
      'paid',
      p_amount_paise,
      'Consultation',
      null,
      left(v_patient_name, 300),
      'Captured from the reviewed visit amount',
      'visit_consultation_fee',
      v_encounter.occurred_at
    )
    on conflict (encounter_id, source)
      where encounter_id is not null and source = 'visit_consultation_fee'
      do nothing
    returning id into v_account_entry_id;

    if v_account_entry_id is null then
      select ae.id into v_account_entry_id
        from account_entries ae
       where ae.encounter_id = v_encounter.id
         and ae.source = 'visit_consultation_fee';
    end if;
  end if;

  -- The reviewed amount now lives only in Accounts. Remove the temporary
  -- draft value so the clinical encounter does not become a second ledger.
  update encounters
     set extracted_raw = coalesce(extracted_raw, '{}'::jsonb) - 'consultation_fee_inr'
   where id = v_commit.encounter_id
     and extracted_raw ? 'consultation_fee_inr';

  return query select
    v_commit.encounter_id,
    v_commit.patient_id,
    v_commit.visit_number,
    v_commit.is_new_patient,
    v_commit.already_committed,
    v_account_entry_id;
end;
$$;

revoke all on function commit_encounter_with_income_workflow(uuid, uuid, jsonb, text, bigint) from public, anon;
grant execute on function commit_encounter_with_income_workflow(uuid, uuid, jsonb, text, bigint) to authenticated;
