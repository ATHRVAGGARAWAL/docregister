-- docregister — concurrency-safe appointment booking and lifecycle integrity.
--
-- Application-side overlap queries cannot protect against two requests that
-- arrive together: both can observe a free slot and then both insert it. GiST
-- exclusion constraints make that decision inside PostgreSQL, where one of
-- the conflicting transactions is guaranteed to fail with SQLSTATE 23P01.

create extension if not exists btree_gist;

alter table appointments
  add constraint appointments_clinician_no_overlap
  exclude using gist (
    clinic_id with =,
    clinician_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (clinician_id is not null and status not in ('cancelled', 'no_show'));

alter table appointments
  add constraint appointments_operatory_no_overlap
  exclude using gist (
    clinic_id with =,
    operatory_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (operatory_id is not null and status not in ('cancelled', 'no_show'));

create or replace function enforce_appointment_integrity()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'completed' then
      raise exception using
        errcode = '23514',
        message = 'completed appointment cannot be deleted',
        constraint = 'appointments_completed_delete_check';
    end if;
    return old;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  if not (
    (old.status = 'scheduled' and new.status in ('confirmed', 'checked_in', 'cancelled', 'no_show'))
    or (old.status = 'confirmed' and new.status in ('scheduled', 'checked_in', 'cancelled', 'no_show'))
    or (old.status = 'checked_in' and new.status in ('confirmed', 'in_chair', 'cancelled'))
    or (old.status = 'in_chair' and new.status in ('checked_in', 'completed'))
  ) then
    raise exception using
      errcode = '23514',
      message = 'invalid appointment status transition',
      constraint = 'appointments_status_transition_check';
  end if;

  if new.status = 'checked_in' and new.checked_in_at is null then
    new.checked_in_at := now();
  end if;

  if new.status = 'completed' and new.completed_at is null then
    new.completed_at := now();
  end if;

  return new;
end;
$$;

revoke execute on function enforce_appointment_integrity() from public, anon, authenticated;

create trigger appointments_enforce_integrity
before update or delete on appointments
for each row execute function enforce_appointment_integrity();

-- The HTTP DELETE route is intentionally a status update. Keep ordinary
-- authenticated clients on that audited soft-delete path; the trigger above
-- remains the final guard for privileged maintenance and cascading deletes.
revoke delete on appointments from authenticated;
