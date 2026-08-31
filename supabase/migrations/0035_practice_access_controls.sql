-- docregister — enforce distinct read and write permissions for practice workspaces.
--
-- Migration 0029 introduced `p_write`, but its function never inspected the
-- flag. That made every role with read access a writer too. The later practice
-- tables also used one FOR ALL policy whose USING expression checked read
-- access; because DELETE has no WITH CHECK, a read-only role could delete a
-- row. Keep the existing migrations immutable and repair both issues here.

-- `practice_role` was added after the account-provisioning trigger. A clinic
-- owner created after 0029 therefore receives the column default (`dentist`),
-- even though the authoritative legacy role says `owner`. Platform admins are
-- owner-equivalent inside their own active clinic as before. Normalising here
-- preserves those behaviours without trusting a client-editable claim.
create or replace function current_practice_role()
returns practice_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when d.role = 'owner' or is_platform_admin() then 'owner'::practice_role
    else d.practice_role
  end
  from doctors d
  where d.id = auth.uid()
    and d.membership_status = 'active';
$$;

-- Read access is intentionally broader than write access. The lists are kept
-- explicit so adding a role or a workspace fails closed until this matrix is
-- deliberately updated.
create or replace function has_practice_access(p_area text, p_write boolean default false)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    case
      when p_write is true then
        case p_area
          when 'schedule' then role in (
            'owner', 'dentist', 'hygienist', 'assistant', 'receptionist'
          )
          when 'clinical' then role in (
            'owner', 'dentist', 'hygienist'
          )
          when 'treatment' then role in (
            'owner', 'dentist'
          )
          when 'lab' then role in (
            'owner', 'dentist', 'assistant', 'receptionist'
          )
          when 'inventory' then role in (
            'owner', 'assistant', 'stock_manager'
          )
          when 'finance' then role in (
            'owner', 'receptionist', 'accountant'
          )
          when 'reports' then role = 'owner'
          when 'settings' then role = 'owner'
          else false
        end
      else
        case p_area
          when 'schedule' then role in (
            'owner', 'dentist', 'hygienist', 'assistant', 'receptionist'
          )
          when 'clinical' then role in (
            'owner', 'dentist', 'hygienist', 'assistant'
          )
          when 'treatment' then role in (
            'owner', 'dentist', 'hygienist', 'assistant'
          )
          when 'lab' then role in (
            'owner', 'dentist', 'hygienist', 'assistant', 'receptionist'
          )
          when 'inventory' then role in (
            'owner', 'dentist', 'assistant', 'stock_manager'
          )
          when 'finance' then role in (
            'owner', 'dentist', 'receptionist', 'accountant'
          )
          when 'reports' then role in (
            'owner', 'dentist', 'accountant'
          )
          when 'settings' then role = 'owner'
          else false
        end
    end,
    false
  )
  from (select current_practice_role() as role) effective_role;
$$;

revoke execute on function current_practice_role() from public, anon;
grant execute on function current_practice_role() to authenticated;
revoke execute on function has_practice_access(text, boolean) from public, anon;
grant execute on function has_practice_access(text, boolean) to authenticated;

-- Structured chart rows validate their tooth number in a CHECK constraint.
-- PostgreSQL evaluates that function with the writing role's privileges, so
-- authenticated clinical writes fail before RLS can admit them if EXECUTE is
-- revoked. The validator exposes no data and accepts one smallint; grant only
-- authenticated while keeping the public API and anonymous callers closed.
revoke execute on function is_fdi_tooth(smallint) from public, anon;
grant execute on function is_fdi_tooth(smallint) to authenticated;

-- Each table gets a SELECT policy based on read access and a separate mutation
-- policy based on write access. The write policy deliberately uses the write
-- predicate in both USING and WITH CHECK: UPDATE/DELETE must be authorised
-- against the existing row, not only the proposed replacement row.

