-- docregister — multi-chair practice scheduling and scoped staff roles.
--
-- The original `clinic_role` is deliberately left intact. Existing workflows
-- use it for ownership and admission, while this finer-grained role describes
-- what a team member does inside the dental practice. That keeps old sessions
-- and invitations valid while new modules can enforce least-privilege access.

create type practice_role as enum (
  'owner',
  'dentist',
  'hygienist',
  'assistant',
  'receptionist',
  'accountant',
  'stock_manager'
);

alter table doctors add column practice_role practice_role;

update doctors
set practice_role = case role
  when 'owner' then 'owner'::practice_role
  when 'doctor' then 'dentist'::practice_role
  else 'assistant'::practice_role
end
where practice_role is null;

alter table doctors
  alter column practice_role set default 'dentist',
  alter column practice_role set not null;

create or replace function current_practice_role()
returns practice_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select practice_role from doctors where id = auth.uid();
$$;

create or replace function has_practice_access(p_area text, p_write boolean default false)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case p_area
    when 'schedule' then current_practice_role() in (
      'owner', 'dentist', 'hygienist', 'assistant', 'receptionist'
    )
    when 'clinical' then current_practice_role() in (
      'owner', 'dentist', 'hygienist', 'assistant'
    )
    when 'treatment' then current_practice_role() in (
      'owner', 'dentist', 'hygienist', 'assistant'
    )
    when 'lab' then current_practice_role() in (
      'owner', 'dentist', 'hygienist', 'assistant', 'receptionist'
    )
    when 'inventory' then current_practice_role() in (
      'owner', 'dentist', 'assistant', 'stock_manager'
    )
    when 'finance' then current_practice_role() in (
      'owner', 'dentist', 'receptionist', 'accountant'
    )
    when 'reports' then current_practice_role() in (
      'owner', 'dentist', 'accountant'
    )
    when 'settings' then current_practice_role() = 'owner'
    else false
  end;
$$;

revoke execute on function current_practice_role() from public, anon;
grant execute on function current_practice_role() to authenticated;
revoke execute on function has_practice_access(text, boolean) from public, anon;
grant execute on function has_practice_access(text, boolean) to authenticated;

create or replace function touch_practice_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function touch_practice_updated_at() from public, anon, authenticated;

create table operatories (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics (id) on delete cascade,
  name        text not null,
  code        text,
  colour      text not null default '#176c62',
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint operatories_id_clinic_key unique (id, clinic_id),
  constraint operatories_name_check check (char_length(btrim(name)) between 1 and 80),
  constraint operatories_code_check check (code is null or char_length(btrim(code)) between 1 and 20),
  constraint operatories_colour_check check (colour ~ '^#[0-9A-Fa-f]{6}$'),
  constraint operatories_clinic_name_key unique (clinic_id, name)
);

create table appointments (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references clinics (id) on delete cascade,
  patient_id     uuid references patients (id) on delete restrict,
  clinician_id   uuid references doctors (id) on delete set null,
  operatory_id   uuid references operatories (id) on delete set null,
  created_by     uuid references doctors (id) on delete set null,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  status         text not null default 'scheduled',
  appointment_type text not null default 'consultation',
  reason         text,
  notes          text,
  reminder_at    timestamptz,
  checked_in_at  timestamptz,
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint appointments_id_clinic_key unique (id, clinic_id),
  constraint appointments_time_check check (ends_at > starts_at and ends_at <= starts_at + interval '12 hours'),
  constraint appointments_status_check check (
    status in ('scheduled', 'confirmed', 'checked_in', 'in_chair', 'completed', 'cancelled', 'no_show')
  ),
  constraint appointments_type_check check (char_length(btrim(appointment_type)) between 1 and 80),
  constraint appointments_reason_check check (reason is null or char_length(reason) <= 500),
  constraint appointments_notes_check check (notes is null or char_length(notes) <= 2000),
  constraint appointments_patient_same_clinic
    foreign key (patient_id, clinic_id) references patients (id, clinic_id),
  constraint appointments_clinician_same_clinic
    foreign key (clinician_id, clinic_id) references doctors (id, clinic_id),
  constraint appointments_operatory_same_clinic
    foreign key (operatory_id, clinic_id) references operatories (id, clinic_id),
  constraint appointments_creator_same_clinic
    foreign key (created_by, clinic_id) references doctors (id, clinic_id)
);

alter table encounters add column appointment_id uuid;
alter table encounters add constraint encounters_appointment_same_clinic
  foreign key (appointment_id, clinic_id) references appointments (id, clinic_id);

create index operatories_clinic_sort_idx on operatories (clinic_id, is_active desc, sort_order, name);
create index appointments_clinic_start_idx on appointments (clinic_id, starts_at);
create index appointments_clinician_start_idx on appointments (clinician_id, starts_at)
  where clinician_id is not null and status not in ('cancelled', 'no_show');
create index appointments_patient_start_idx on appointments (patient_id, starts_at desc)
  where patient_id is not null;
create index appointments_operatory_start_idx on appointments (operatory_id, starts_at)
  where operatory_id is not null and status not in ('cancelled', 'no_show');

create trigger operatories_updated_at before update on operatories
  for each row execute function touch_practice_updated_at();
create trigger appointments_updated_at before update on appointments
  for each row execute function touch_practice_updated_at();
create trigger operatories_audit after insert or update or delete on operatories
  for each row execute function record_audit();
create trigger appointments_audit after insert or update or delete on appointments
  for each row execute function record_audit();

alter table operatories enable row level security;
alter table appointments enable row level security;

create policy operatories_read on operatories for select to authenticated
  using (clinic_id = (select auth_clinic_id()) and has_practice_access('schedule', false));
create policy operatories_write on operatories for all to authenticated
  using (clinic_id = (select auth_clinic_id()) and has_practice_access('settings', true))
  with check (clinic_id = (select auth_clinic_id()) and has_practice_access('settings', true));

create policy appointments_read on appointments for select to authenticated
  using (clinic_id = (select auth_clinic_id()) and has_practice_access('schedule', false));
create policy appointments_write on appointments for all to authenticated
  using (clinic_id = (select auth_clinic_id()) and has_practice_access('schedule', true))
  with check (clinic_id = (select auth_clinic_id()) and has_practice_access('schedule', true));

revoke all on operatories, appointments from anon;
grant select, insert, update, delete on operatories, appointments to authenticated;

