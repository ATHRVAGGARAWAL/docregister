-- docregister — estimates, invoices, payments and refunds.
--
-- Existing consultation-fee ledger rows are intentionally not converted into
-- invoices. A historical payment is not evidence that an invoice existed, and
-- fabricating one would make the financial record look more complete than it is.

create table estimates (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references clinics (id) on delete cascade,
  patient_id     uuid not null references patients (id) on delete restrict,
  treatment_plan_id uuid references treatment_plans (id) on delete set null,
  number         bigint generated always as identity,
  status         text not null default 'draft',
  valid_until    date,
  note           text,
  created_by     uuid references doctors (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint estimates_id_clinic_key unique (id, clinic_id),
  constraint estimates_clinic_number_key unique (clinic_id, number),
  constraint estimates_status_check check (status in ('draft', 'presented', 'accepted', 'declined', 'expired', 'converted')),
  constraint estimates_note_check check (note is null or char_length(note) <= 2000),
  constraint estimates_patient_same_clinic
    foreign key (patient_id, clinic_id) references patients (id, clinic_id),
  constraint estimates_plan_same_clinic
    foreign key (treatment_plan_id, clinic_id) references treatment_plans (id, clinic_id),
  constraint estimates_creator_same_clinic
    foreign key (created_by, clinic_id) references doctors (id, clinic_id)
);

create table estimate_items (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references clinics (id) on delete cascade,
  estimate_id    uuid not null references estimates (id) on delete cascade,
  treatment_plan_item_id uuid references treatment_plan_items (id) on delete set null,
  description    text not null,
  quantity       numeric(8,2) not null default 1,
  unit_price_paise bigint not null default 0,
  discount_paise bigint not null default 0,
  tax_paise      bigint not null default 0,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),

  constraint estimate_items_id_clinic_key unique (id, clinic_id),
  constraint estimate_items_estimate_same_clinic
    foreign key (estimate_id, clinic_id) references estimates (id, clinic_id),
  constraint estimate_items_plan_item_same_clinic
    foreign key (treatment_plan_item_id, clinic_id) references treatment_plan_items (id, clinic_id),
  constraint estimate_items_description_check check (char_length(btrim(description)) between 1 and 300),
  constraint estimate_items_quantity_check check (quantity > 0 and quantity <= 100),
  constraint estimate_items_money_check check (
    unit_price_paise >= 0 and discount_paise >= 0 and tax_paise >= 0
      and discount_paise <= unit_price_paise * quantity
  )
);

create table invoices (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references clinics (id) on delete cascade,
  patient_id     uuid not null references patients (id) on delete restrict,
  estimate_id    uuid references estimates (id) on delete set null,
  encounter_id   uuid references encounters (id) on delete set null,
  number         bigint generated always as identity,
  status         text not null default 'draft',
  issued_at      timestamptz,
  due_at         timestamptz,
  note           text,
  created_by     uuid references doctors (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint invoices_id_clinic_key unique (id, clinic_id),
  constraint invoices_clinic_number_key unique (clinic_id, number),
  constraint invoices_status_check check (status in ('draft', 'issued', 'part_paid', 'paid', 'void', 'overdue')),
  constraint invoices_due_check check (due_at is null or issued_at is null or due_at >= issued_at),
  constraint invoices_note_check check (note is null or char_length(note) <= 2000),
  constraint invoices_patient_same_clinic
    foreign key (patient_id, clinic_id) references patients (id, clinic_id),
  constraint invoices_estimate_same_clinic
    foreign key (estimate_id, clinic_id) references estimates (id, clinic_id),
  constraint invoices_encounter_same_clinic
    foreign key (encounter_id, clinic_id) references encounters (id, clinic_id),
  constraint invoices_creator_same_clinic
    foreign key (created_by, clinic_id) references doctors (id, clinic_id)
);

create table invoice_items (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references clinics (id) on delete cascade,
  invoice_id     uuid not null references invoices (id) on delete cascade,
  treatment_plan_item_id uuid references treatment_plan_items (id) on delete set null,
  description    text not null,
  quantity       numeric(8,2) not null default 1,
  unit_price_paise bigint not null default 0,
  discount_paise bigint not null default 0,
  tax_paise      bigint not null default 0,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),

  constraint invoice_items_id_clinic_key unique (id, clinic_id),
  constraint invoice_items_invoice_same_clinic
    foreign key (invoice_id, clinic_id) references invoices (id, clinic_id),
  constraint invoice_items_plan_item_same_clinic
    foreign key (treatment_plan_item_id, clinic_id) references treatment_plan_items (id, clinic_id),
  constraint invoice_items_description_check check (char_length(btrim(description)) between 1 and 300),
  constraint invoice_items_quantity_check check (quantity > 0 and quantity <= 100),
  constraint invoice_items_money_check check (
    unit_price_paise >= 0 and discount_paise >= 0 and tax_paise >= 0
      and discount_paise <= unit_price_paise * quantity
  )
);

