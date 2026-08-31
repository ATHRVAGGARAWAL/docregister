-- docregister — staged treatment plans linked to completed clinical work.

create table treatment_plans (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references clinics (id) on delete cascade,
  patient_id    uuid not null references patients (id) on delete restrict,
  clinician_id  uuid references doctors (id) on delete set null,
  title         text not null,
  diagnosis     text,
  status        text not null default 'draft',
  priority      text not null default 'routine',
  accepted_at   timestamptz,
  completed_at  timestamptz,
  created_by    uuid references doctors (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint treatment_plans_id_clinic_key unique (id, clinic_id),
  constraint treatment_plans_title_check check (char_length(btrim(title)) between 1 and 160),
  constraint treatment_plans_diagnosis_check check (diagnosis is null or char_length(diagnosis) <= 2000),
  constraint treatment_plans_status_check check (status in ('draft', 'proposed', 'accepted', 'active', 'completed', 'cancelled')),
  constraint treatment_plans_priority_check check (priority in ('urgent', 'high', 'routine', 'elective')),
  constraint treatment_plans_patient_same_clinic
    foreign key (patient_id, clinic_id) references patients (id, clinic_id),
  constraint treatment_plans_clinician_same_clinic
    foreign key (clinician_id, clinic_id) references doctors (id, clinic_id),
  constraint treatment_plans_creator_same_clinic
    foreign key (created_by, clinic_id) references doctors (id, clinic_id)
);

create table treatment_plan_items (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid not null references clinics (id) on delete cascade,
  plan_id          uuid not null references treatment_plans (id) on delete cascade,
  catalogue_id     uuid references procedure_catalogue (id) on delete set null,
  procedure_name   text not null,
  scope            dental_scope not null default 'tooth',
  tooth_fdi        smallint,
  quadrant         smallint,
  arch             dental_arch,
  surfaces         text[] not null default '{}',
  status           text not null default 'planned',
  phase            smallint not null default 1,
  planned_sittings smallint,
  quantity         numeric(8,2) not null default 1,
  unit_price_paise bigint not null default 0,
  discount_paise   bigint not null default 0,
  note             text,
  sort_order       int not null default 0,
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint treatment_plan_items_id_clinic_key unique (id, clinic_id),
  constraint treatment_plan_items_plan_same_clinic
    foreign key (plan_id, clinic_id) references treatment_plans (id, clinic_id),
  constraint treatment_plan_items_catalogue_same_clinic
    foreign key (catalogue_id, clinic_id) references procedure_catalogue (id, clinic_id),
  constraint treatment_plan_items_name_check check (char_length(btrim(procedure_name)) between 1 and 160),
  constraint treatment_plan_items_tooth_check check (is_fdi_tooth(tooth_fdi)),
  constraint treatment_plan_items_quadrant_check check (quadrant is null or quadrant between 1 and 8),
  constraint treatment_plan_items_scope_check check (
    case scope
      when 'tooth' then tooth_fdi is not null and quadrant is null and arch is null
      when 'quadrant' then quadrant is not null and tooth_fdi is null and arch is null
      when 'arch' then arch is not null and tooth_fdi is null and quadrant is null
      else tooth_fdi is null and quadrant is null and arch is null
    end
  ),
  constraint treatment_plan_items_surfaces_check check (
    surfaces <@ array['M','O','I','D','B','F','L','P']::text[] and (scope = 'tooth' or cardinality(surfaces) = 0)
  ),
  constraint treatment_plan_items_status_check check (status in ('planned', 'scheduled', 'in_progress', 'completed', 'deferred', 'cancelled')),
  constraint treatment_plan_items_phase_check check (phase between 1 and 20),
  constraint treatment_plan_items_sittings_check check (planned_sittings is null or planned_sittings between 1 and 60),
  constraint treatment_plan_items_quantity_check check (quantity > 0 and quantity <= 100),
  constraint treatment_plan_items_money_check check (
    unit_price_paise >= 0 and discount_paise >= 0 and discount_paise <= unit_price_paise * quantity
  ),
  constraint treatment_plan_items_note_check check (note is null or char_length(note) <= 1500)
);

alter table encounter_procedures
  add constraint encounter_procedures_plan_item_same_clinic
  foreign key (plan_item_id, clinic_id) references treatment_plan_items (id, clinic_id)
  not valid;

alter table encounter_procedures validate constraint encounter_procedures_plan_item_same_clinic;

create index treatment_plans_patient_idx on treatment_plans (patient_id, status, updated_at desc);
create index treatment_plans_clinician_idx on treatment_plans (clinician_id, status, updated_at desc)
  where clinician_id is not null;
create index treatment_plan_items_plan_idx on treatment_plan_items (plan_id, phase, sort_order);
create index treatment_plan_items_tooth_idx on treatment_plan_items (clinic_id, tooth_fdi)
  where tooth_fdi is not null;

create trigger treatment_plans_updated_at before update on treatment_plans
  for each row execute function touch_practice_updated_at();
create trigger treatment_plan_items_updated_at before update on treatment_plan_items
  for each row execute function touch_practice_updated_at();
create trigger treatment_plans_audit after insert or update or delete on treatment_plans
  for each row execute function record_audit();
create trigger treatment_plan_items_audit after insert or update or delete on treatment_plan_items
  for each row execute function record_audit();

alter table treatment_plans enable row level security;
alter table treatment_plan_items enable row level security;

create policy treatment_plans_access on treatment_plans for all to authenticated
  using (clinic_id = (select auth_clinic_id()) and has_practice_access('treatment', false))
  with check (clinic_id = (select auth_clinic_id()) and has_practice_access('treatment', true));
create policy treatment_plan_items_access on treatment_plan_items for all to authenticated
  using (clinic_id = (select auth_clinic_id()) and has_practice_access('treatment', false))
  with check (clinic_id = (select auth_clinic_id()) and has_practice_access('treatment', true));

revoke all on treatment_plans, treatment_plan_items from anon;
grant select, insert, update, delete on treatment_plans, treatment_plan_items to authenticated;

-- 0025 reserved plan_item_id but did not write it. Replace the internal writer
-- now that the target table exists, preserving the same signature and grants.
create or replace function replace_procedure_items_internal(
  p_encounter_id uuid,
  p_clinic_id uuid,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'procedures must be an array' using errcode = 'check_violation';
  end if;

  if jsonb_array_length(p_items) > 100 then
    raise exception 'an encounter cannot contain more than 100 procedures'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) item
    where jsonb_typeof(item) <> 'object'
       or not (item ? 'procedure_name')
       or jsonb_typeof(item -> 'procedure_name') <> 'string'
       or nullif(btrim(item ->> 'procedure_name'), '') is null
       or (item ? 'catalogue_id' and jsonb_typeof(item -> 'catalogue_id') not in ('string', 'null'))
       or (item ? 'plan_item_id' and jsonb_typeof(item -> 'plan_item_id') not in ('string', 'null'))
       or (item ? 'scope' and jsonb_typeof(item -> 'scope') not in ('string', 'null'))
       or (item ? 'tooth_fdi' and jsonb_typeof(item -> 'tooth_fdi') not in ('number', 'null'))
       or (item ? 'quadrant' and jsonb_typeof(item -> 'quadrant') not in ('number', 'null'))
       or (item ? 'arch' and jsonb_typeof(item -> 'arch') not in ('string', 'null'))
       or (item ? 'surfaces' and jsonb_typeof(item -> 'surfaces') not in ('array', 'null'))
       or (item ? 'sitting_number' and jsonb_typeof(item -> 'sitting_number') not in ('number', 'null'))
       or (item ? 'total_sittings' and jsonb_typeof(item -> 'total_sittings') not in ('number', 'null'))
       or (item ? 'status' and jsonb_typeof(item -> 'status') not in ('string', 'null'))
       or (item ? 'notes' and jsonb_typeof(item -> 'notes') not in ('string', 'null'))
       or (item ? 'needs_review' and jsonb_typeof(item -> 'needs_review') not in ('boolean', 'null'))
  ) then
    raise exception 'procedures contain an invalid item' using errcode = 'check_violation';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) item
    join encounters e on e.id = p_encounter_id and e.clinic_id = p_clinic_id
    where nullif(item ->> 'plan_item_id', '') is not null
      and not exists (
        select 1
        from treatment_plan_items tpi
        join treatment_plans tp on tp.id = tpi.plan_id and tp.clinic_id = tpi.clinic_id
        where tpi.id = (item ->> 'plan_item_id')::uuid
          and tpi.clinic_id = p_clinic_id
          and tp.patient_id = e.patient_id
      )
  ) then
    raise exception 'a treatment plan item does not belong to this patient'
      using errcode = 'check_violation';
  end if;

  delete from encounter_procedures where encounter_id = p_encounter_id;

  insert into encounter_procedures (
    encounter_id, clinic_id, catalogue_id, plan_item_id, procedure_name,
    scope, tooth_fdi, quadrant, arch, surfaces, sitting_number,
    total_sittings, status, notes, needs_review, position
  )
  select
    p_encounter_id,
    p_clinic_id,
    (
      select c.id from procedure_catalogue c
      where c.id = nullif(item ->> 'catalogue_id', '')::uuid
        and c.clinic_id = p_clinic_id
    ),
    nullif(item ->> 'plan_item_id', '')::uuid,
    left(btrim(item ->> 'procedure_name'), 160),
    coalesce(nullif(item ->> 'scope', '')::dental_scope, 'tooth'),
    (item ->> 'tooth_fdi')::smallint,
    (item ->> 'quadrant')::smallint,
    nullif(item ->> 'arch', '')::dental_arch,
    coalesce(
      (
        select array_agg(distinct upper(btrim(s.value)))
        from jsonb_array_elements_text(coalesce(item -> 'surfaces', '[]'::jsonb)) s(value)
        where nullif(btrim(s.value), '') is not null
      ),
      '{}'::text[]
    ),
    (item ->> 'sitting_number')::smallint,
    (item ->> 'total_sittings')::smallint,
    coalesce(nullif(btrim(item ->> 'status'), ''), 'completed'),
    left(nullif(btrim(item ->> 'notes'), ''), 1000),
    coalesce((item ->> 'needs_review')::boolean, false),
    (ordinality - 1)::int
  from jsonb_array_elements(p_items) with ordinality as rows(item, ordinality);
end;
$$;

revoke all on function replace_procedure_items_internal(uuid, uuid, jsonb) from public, anon, authenticated;

