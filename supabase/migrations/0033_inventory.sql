-- docregister — batch-aware inventory with an append-only movement ledger.

create table inventory_items (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references clinics (id) on delete cascade,
  sku            text,
  name           text not null,
  category       text not null default 'consumable',
  unit           text not null default 'unit',
  reorder_level  numeric(12,3) not null default 0,
  is_active      boolean not null default true,
  supplier_name  text,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint inventory_items_id_clinic_key unique (id, clinic_id),
  constraint inventory_items_name_check check (char_length(btrim(name)) between 1 and 160),
  constraint inventory_items_category_check check (category in ('consumable', 'material', 'instrument', 'medicine', 'implant', 'other')),
  constraint inventory_items_unit_check check (char_length(btrim(unit)) between 1 and 40),
  constraint inventory_items_reorder_check check (reorder_level >= 0),
  constraint inventory_items_note_check check (note is null or char_length(note) <= 1500),
  constraint inventory_items_clinic_sku_key unique nulls not distinct (clinic_id, sku)
);

create table inventory_batches (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references clinics (id) on delete cascade,
  item_id        uuid not null references inventory_items (id) on delete cascade,
  batch_number   text,
  expiry_date    date,
  unit_cost_paise bigint,
  received_at    timestamptz not null default now(),
  supplier_name  text,
  created_at     timestamptz not null default now(),

  constraint inventory_batches_id_clinic_key unique (id, clinic_id),
  constraint inventory_batches_item_same_clinic
    foreign key (item_id, clinic_id) references inventory_items (id, clinic_id),
  constraint inventory_batches_cost_check check (unit_cost_paise is null or unit_cost_paise >= 0),
  constraint inventory_batches_item_batch_key unique nulls not distinct (item_id, batch_number)
);

create table inventory_movements (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references clinics (id) on delete cascade,
  item_id        uuid not null references inventory_items (id) on delete restrict,
  batch_id       uuid references inventory_batches (id) on delete restrict,
  appointment_id uuid references appointments (id) on delete set null,
  encounter_id   uuid references encounters (id) on delete set null,
  kind           text not null,
  quantity       numeric(12,3) not null,
  note           text,
  occurred_at    timestamptz not null default now(),
  recorded_by    uuid references doctors (id) on delete set null,
  created_at     timestamptz not null default now(),

  constraint inventory_movements_kind_check check (kind in ('received', 'used', 'adjusted', 'returned', 'expired', 'wasted', 'transferred')),
  constraint inventory_movements_quantity_check check (quantity <> 0 and abs(quantity) <= 1000000),
  constraint inventory_movements_note_check check (note is null or char_length(note) <= 1000),
  constraint inventory_movements_item_same_clinic
    foreign key (item_id, clinic_id) references inventory_items (id, clinic_id),
  constraint inventory_movements_batch_same_clinic
    foreign key (batch_id, clinic_id) references inventory_batches (id, clinic_id),
  constraint inventory_movements_appointment_same_clinic
    foreign key (appointment_id, clinic_id) references appointments (id, clinic_id),
  constraint inventory_movements_encounter_same_clinic
    foreign key (encounter_id, clinic_id) references encounters (id, clinic_id),
  constraint inventory_movements_recorder_same_clinic
    foreign key (recorded_by, clinic_id) references doctors (id, clinic_id)
);

create view inventory_stock with (security_invoker = true) as
select
  i.id,
  i.clinic_id,
  i.sku,
  i.name,
  i.category,
  i.unit,
  i.reorder_level,
  i.is_active,
  i.supplier_name,
  coalesce(sum(m.quantity), 0)::numeric(12,3) as on_hand,
  min(b.expiry_date) filter (
    where b.expiry_date is not null
      and coalesce((select sum(m2.quantity) from inventory_movements m2 where m2.batch_id = b.id), 0) > 0
  ) as nearest_expiry
from inventory_items i
left join inventory_movements m on m.item_id = i.id
left join inventory_batches b on b.id = m.batch_id
group by i.id;

create index inventory_items_clinic_name_idx on inventory_items (clinic_id, is_active desc, name);
create index inventory_batches_item_expiry_idx on inventory_batches (item_id, expiry_date);
create index inventory_movements_item_time_idx on inventory_movements (item_id, occurred_at desc);

create trigger inventory_items_updated_at before update on inventory_items
  for each row execute function touch_practice_updated_at();
create trigger inventory_items_audit after insert or update or delete on inventory_items
  for each row execute function record_audit();
create trigger inventory_batches_audit after insert or update or delete on inventory_batches
  for each row execute function record_audit();
create trigger inventory_movements_audit after insert or update or delete on inventory_movements
  for each row execute function record_audit();

alter table inventory_items enable row level security;
alter table inventory_batches enable row level security;
alter table inventory_movements enable row level security;

create policy inventory_items_access on inventory_items for all to authenticated
  using (clinic_id = (select auth_clinic_id()) and has_practice_access('inventory', false))
  with check (clinic_id = (select auth_clinic_id()) and has_practice_access('inventory', true));
create policy inventory_batches_access on inventory_batches for all to authenticated
  using (clinic_id = (select auth_clinic_id()) and has_practice_access('inventory', false))
  with check (clinic_id = (select auth_clinic_id()) and has_practice_access('inventory', true));
create policy inventory_movements_access on inventory_movements for all to authenticated
  using (clinic_id = (select auth_clinic_id()) and has_practice_access('inventory', false))
  with check (clinic_id = (select auth_clinic_id()) and has_practice_access('inventory', true));

revoke all on inventory_items, inventory_batches, inventory_movements from anon;
revoke all on inventory_stock from anon;
grant select, insert, update, delete on inventory_items, inventory_batches, inventory_movements to authenticated;
grant select on inventory_stock to authenticated;