create table payments (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references clinics (id) on delete cascade,
  invoice_id     uuid not null references invoices (id) on delete restrict,
  patient_id     uuid not null references patients (id) on delete restrict,
  amount_paise   bigint not null,
  method         text not null,
  reference      text,
  received_at    timestamptz not null default now(),
  note           text,
  recorded_by    uuid references doctors (id) on delete set null,
  created_at     timestamptz not null default now(),

  constraint payments_id_clinic_key unique (id, clinic_id),
  constraint payments_amount_check check (amount_paise > 0),
  constraint payments_method_check check (method in ('cash', 'upi', 'card', 'bank_transfer', 'other')),
  constraint payments_note_check check (note is null or char_length(note) <= 1000),
  constraint payments_invoice_same_clinic
    foreign key (invoice_id, clinic_id) references invoices (id, clinic_id),
  constraint payments_patient_same_clinic
    foreign key (patient_id, clinic_id) references patients (id, clinic_id),
  constraint payments_recorder_same_clinic
    foreign key (recorded_by, clinic_id) references doctors (id, clinic_id)
);

create table refunds (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references clinics (id) on delete cascade,
  payment_id     uuid not null references payments (id) on delete restrict,
  amount_paise   bigint not null,
  reason         text not null,
  refunded_at    timestamptz not null default now(),
  recorded_by    uuid references doctors (id) on delete set null,
  created_at     timestamptz not null default now(),

  constraint refunds_amount_check check (amount_paise > 0),
  constraint refunds_reason_check check (char_length(btrim(reason)) between 1 and 500),
  constraint refunds_payment_same_clinic
    foreign key (payment_id, clinic_id) references payments (id, clinic_id),
  constraint refunds_recorder_same_clinic
    foreign key (recorded_by, clinic_id) references doctors (id, clinic_id)
);

create index estimates_patient_idx on estimates (patient_id, created_at desc);
create index estimate_items_estimate_idx on estimate_items (estimate_id, sort_order);
create index invoices_patient_idx on invoices (patient_id, status, created_at desc);
create index invoices_due_idx on invoices (clinic_id, due_at) where status in ('issued', 'part_paid', 'overdue');
create index invoice_items_invoice_idx on invoice_items (invoice_id, sort_order);
create index payments_invoice_idx on payments (invoice_id, received_at desc);
create index payments_patient_idx on payments (patient_id, received_at desc);
create index refunds_payment_idx on refunds (payment_id, refunded_at desc);

create trigger estimates_updated_at before update on estimates
  for each row execute function touch_practice_updated_at();
create trigger invoices_updated_at before update on invoices
  for each row execute function touch_practice_updated_at();
create trigger estimates_audit after insert or update or delete on estimates
  for each row execute function record_audit();
create trigger estimate_items_audit after insert or update or delete on estimate_items
  for each row execute function record_audit();
create trigger invoices_audit after insert or update or delete on invoices
  for each row execute function record_audit();
create trigger invoice_items_audit after insert or update or delete on invoice_items
  for each row execute function record_audit();
create trigger payments_audit after insert or update or delete on payments
  for each row execute function record_audit();
create trigger refunds_audit after insert or update or delete on refunds
  for each row execute function record_audit();

alter table estimates enable row level security;
alter table estimate_items enable row level security;
alter table invoices enable row level security;
alter table invoice_items enable row level security;
alter table payments enable row level security;
alter table refunds enable row level security;

create policy estimates_access on estimates for all to authenticated
  using (clinic_id = (select auth_clinic_id()) and has_practice_access('finance', false))
  with check (clinic_id = (select auth_clinic_id()) and has_practice_access('finance', true));
create policy estimate_items_access on estimate_items for all to authenticated
  using (clinic_id = (select auth_clinic_id()) and has_practice_access('finance', false))
  with check (clinic_id = (select auth_clinic_id()) and has_practice_access('finance', true));
create policy invoices_access on invoices for all to authenticated
  using (clinic_id = (select auth_clinic_id()) and has_practice_access('finance', false))
  with check (clinic_id = (select auth_clinic_id()) and has_practice_access('finance', true));
create policy invoice_items_access on invoice_items for all to authenticated
  using (clinic_id = (select auth_clinic_id()) and has_practice_access('finance', false))
  with check (clinic_id = (select auth_clinic_id()) and has_practice_access('finance', true));
create policy payments_access on payments for all to authenticated
  using (clinic_id = (select auth_clinic_id()) and has_practice_access('finance', false))
  with check (clinic_id = (select auth_clinic_id()) and has_practice_access('finance', true));
create policy refunds_access on refunds for all to authenticated
  using (clinic_id = (select auth_clinic_id()) and has_practice_access('finance', false))
  with check (clinic_id = (select auth_clinic_id()) and has_practice_access('finance', true));

revoke all on estimates, estimate_items, invoices, invoice_items, payments, refunds from anon;
grant select, insert, update, delete on estimates, estimate_items, invoices, invoice_items, payments, refunds to authenticated;

