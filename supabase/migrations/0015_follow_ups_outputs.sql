-- docregister — follow-up work queue and audited output workflow
--
-- Follow-ups are clinic-owned work items. The browser can read them only inside
-- its clinic, and all mutations go through the two narrow workflow functions
-- below. Printed clinical outputs are audited by the API through
-- log_sensitive_access(..., 'export', ...); this table's trigger covers the
-- follow-up lifecycle itself.

create table follow_ups (
  id                 uuid primary key default gen_random_uuid(),
  clinic_id          uuid not null references clinics (id) on delete cascade,
  patient_id         uuid not null references patients (id) on delete cascade,
  encounter_id       uuid references encounters (id) on delete set null,
  created_by         uuid not null references doctors (id) on delete restrict,
  due_at             timestamptz not null,
  reason             text not null,
  notes              text,
  status             text not null default 'open',
  completed_at       timestamptz,
  completed_by       uuid references doctors (id) on delete set null,
  completion_notes   text,
  idempotency_key    text,
  created_at         timestamptz not null default now(),

  constraint follow_ups_status_check
    check (status in ('open', 'completed', 'cancelled')),
  constraint follow_ups_reason_check
    check (char_length(btrim(reason)) between 1 and 500),
  constraint follow_ups_notes_check
    check (notes is null or char_length(notes) <= 2000),
  constraint follow_ups_completion_notes_check
    check (completion_notes is null or char_length(completion_notes) <= 2000),
  constraint follow_ups_completed_consistent
    check (
      (status = 'completed' and completed_at is not null and completed_by is not null)
      or (status <> 'completed' and completed_at is null and completed_by is null)
    ),
  constraint follow_ups_patient_same_clinic
    foreign key (patient_id, clinic_id) references patients (id, clinic_id),
  constraint follow_ups_encounter_same_clinic
    foreign key (encounter_id, clinic_id) references encounters (id, clinic_id),
  constraint follow_ups_creator_same_clinic
    foreign key (created_by, clinic_id) references doctors (id, clinic_id),
  constraint follow_ups_completer_same_clinic
    foreign key (completed_by, clinic_id) references doctors (id, clinic_id)
);

create index follow_ups_clinic_due_idx
  on follow_ups (clinic_id, due_at asc)
  where status = 'open';
create index follow_ups_patient_idx
  on follow_ups (clinic_id, patient_id, due_at desc);
create index follow_ups_encounter_idx
  on follow_ups (encounter_id)
  where encounter_id is not null;
create unique index follow_ups_idempotency_idx
  on follow_ups (created_by, idempotency_key)
  where idempotency_key is not null;

alter table follow_ups enable row level security;

create policy follow_ups_read on follow_ups
  for select to authenticated
  using (clinic_id = auth_clinic_id());

revoke insert, update, delete, truncate on table follow_ups from anon, authenticated;

drop trigger if exists follow_ups_audit on follow_ups;
create trigger follow_ups_audit
  after insert or update or delete on follow_ups
  for each row execute function record_audit();

-- ---------------------------------------------------------------------------
-- Follow-up read workflow
-- ---------------------------------------------------------------------------

