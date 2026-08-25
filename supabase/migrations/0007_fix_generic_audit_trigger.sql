-- `record_audit` is shared by encounters and patients. Referencing
-- `new.status` directly fails for patient rows because that table has no status
-- column. Read through JSON so the commit transition is checked only when the
-- trigger is running for encounters.
create or replace function record_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row      record  := coalesce(new, old);
  v_action   audit_action;
  v_changed  text[]  := '{}';
begin
  if tg_op = 'INSERT' then
    v_action := 'insert';
  elsif tg_op = 'DELETE' then
    v_action := 'delete';
  else
    v_action := case
      when tg_table_name = 'encounters'
        and (to_jsonb(new) ->> 'status') is distinct from (to_jsonb(old) ->> 'status')
        and (to_jsonb(new) ->> 'status') = 'committed'
      then 'commit'::audit_action
      else 'update'::audit_action
    end;

    select coalesce(array_agg(key), '{}')
      into v_changed
    from jsonb_each(to_jsonb(new)) n
    where n.value is distinct from (to_jsonb(old) -> n.key);
  end if;

  insert into audit_log (clinic_id, actor_id, action, entity, entity_id, changed)
  values (v_row.clinic_id, auth.uid(), v_action, tg_table_name, v_row.id, v_changed);

  return null;
end;
$$;