drop policy if exists operatories_read on operatories;
drop policy if exists operatories_write on operatories;
create policy operatories_read on operatories for select to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('schedule', false))
  );
create policy operatories_write on operatories for all to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('settings', true))
  )
  with check (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('settings', true))
  );

drop policy if exists appointments_read on appointments;
drop policy if exists appointments_write on appointments;
create policy appointments_read on appointments for select to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('schedule', false))
  );
create policy appointments_write on appointments for all to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('schedule', true))
  )
  with check (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('schedule', true))
  );

drop policy if exists patient_alerts_access on patient_alerts;
drop policy if exists patient_alerts_read on patient_alerts;
drop policy if exists patient_alerts_write on patient_alerts;
create policy patient_alerts_read on patient_alerts for select to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('clinical', false))
  );
create policy patient_alerts_write on patient_alerts for all to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('clinical', true))
  )
  with check (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('clinical', true))
  );

drop policy if exists patient_medical_history_access on patient_medical_history;
drop policy if exists patient_medical_history_read on patient_medical_history;
drop policy if exists patient_medical_history_write on patient_medical_history;
create policy patient_medical_history_read on patient_medical_history for select to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('clinical', false))
  );
create policy patient_medical_history_write on patient_medical_history for all to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('clinical', true))
  )
  with check (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('clinical', true))
  );

drop policy if exists tooth_findings_access on tooth_findings;
drop policy if exists tooth_findings_read on tooth_findings;
drop policy if exists tooth_findings_write on tooth_findings;
create policy tooth_findings_read on tooth_findings for select to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('clinical', false))
  );
create policy tooth_findings_write on tooth_findings for all to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('clinical', true))
  )
  with check (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('clinical', true))
  );

drop policy if exists periodontal_measurements_access on periodontal_measurements;
drop policy if exists periodontal_measurements_read on periodontal_measurements;
drop policy if exists periodontal_measurements_write on periodontal_measurements;
create policy periodontal_measurements_read on periodontal_measurements for select to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('clinical', false))
  );
create policy periodontal_measurements_write on periodontal_measurements for all to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('clinical', true))
  )
  with check (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('clinical', true))
  );

drop policy if exists imaging_links_access on imaging_links;
drop policy if exists imaging_links_read on imaging_links;
drop policy if exists imaging_links_write on imaging_links;
create policy imaging_links_read on imaging_links for select to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('clinical', false))
  );
create policy imaging_links_write on imaging_links for all to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('clinical', true))
  )
  with check (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('clinical', true))
  );

drop policy if exists treatment_plans_access on treatment_plans;
drop policy if exists treatment_plans_read on treatment_plans;
drop policy if exists treatment_plans_write on treatment_plans;
create policy treatment_plans_read on treatment_plans for select to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('treatment', false))
  );
create policy treatment_plans_write on treatment_plans for all to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('treatment', true))
  )
  with check (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('treatment', true))
  );

drop policy if exists treatment_plan_items_access on treatment_plan_items;
drop policy if exists treatment_plan_items_read on treatment_plan_items;
drop policy if exists treatment_plan_items_write on treatment_plan_items;
create policy treatment_plan_items_read on treatment_plan_items for select to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('treatment', false))
  );
create policy treatment_plan_items_write on treatment_plan_items for all to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('treatment', true))
  )
  with check (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('treatment', true))
  );

drop policy if exists patient_specialty_records_access on patient_specialty_records;
drop policy if exists patient_specialty_records_read on patient_specialty_records;
drop policy if exists patient_specialty_records_write on patient_specialty_records;
create policy patient_specialty_records_read on patient_specialty_records for select to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('clinical', false))
  );
create policy patient_specialty_records_write on patient_specialty_records for all to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('clinical', true))
  )
  with check (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('clinical', true))
  );

drop policy if exists consent_records_access on consent_records;
drop policy if exists consent_records_read on consent_records;
drop policy if exists consent_records_write on consent_records;
create policy consent_records_read on consent_records for select to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('clinical', false))
  );