create or replace function list_follow_ups(
  p_status text default 'open',
  p_limit int default 100
)
returns table (
  id uuid,
  clinic_id uuid,
  patient_id uuid,
  encounter_id uuid,
  created_by uuid,
  due_at timestamptz,
  reason text,
  notes text,
  status text,
  completed_at timestamptz,
  completed_by uuid,
  completion_notes text,
  created_at timestamptz,
  patient_name text,
  patient_phone text,
  creator_name text,
  completer_name text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doctor doctors%rowtype;
  v_status text := lower(btrim(coalesce(p_status, 'open')));
  v_limit int := least(greatest(coalesce(p_limit, 100), 1), 200);
begin
  select * into v_doctor from doctors where id = auth.uid();
  if not found then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if v_status not in ('open', 'completed', 'cancelled', 'all') then
    raise exception 'invalid follow-up status' using errcode = 'check_violation';
  end if;

  return query
  select fu.id, fu.clinic_id, fu.patient_id, fu.encounter_id, fu.created_by,
         fu.due_at, fu.reason, fu.notes, fu.status, fu.completed_at,
         fu.completed_by, fu.completion_notes, fu.created_at,
         p.full_name, p.phone, creator.full_name, completer.full_name
    from follow_ups fu
    join patients p on p.id = fu.patient_id and p.clinic_id = v_doctor.clinic_id
    join doctors creator on creator.id = fu.created_by and creator.clinic_id = v_doctor.clinic_id
    left join doctors completer on completer.id = fu.completed_by and completer.clinic_id = v_doctor.clinic_id
   where fu.clinic_id = v_doctor.clinic_id
     and (v_status = 'all' or fu.status = v_status)
   order by case when fu.status = 'open' then 0 else 1 end, fu.due_at asc, fu.created_at desc
   limit v_limit;
end;
$$;

revoke all on function list_follow_ups(text, int) from public, anon;
grant execute on function list_follow_ups(text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Follow-up create workflow
-- ---------------------------------------------------------------------------

create or replace function create_follow_up(
  p_patient_id uuid,
  p_due_at timestamptz,
  p_reason text,
  p_encounter_id uuid default null,
  p_notes text default null,
  p_idempotency_key text default null
)
returns table (
  id uuid,
  clinic_id uuid,
  patient_id uuid,
  encounter_id uuid,
  created_by uuid,
  due_at timestamptz,
  reason text,
  notes text,
  status text,
  completed_at timestamptz,
  completed_by uuid,
  completion_notes text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doctor doctors%rowtype;
  v_row follow_ups%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
begin
  select * into v_doctor from doctors where id = auth.uid();
  if not found then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if p_patient_id is null then
    raise exception 'a patient is required' using errcode = 'check_violation';
  end if;
  if p_due_at is null then
    raise exception 'a due date is required' using errcode = 'check_violation';
  end if;
  if p_due_at < now() - interval '1 day' then
    raise exception 'a follow-up cannot be scheduled in the past' using errcode = 'check_violation';
  end if;
  if char_length(v_reason) < 1 or char_length(v_reason) > 500 then
    raise exception 'follow-up reason must be between 1 and 500 characters' using errcode = 'check_violation';
  end if;
  if v_notes is not null and char_length(v_notes) > 2000 then
    raise exception 'follow-up notes are too long' using errcode = 'check_violation';
  end if;
  if v_key is not null and char_length(v_key) > 120 then
    raise exception 'idempotency key is too long' using errcode = 'check_violation';
  end if;

  if v_key is not null then
    select * into v_row
      from follow_ups
     where created_by = v_doctor.id and idempotency_key = v_key;
    if found then
      return query select v_row.id, v_row.clinic_id, v_row.patient_id,
        v_row.encounter_id, v_row.created_by, v_row.due_at, v_row.reason,
        v_row.notes, v_row.status, v_row.completed_at, v_row.completed_by,
        v_row.completion_notes, v_row.created_at;
      return;
    end if;
  end if;

  perform 1 from patients where id = p_patient_id and clinic_id = v_doctor.clinic_id;
  if not found then
    raise exception 'patient was not found' using errcode = 'no_data_found';
  end if;

  if p_encounter_id is not null then
    perform 1 from encounters
     where id = p_encounter_id
       and clinic_id = v_doctor.clinic_id
       and patient_id = p_patient_id
       and status = 'committed';
    if not found then
      raise exception 'the encounter does not belong to this patient' using errcode = 'no_data_found';
    end if;
  end if;

  insert into follow_ups (
    clinic_id, patient_id, encounter_id, created_by, due_at, reason, notes, idempotency_key
  ) values (
    v_doctor.clinic_id, p_patient_id, p_encounter_id, v_doctor.id,
    p_due_at, v_reason, v_notes, v_key
  ) returning * into v_row;

  return query select v_row.id, v_row.clinic_id, v_row.patient_id,
    v_row.encounter_id, v_row.created_by, v_row.due_at, v_row.reason,
    v_row.notes, v_row.status, v_row.completed_at, v_row.completed_by,
    v_row.completion_notes, v_row.created_at;
end;
$$;

revoke all on function create_follow_up(uuid, timestamptz, text, uuid, text, text) from public, anon;
grant execute on function create_follow_up(uuid, timestamptz, text, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Follow-up completion workflow
-- ---------------------------------------------------------------------------

create or replace function complete_follow_up(
  p_follow_up_id uuid,
  p_completion_notes text default null
)
returns table (
  id uuid,
  clinic_id uuid,
  patient_id uuid,
  encounter_id uuid,
  created_by uuid,
  due_at timestamptz,
  reason text,
  notes text,
  status text,
  completed_at timestamptz,
  completed_by uuid,
  completion_notes text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doctor doctors%rowtype;
  v_row follow_ups%rowtype;
  v_notes text := nullif(btrim(coalesce(p_completion_notes, '')), '');
begin
  select * into v_doctor from doctors where id = auth.uid();
  if not found then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if v_notes is not null and char_length(v_notes) > 2000 then
    raise exception 'completion notes are too long' using errcode = 'check_violation';
  end if;

  select * into v_row from follow_ups
   where id = p_follow_up_id and clinic_id = v_doctor.clinic_id
   for update;
  if not found then
    raise exception 'follow-up was not found' using errcode = 'no_data_found';
  end if;
  if v_row.status = 'cancelled' then
    raise exception 'cancelled follow-ups cannot be completed' using errcode = 'check_violation';
  end if;
  if v_row.status <> 'completed' then
    update follow_ups
       set status = 'completed', completed_at = now(), completed_by = v_doctor.id,
           completion_notes = v_notes
     where id = v_row.id
     returning * into v_row;
  end if;

  return query select v_row.id, v_row.clinic_id, v_row.patient_id,
    v_row.encounter_id, v_row.created_by, v_row.due_at, v_row.reason,
    v_row.notes, v_row.status, v_row.completed_at, v_row.completed_by,
    v_row.completion_notes, v_row.created_at;
end;
$$;

revoke all on function complete_follow_up(uuid, text) from public, anon;
grant execute on function complete_follow_up(uuid, text) to authenticated;

-- Explicit workflow-suffixed entry points match the naming used by the rest of
-- the security migration. The short names above remain useful for SQL callers;
-- these wrappers are the only names exposed to the application routes.
create or replace function create_follow_up_workflow(
  p_patient_id uuid,
  p_due_at timestamptz,
  p_reason text,
  p_encounter_id uuid default null,
  p_notes text default null,
  p_idempotency_key text default null
)
returns table (
  id uuid, clinic_id uuid, patient_id uuid, encounter_id uuid, created_by uuid,
  due_at timestamptz, reason text, notes text, status text,
  completed_at timestamptz, completed_by uuid, completion_notes text, created_at timestamptz
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select * from create_follow_up(
    p_patient_id, p_due_at, p_reason, p_encounter_id, p_notes, p_idempotency_key
  );
$$;

revoke all on function create_follow_up_workflow(uuid, timestamptz, text, uuid, text, text) from public, anon;
grant execute on function create_follow_up_workflow(uuid, timestamptz, text, uuid, text, text) to authenticated;

create or replace function complete_follow_up_workflow(
  p_follow_up_id uuid,
  p_completion_notes text default null
)
returns table (
  id uuid, clinic_id uuid, patient_id uuid, encounter_id uuid, created_by uuid,
  due_at timestamptz, reason text, notes text, status text,
  completed_at timestamptz, completed_by uuid, completion_notes text, created_at timestamptz
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select * from complete_follow_up(p_follow_up_id, p_completion_notes);
$$;

revoke all on function complete_follow_up_workflow(uuid, text) from public, anon;
grant execute on function complete_follow_up_workflow(uuid, text) to authenticated;

comment on table follow_ups is
  'Clinic-scoped recall work items. Mutations are only through create_follow_up and complete_follow_up.';
