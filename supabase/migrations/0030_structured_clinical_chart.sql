-- docregister — structured medical history, findings, periodontal charting and imaging links.

create table patient_alerts (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics (id) on delete cascade,
  patient_id  uuid not null references patients (id) on delete cascade,
  kind        text not null,
  label       text not null,
  severity    text not null default 'important',
  note        text,
  is_active   boolean not null default true,
  recorded_by uuid references doctors (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint patient_alerts_kind_check check (kind in ('allergy', 'medical', 'medication', 'pregnancy', 'risk', 'other')),
  constraint patient_alerts_label_check check (char_length(btrim(label)) between 1 and 160),
  constraint patient_alerts_severity_check check (severity in ('info', 'important', 'critical')),
  constraint patient_alerts_note_check check (note is null or char_length(note) <= 1000),
  constraint patient_alerts_patient_same_clinic
    foreign key (patient_id, clinic_id) references patients (id, clinic_id),
  constraint patient_alerts_recorder_same_clinic
    foreign key (recorded_by, clinic_id) references doctors (id, clinic_id)
);

create table patient_medical_history (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics (id) on delete cascade,
  patient_id  uuid not null references patients (id) on delete cascade,
  category    text not null,
  name        text not null,
  status      text not null default 'active',
  detail      text,
  onset_date  date,
  resolved_date date,
  recorded_by uuid references doctors (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint patient_medical_history_category_check check (
    category in ('condition', 'allergy', 'medication', 'surgery', 'family_history', 'habit', 'other')
  ),
  constraint patient_medical_history_name_check check (char_length(btrim(name)) between 1 and 200),
  constraint patient_medical_history_status_check check (status in ('active', 'resolved', 'inactive')),
  constraint patient_medical_history_detail_check check (detail is null or char_length(detail) <= 2000),
  constraint patient_medical_history_dates_check check (
    resolved_date is null or onset_date is null or resolved_date >= onset_date
  ),
  constraint patient_medical_history_patient_same_clinic
    foreign key (patient_id, clinic_id) references patients (id, clinic_id),
  constraint patient_medical_history_recorder_same_clinic
    foreign key (recorded_by, clinic_id) references doctors (id, clinic_id)
);

create table tooth_findings (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics (id) on delete cascade,
  patient_id  uuid not null references patients (id) on delete cascade,
  encounter_id uuid references encounters (id) on delete set null,
  tooth_fdi   smallint not null,
  surfaces    text[] not null default '{}',
  finding     text not null,
  state       text not null default 'existing',
  severity    text,
  note        text,
  observed_at timestamptz not null default now(),
  recorded_by uuid references doctors (id) on delete set null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint tooth_findings_tooth_check check (is_fdi_tooth(tooth_fdi)),
  constraint tooth_findings_surfaces_check check (surfaces <@ array['M','O','I','D','B','F','L','P']::text[]),
  constraint tooth_findings_finding_check check (finding in (
    'sound', 'caries', 'fracture', 'wear', 'mobility', 'periapical', 'impacted',
    'missing', 'restoration', 'crown', 'implant', 'root_canal', 'sealant', 'other'
  )),
  constraint tooth_findings_state_check check (state in ('existing', 'planned', 'completed', 'resolved')),
  constraint tooth_findings_severity_check check (severity is null or severity in ('mild', 'moderate', 'severe')),
  constraint tooth_findings_note_check check (note is null or char_length(note) <= 1500),
  constraint tooth_findings_patient_same_clinic
    foreign key (patient_id, clinic_id) references patients (id, clinic_id),
  constraint tooth_findings_encounter_same_clinic
    foreign key (encounter_id, clinic_id) references encounters (id, clinic_id),
  constraint tooth_findings_recorder_same_clinic
    foreign key (recorded_by, clinic_id) references doctors (id, clinic_id)
);

create table periodontal_measurements (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references clinics (id) on delete cascade,
  patient_id     uuid not null references patients (id) on delete cascade,
  encounter_id   uuid references encounters (id) on delete set null,
  tooth_fdi      smallint not null,
  site           text not null,
  pocket_depth_mm smallint,
  recession_mm   smallint,
  bleeding       boolean not null default false,
  suppuration    boolean not null default false,
  mobility       smallint,
  furcation      smallint,
  measured_at    timestamptz not null default now(),
  recorded_by    uuid references doctors (id) on delete set null,
  created_at     timestamptz not null default now(),

  constraint periodontal_tooth_check check (is_fdi_tooth(tooth_fdi)),
  constraint periodontal_site_check check (site in ('MB','B','DB','ML','L','DL')),
  constraint periodontal_pocket_check check (pocket_depth_mm is null or pocket_depth_mm between 0 and 15),
  constraint periodontal_recession_check check (recession_mm is null or recession_mm between -5 and 20),
  constraint periodontal_mobility_check check (mobility is null or mobility between 0 and 3),
  constraint periodontal_furcation_check check (furcation is null or furcation between 0 and 3),
  constraint periodontal_patient_same_clinic
    foreign key (patient_id, clinic_id) references patients (id, clinic_id),
  constraint periodontal_encounter_same_clinic
    foreign key (encounter_id, clinic_id) references encounters (id, clinic_id),
  constraint periodontal_recorder_same_clinic
    foreign key (recorded_by, clinic_id) references doctors (id, clinic_id)
);

create table imaging_links (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics (id) on delete cascade,
  patient_id  uuid not null references patients (id) on delete cascade,
  encounter_id uuid references encounters (id) on delete set null,
  label       text not null,
  modality    text not null default 'other',
  url         text not null,
  taken_at    timestamptz,
  note        text,
  added_by    uuid references doctors (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint imaging_links_label_check check (char_length(btrim(label)) between 1 and 160),
  constraint imaging_links_modality_check check (modality in ('iopa', 'bitewing', 'opg', 'cbct', 'photo', 'scan', 'other')),
  constraint imaging_links_https_check check (url ~* '^https://[^[:space:]]+$'),
  constraint imaging_links_note_check check (note is null or char_length(note) <= 1000),
  constraint imaging_links_patient_same_clinic
    foreign key (patient_id, clinic_id) references patients (id, clinic_id),
  constraint imaging_links_encounter_same_clinic
    foreign key (encounter_id, clinic_id) references encounters (id, clinic_id),
  constraint imaging_links_adder_same_clinic
    foreign key (added_by, clinic_id) references doctors (id, clinic_id)
);

create index patient_alerts_patient_idx on patient_alerts (patient_id, is_active desc, severity, created_at desc);
create index patient_medical_history_patient_idx on patient_medical_history (patient_id, status, created_at desc);
create index tooth_findings_patient_tooth_idx on tooth_findings (patient_id, tooth_fdi, observed_at desc);
create index periodontal_patient_time_idx on periodontal_measurements (patient_id, measured_at desc, tooth_fdi, site);
create index imaging_links_patient_time_idx on imaging_links (patient_id, coalesce(taken_at, created_at) desc);

create trigger patient_alerts_updated_at before update on patient_alerts
  for each row execute function touch_practice_updated_at();
create trigger patient_medical_history_updated_at before update on patient_medical_history
  for each row execute function touch_practice_updated_at();
create trigger tooth_findings_updated_at before update on tooth_findings
  for each row execute function touch_practice_updated_at();
create trigger imaging_links_updated_at before update on imaging_links
  for each row execute function touch_practice_updated_at();

create trigger patient_alerts_audit after insert or update or delete on patient_alerts
  for each row execute function record_audit();
create trigger patient_medical_history_audit after insert or update or delete on patient_medical_history
  for each row execute function record_audit();
create trigger tooth_findings_audit after insert or update or delete on tooth_findings
  for each row execute function record_audit();
create trigger periodontal_measurements_audit after insert or update or delete on periodontal_measurements
  for each row execute function record_audit();
create trigger imaging_links_audit after insert or update or delete on imaging_links
  for each row execute function record_audit();

alter table patient_alerts enable row level security;
alter table patient_medical_history enable row level security;
alter table tooth_findings enable row level security;
alter table periodontal_measurements enable row level security;
alter table imaging_links enable row level security;

create policy patient_alerts_access on patient_alerts for all to authenticated
  using (clinic_id = (select auth_clinic_id()) and has_practice_access('clinical', false))
  with check (clinic_id = (select auth_clinic_id()) and has_practice_access('clinical', true));
create policy patient_medical_history_access on patient_medical_history for all to authenticated
  using (clinic_id = (select auth_clinic_id()) and has_practice_access('clinical', false))
  with check (clinic_id = (select auth_clinic_id()) and has_practice_access('clinical', true));
create policy tooth_findings_access on tooth_findings for all to authenticated
  using (clinic_id = (select auth_clinic_id()) and has_practice_access('clinical', false))
  with check (clinic_id = (select auth_clinic_id()) and has_practice_access('clinical', true));
create policy periodontal_measurements_access on periodontal_measurements for all to authenticated
  using (clinic_id = (select auth_clinic_id()) and has_practice_access('clinical', false))
  with check (clinic_id = (select auth_clinic_id()) and has_practice_access('clinical', true));
create policy imaging_links_access on imaging_links for all to authenticated
  using (clinic_id = (select auth_clinic_id()) and has_practice_access('clinical', false))
  with check (clinic_id = (select auth_clinic_id()) and has_practice_access('clinical', true));

revoke all on patient_alerts, patient_medical_history, tooth_findings, periodontal_measurements, imaging_links from anon;
grant select, insert, update, delete on patient_alerts, patient_medical_history, tooth_findings, periodontal_measurements, imaging_links to authenticated;

