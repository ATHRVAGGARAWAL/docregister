-- docregister — versioned specialty records, consent snapshots and lab tracking.

create table patient_specialty_records (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references clinics (id) on delete cascade,
  patient_id     uuid not null references patients (id) on delete cascade,
  encounter_id   uuid references encounters (id) on delete set null,
  specialty      text not null,
  record_type    text not null,
  schema_version int not null default 1,
  data           jsonb not null default '{}'::jsonb,
  effective_at   timestamptz not null default now(),
  supersedes_id  uuid references patient_specialty_records (id) on delete set null,
  recorded_by    uuid references doctors (id) on delete set null,
  created_at     timestamptz not null default now(),

  constraint patient_specialty_records_id_clinic_key unique (id, clinic_id),
  constraint patient_specialty_records_specialty_check check (char_length(btrim(specialty)) between 1 and 80),
  constraint patient_specialty_records_type_check check (char_length(btrim(record_type)) between 1 and 120),
  constraint patient_specialty_records_version_check check (schema_version between 1 and 100),
  constraint patient_specialty_records_data_check check (jsonb_typeof(data) = 'object'),
  constraint patient_specialty_records_patient_same_clinic
    foreign key (patient_id, clinic_id) references patients (id, clinic_id),
  constraint patient_specialty_records_encounter_same_clinic
    foreign key (encounter_id, clinic_id) references encounters (id, clinic_id),
  constraint patient_specialty_records_recorder_same_clinic
    foreign key (recorded_by, clinic_id) references doctors (id, clinic_id),
  constraint patient_specialty_records_supersedes_same_clinic
    foreign key (supersedes_id, clinic_id) references patient_specialty_records (id, clinic_id)
);

create table consent_records (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references clinics (id) on delete cascade,
  patient_id      uuid not null references patients (id) on delete restrict,
  treatment_plan_id uuid references treatment_plans (id) on delete set null,
  encounter_id    uuid references encounters (id) on delete set null,
  consent_type    text not null,
  template_version text,
  content_snapshot text not null,
  language_code   text not null default 'en-IN',
  status          text not null default 'draft',
  signed_name     text,
  signed_at       timestamptz,
  witness_name    text,
  revoked_at      timestamptz,
  created_by      uuid references doctors (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint consent_records_type_check check (char_length(btrim(consent_type)) between 1 and 120),
  constraint consent_records_content_check check (char_length(btrim(content_snapshot)) between 1 and 50000),
  constraint consent_records_status_check check (status in ('draft', 'presented', 'signed', 'declined', 'revoked')),
  constraint consent_records_signature_check check (
    (status = 'signed' and signed_at is not null and nullif(btrim(signed_name), '') is not null)
    or status <> 'signed'
  ),
  constraint consent_records_patient_same_clinic
    foreign key (patient_id, clinic_id) references patients (id, clinic_id),
  constraint consent_records_plan_same_clinic
    foreign key (treatment_plan_id, clinic_id) references treatment_plans (id, clinic_id),
  constraint consent_records_encounter_same_clinic
    foreign key (encounter_id, clinic_id) references encounters (id, clinic_id),
  constraint consent_records_creator_same_clinic
    foreign key (created_by, clinic_id) references doctors (id, clinic_id)
);

create table lab_cases (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references clinics (id) on delete cascade,
  patient_id      uuid not null references patients (id) on delete restrict,
  treatment_plan_item_id uuid references treatment_plan_items (id) on delete set null,
  appointment_id  uuid references appointments (id) on delete set null,
  lab_name        text not null,
  work_type       text not null,
  tooth_notation  text,
  shade           text,
  status          text not null default 'draft',
  sent_at         timestamptz,
  due_at          timestamptz,
  received_at     timestamptz,
  fitted_at       timestamptz,
  tracking_reference text,
  note            text,
  created_by      uuid references doctors (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint lab_cases_id_clinic_key unique (id, clinic_id),
  constraint lab_cases_lab_check check (char_length(btrim(lab_name)) between 1 and 160),
  constraint lab_cases_work_check check (char_length(btrim(work_type)) between 1 and 160),
  constraint lab_cases_status_check check (status in ('draft', 'sent', 'in_progress', 'ready', 'received', 'fitted', 'cancelled')),
  constraint lab_cases_note_check check (note is null or char_length(note) <= 2000),
  constraint lab_cases_dates_check check (due_at is null or sent_at is null or due_at >= sent_at),
  constraint lab_cases_patient_same_clinic
    foreign key (patient_id, clinic_id) references patients (id, clinic_id),
  constraint lab_cases_plan_item_same_clinic
    foreign key (treatment_plan_item_id, clinic_id) references treatment_plan_items (id, clinic_id),
  constraint lab_cases_appointment_same_clinic
    foreign key (appointment_id, clinic_id) references appointments (id, clinic_id),
  constraint lab_cases_creator_same_clinic
    foreign key (created_by, clinic_id) references doctors (id, clinic_id)
);

create index patient_specialty_records_patient_idx on patient_specialty_records (patient_id, specialty, record_type, effective_at desc);
create index consent_records_patient_idx on consent_records (patient_id, created_at desc);
create index lab_cases_due_idx on lab_cases (clinic_id, status, due_at) where status not in ('fitted', 'cancelled');
create index lab_cases_patient_idx on lab_cases (patient_id, created_at desc);

create trigger consent_records_updated_at before update on consent_records
  for each row execute function touch_practice_updated_at();
create trigger lab_cases_updated_at before update on lab_cases
  for each row execute function touch_practice_updated_at();
create trigger patient_specialty_records_audit after insert or update or delete on patient_specialty_records
  for each row execute function record_audit();
create trigger consent_records_audit after insert or update or delete on consent_records
  for each row execute function record_audit();
create trigger lab_cases_audit after insert or update or delete on lab_cases
  for each row execute function record_audit();

alter table patient_specialty_records enable row level security;
alter table consent_records enable row level security;
alter table lab_cases enable row level security;

create policy patient_specialty_records_access on patient_specialty_records for all to authenticated
  using (clinic_id = (select auth_clinic_id()) and has_practice_access('clinical', false))
  with check (clinic_id = (select auth_clinic_id()) and has_practice_access('clinical', true));
create policy consent_records_access on consent_records for all to authenticated
  using (clinic_id = (select auth_clinic_id()) and has_practice_access('clinical', false))
  with check (clinic_id = (select auth_clinic_id()) and has_practice_access('clinical', true));
create policy lab_cases_access on lab_cases for all to authenticated
  using (clinic_id = (select auth_clinic_id()) and has_practice_access('lab', false))
  with check (clinic_id = (select auth_clinic_id()) and has_practice_access('lab', true));

revoke all on patient_specialty_records, consent_records, lab_cases from anon;
grant select, insert, update, delete on patient_specialty_records, consent_records, lab_cases to authenticated;

