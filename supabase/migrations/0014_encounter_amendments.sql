-- docregister — audited, append-only corrections for committed encounters
--
-- Committed encounters are the signed register. They are never updated to make
-- a correction look as if it was present at the time of the visit. A correction
-- is an immutable snapshot of the effective values before and after the change.

create table encounter_amendments (
  id             uuid primary key default uuid_generate_v4(),
  clinic_id      uuid not null references clinics (id) on delete cascade,
  encounter_id   uuid not null references encounters (id) on delete cascade,
  revision       integer not null,
  reason         text not null,
  before_values  jsonb not null,
  after_values   jsonb not null,
  author_id      uuid not null references doctors (id) on delete restrict,
  created_at     timestamptz not null default now(),

  constraint encounter_amendments_revision_positive check (revision > 0),
  constraint encounter_amendments_reason_sane
    check (char_length(btrim(reason)) between 1 and 2000),
  constraint encounter_amendments_before_object
    check (jsonb_typeof(before_values) = 'object'),
  constraint encounter_amendments_after_object
    check (jsonb_typeof(after_values) = 'object'),
  constraint encounter_amendments_revision_unique
    unique (encounter_id, revision)
);

create index encounter_amendments_encounter_idx
  on encounter_amendments (encounter_id, revision desc);
create index encounter_amendments_clinic_created_idx
  on encounter_amendments (clinic_id, created_at desc);

alter table encounter_amendments enable row level security;

create policy encounter_amendments_read on encounter_amendments
  for select using (clinic_id = auth_clinic_id());

-- The browser never receives table write privileges. The RPC below is the only
-- write path and derives clinic, author, the current revision, and before_values
-- from auth-scoped rows inside the transaction.
revoke insert, update, delete, truncate on table encounter_amendments from anon, authenticated;

create or replace function prevent_encounter_amendment_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'encounter amendments are append-only'
    using errcode = '55000';
end;
$$;

create trigger encounter_amendments_append_only
  before update or delete on encounter_amendments
  for each row execute function prevent_encounter_amendment_mutation();

-- Keep the clinic audit trail aware that an amendment was appended as well as
-- retaining the amendment's immutable before/after values in its own table.
create trigger encounter_amendments_audit
  after insert on encounter_amendments
  for each row execute function record_audit();