create policy consent_records_write on consent_records for all to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('clinical', true))
  )
  with check (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('clinical', true))
  );

drop policy if exists lab_cases_access on lab_cases;
drop policy if exists lab_cases_read on lab_cases;
drop policy if exists lab_cases_write on lab_cases;
create policy lab_cases_read on lab_cases for select to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('lab', false))
  );
create policy lab_cases_write on lab_cases for all to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('lab', true))
  )
  with check (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('lab', true))
  );

drop policy if exists inventory_items_access on inventory_items;
drop policy if exists inventory_items_read on inventory_items;
drop policy if exists inventory_items_write on inventory_items;
create policy inventory_items_read on inventory_items for select to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('inventory', false))
  );
create policy inventory_items_write on inventory_items for all to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('inventory', true))
  )
  with check (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('inventory', true))
  );

drop policy if exists inventory_batches_access on inventory_batches;
drop policy if exists inventory_batches_read on inventory_batches;
drop policy if exists inventory_batches_write on inventory_batches;
create policy inventory_batches_read on inventory_batches for select to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('inventory', false))
  );
create policy inventory_batches_write on inventory_batches for all to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('inventory', true))
  )
  with check (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('inventory', true))
  );

drop policy if exists inventory_movements_access on inventory_movements;
drop policy if exists inventory_movements_read on inventory_movements;
drop policy if exists inventory_movements_write on inventory_movements;
drop policy if exists inventory_movements_insert on inventory_movements;
create policy inventory_movements_read on inventory_movements for select to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('inventory', false))
  );
create policy inventory_movements_insert on inventory_movements for insert to authenticated
  with check (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('inventory', true))
  );

-- Stock movements are a ledger, not mutable state. Corrections are new
-- adjustment movements; authenticated users must never rewrite or erase the
-- event that established the current balance.
revoke update, delete on inventory_movements from authenticated;
grant select, insert on inventory_movements to authenticated;

drop policy if exists estimates_access on estimates;
drop policy if exists estimates_read on estimates;
drop policy if exists estimates_write on estimates;
create policy estimates_read on estimates for select to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('finance', false))
  );
create policy estimates_write on estimates for all to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('finance', true))
  )
  with check (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('finance', true))
  );

drop policy if exists estimate_items_access on estimate_items;
drop policy if exists estimate_items_read on estimate_items;
drop policy if exists estimate_items_write on estimate_items;
create policy estimate_items_read on estimate_items for select to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('finance', false))
  );
create policy estimate_items_write on estimate_items for all to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('finance', true))
  )
  with check (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('finance', true))
  );

drop policy if exists invoices_access on invoices;
drop policy if exists invoices_read on invoices;
drop policy if exists invoices_write on invoices;
create policy invoices_read on invoices for select to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('finance', false))
  );
create policy invoices_write on invoices for all to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('finance', true))
  )
  with check (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('finance', true))
  );

drop policy if exists invoice_items_access on invoice_items;
drop policy if exists invoice_items_read on invoice_items;
drop policy if exists invoice_items_write on invoice_items;
create policy invoice_items_read on invoice_items for select to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('finance', false))
  );
create policy invoice_items_write on invoice_items for all to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('finance', true))
  )
  with check (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('finance', true))
  );

drop policy if exists payments_access on payments;
drop policy if exists payments_read on payments;
drop policy if exists payments_write on payments;
create policy payments_read on payments for select to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('finance', false))
  );
create policy payments_write on payments for all to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('finance', true))
  )
  with check (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('finance', true))
  );

drop policy if exists refunds_access on refunds;
drop policy if exists refunds_read on refunds;
drop policy if exists refunds_write on refunds;
create policy refunds_read on refunds for select to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('finance', false))
  );
create policy refunds_write on refunds for all to authenticated
  using (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('finance', true))
  )
  with check (
    clinic_id = (select auth_clinic_id())
    and (select has_practice_access('finance', true))
  );