create or replace function append_encounter_amendment(
  p_encounter_id uuid,
  p_changes      jsonb,
  p_reason       text
)
returns table (
  id            uuid,
  encounter_id  uuid,
  revision      integer,
  reason        text,
  before_values jsonb,
  after_values  jsonb,
  author_id     uuid,
  created_at    timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doctor       doctors%rowtype;
  v_encounter    encounters%rowtype;
  v_before       jsonb;
  v_after        jsonb;
  v_revision     integer;
  v_key          text;
  v_item         jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  select * into v_doctor from doctors where id = auth.uid();
  if not found then
    raise exception 'signed-in doctor was not found' using errcode = 'insufficient_privilege';
  end if;

  if p_changes is null or jsonb_typeof(p_changes) <> 'object'
     or p_changes = '{}'::jsonb then
    raise exception 'at least one correction is required' using errcode = 'check_violation';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 2000 then
    raise exception 'a correction reason is required' using errcode = 'check_violation';
  end if;

  for v_key in select jsonb_object_keys(p_changes) loop
    if v_key not in (
      'patient_name_spoken', 'age_years', 'diagnosis', 'treatment', 'fees_inr',
      'prescription'
    ) then
      raise exception 'unsupported correction field' using errcode = 'check_violation';
    end if;
  end loop;

  -- Locking the immutable encounter serialises two simultaneous corrections and
  -- makes the revision number deterministic without modifying the encounter.
  select * into v_encounter
    from encounters
   where id = p_encounter_id
     and clinic_id = v_doctor.clinic_id
     and status = 'committed'
   for update;
  if not found then
    raise exception 'committed encounter was not found' using errcode = 'no_data_found';
  end if;

  v_before := jsonb_build_object(
    'patient_name_spoken', v_encounter.patient_name_spoken,
    'age_years', v_encounter.age_years,
    'diagnosis', v_encounter.diagnosis,
    'treatment', v_encounter.treatment,
    'fees_inr', v_encounter.fees_inr,
    'prescription', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pi.id,
        'drug_name', pi.drug_name,
        'strength', pi.strength,
        'form', pi.form,
        'frequency_spoken', pi.frequency_spoken,
        'frequency_code', pi.frequency_code,
        'frequency_label', pi.frequency_label,
        'needs_review', pi.needs_review,
        'duration', pi.duration,
        'route', pi.route,
        'instructions', pi.instructions,
        'corrected', pi.corrected,
        'position', pi.position
      ) order by pi.position)
      from prescription_items pi
      where pi.encounter_id = v_encounter.id
    ), '[]'::jsonb)
  );

  -- A patch is stored as the complete next effective snapshot. Later reads can
  -- replay `after_values` without ever rewriting the signed source row.
  v_after := v_before || p_changes;

  if p_changes ? 'age_years' and v_after -> 'age_years' <> 'null'::jsonb then
    if jsonb_typeof(v_after -> 'age_years') not in ('number', 'string')
       or (v_after ->> 'age_years') !~ '^[0-9]+$' then
      raise exception 'age must be between 0 and 130' using errcode = 'check_violation';
    end if;
    if (v_after ->> 'age_years')::int not between 0 and 130 then
      raise exception 'age must be between 0 and 130' using errcode = 'check_violation';
    end if;
  end if;
  if p_changes ? 'fees_inr' and v_after -> 'fees_inr' <> 'null'::jsonb then
    if jsonb_typeof(v_after -> 'fees_inr') not in ('number', 'string')
       or (v_after ->> 'fees_inr') !~ '^[0-9]+(\.[0-9]{1,2})?$' then
      raise exception 'fees must be between 0 and 1000000' using errcode = 'check_violation';
    end if;
    if (v_after ->> 'fees_inr')::numeric < 0
       or (v_after ->> 'fees_inr')::numeric > 1000000 then
      raise exception 'fees must be between 0 and 1000000' using errcode = 'check_violation';
    end if;
  end if;
  for v_key in select key from jsonb_each(p_changes) where value <> 'null'::jsonb
  loop
    if v_key in ('patient_name_spoken', 'diagnosis', 'treatment')
       and jsonb_typeof(v_after -> v_key) not in ('string', 'null') then
      raise exception 'text correction fields must be strings or null'
        using errcode = 'check_violation';
    end if;
    if v_key in ('patient_name_spoken', 'diagnosis', 'treatment')
       and char_length(v_after ->> v_key) > 20000 then
      raise exception 'correction text is too long' using errcode = 'check_violation';
    end if;
  end loop;
  if p_changes ? 'prescription' then
    if jsonb_typeof(v_after -> 'prescription') <> 'array'
       or jsonb_array_length(v_after -> 'prescription') > 100 then
      raise exception 'prescription must be an array of at most 100 items'
        using errcode = 'check_violation';
    end if;
    for v_item in select value from jsonb_array_elements(v_after -> 'prescription') loop
      if jsonb_typeof(v_item) <> 'object'
         or nullif(btrim(v_item ->> 'drug_name'), '') is null
         or char_length(v_item ->> 'drug_name') > 200 then
        raise exception 'each prescription item needs a valid drug name'
          using errcode = 'check_violation';
      end if;
    end loop;
  end if;

  select coalesce(max(ea.revision), 0) + 1
    into v_revision
    from encounter_amendments ea
   where ea.encounter_id = v_encounter.id;

  return query
  insert into encounter_amendments (
    clinic_id, encounter_id, revision, reason, before_values, after_values, author_id
  )
  values (
    v_doctor.clinic_id, v_encounter.id, v_revision, btrim(p_reason),
    v_before, v_after, v_doctor.id
  )
  returning encounter_amendments.id, encounter_amendments.encounter_id,
    encounter_amendments.revision, encounter_amendments.reason,
    encounter_amendments.before_values, encounter_amendments.after_values,
    encounter_amendments.author_id, encounter_amendments.created_at;
end;
$$;

revoke all on function append_encounter_amendment(uuid, jsonb, text) from public, anon;
grant execute on function append_encounter_amendment(uuid, jsonb, text) to authenticated;

comment on table encounter_amendments is
  'Immutable corrections to committed encounters. Original encounter rows are never rewritten.';
comment on column encounter_amendments.before_values is
  'Effective clinical values immediately before this revision.';
comment on column encounter_amendments.after_values is
  'Effective clinical values immediately after this revision.';
