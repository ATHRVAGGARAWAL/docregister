-- docregister — the index and RLS decisions behind the performance advisories
--
-- The advisor reports twenty-one foreign keys with no covering index and two
-- policies that re-evaluate auth per row. The policies are rewritten below. Not
-- one of the twenty-one keys is given an index, so the advisory still lists all
-- twenty-one after this migration; that is the decision, not an oversight.
--
-- An index is not free. This app writes on every consultation, and an index on
-- a hot table is paid for on each insert and on each update that touches its
-- columns, forever, in exchange for a read that may never happen. So every
-- flagged key was judged on the two questions that decide whether it will ever
-- be read: does a delete of the parent row actually happen in this app, and is
-- the column ever a query predicate. All twenty-one answer no to both, and each
-- verdict is written down at the bottom of this file so the next person reading
-- the same advisory does not have to re-derive it.
--
-- The two indexes this file does create are not on that list and do not shorten
-- it. They serve two reads the app performs constantly, on columns the lint
-- already treated as covered: it matches a foreign key against an index's
-- leading columns, in the key's own order, and never looks at a partial index's
-- predicate. The pre-existing partial indexes leading with encounters.doctor_id
-- and encounters.patient_id satisfy it while serving neither query.
--
-- Nothing here uses CREATE INDEX CONCURRENTLY. The migration runner executes
-- each file inside a single transaction, which a concurrent build is not
-- allowed to join, and a concurrent build that fails leaves an INVALID index
-- behind that the `if not exists` below would then silently accept forever — a
-- dead index nobody notices because the migration reports success. A plain
-- build holds SHARE on encounters, so reads continue and writes wait for the
-- seconds a clinic-sized table takes. If encounters has grown past what a
-- clinic can wait out, run these two statements by hand with CONCURRENTLY
-- outside the migration and then mark this file applied.

-- ---------------------------------------------------------------------------
-- The two indexes worth their write cost
-- ---------------------------------------------------------------------------

-- The patient directory measures a chart's visit history with
--
--   from encounters e where e.patient_id in (…) group by e.patient_id
--
-- and puts `status = 'committed'` inside the aggregate's FILTER rather than in
-- the WHERE, deliberately: a chart whose only encounter is an unreviewed draft
-- has to come back with zero visits, not be dropped. encounters_patient_time_idx
-- is partial on that same status and so cannot serve a scan that must also see
-- the drafts, which leaves the directory sequentially scanning every encounter
-- in the database on each debounced keystroke. That read is on the doctor's
-- critical path while they are typing a name, which is what buys this index its
-- place on the busiest clinical table. It also turns the ON DELETE SET NULL
-- from patients into a lookup instead of that same scan.
--
-- Partial because a draft carries no patient until the doctor confirms one, and
-- neither the directory's `in (…)` nor a foreign key probe ever looks for null.
create index if not exists encounters_patient_idx
  on encounters (patient_id)
  where patient_id is not null;

-- doctor_id reached the advisory only as half of encounters_doctor_same_clinic,
-- which on its own would not be worth an index. What earns it is the register:
-- register_search and register_totals both scan
--
--   doctor_id = auth.uid() and occurred_at >= … and status in
--   ('committed', 'draft', 'discarded')
--
-- and every existing doctor_id index is partial — two on a single status, one
-- on the presence of an idempotency key — so once 0019 added 'discarded' to
-- that list not even a bitmap of them could satisfy the predicate. The app's
-- most-opened screen has been sequentially scanning encounters ever since.
-- This index makes it a bounded range scan; occurred_at is second because the
-- date floor, not the status, is what narrows the register.
--
-- Note this does not silence the advisory. The lint wants an index whose
-- leading columns are exactly (doctor_id, clinic_id); extending this one to
-- match would buy nothing, because a doctor belongs to exactly one clinic and
-- the extra column can never remove a row the first one kept.
create index if not exists encounters_doctor_occurred_idx
  on encounters (doctor_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- RLS: hoist auth out of the per-row filter
-- ---------------------------------------------------------------------------

-- A bare auth call in a policy is re-executed for every row the scan touches.
-- Wrapping it in a scalar subquery makes it an InitPlan that runs once per
-- statement instead. The wrapped functions are STABLE and take no arguments, so
-- the value cannot differ between rows and the set of rows each policy admits
-- is unchanged — which is the only thing that matters here, because both of
-- these are tenant boundaries. Each policy below is otherwise reproduced
-- verbatim from the migration that introduced it.
--
-- auth_clinic_id() is wrapped for the same reason even though the advisory does
-- not name it: it only reports calls into the auth schema and cannot see that
-- this function's body is a select on doctors keyed by auth.uid(). Left bare it
-- would be the more expensive of the two per-row calls.

drop policy if exists account_entries_read_own on account_entries;

create policy account_entries_read_own on account_entries
  for select to authenticated
  using (clinic_id = (select auth_clinic_id()) and doctor_id = (select auth.uid()));

drop policy if exists clinic_invites_owner_read on clinic_invites;

-- The EXISTS stays correlated on clinic_invites.clinic_id and stays a
-- membership test rather than becoming an equality against a single clinic:
-- what this permits is "an owner of the clinic that owns this invite", and an
-- owner of some other clinic must keep failing it.
create policy clinic_invites_owner_read on clinic_invites
  for select to authenticated
  using (
    exists (
      select 1
      from doctors d
      where d.id = (select auth.uid())
        and d.clinic_id = clinic_invites.clinic_id
        and d.role = 'owner'
    )
  );

-- ---------------------------------------------------------------------------
-- The twenty-one foreign keys the advisory lists, and why each stays unindexed
-- ---------------------------------------------------------------------------
--
-- Three facts about this schema decide most of the list.
--
-- Doctors are effectively undeletable. account_entries.doctor_id,
-- encounter_amendments.author_id and follow_ups.created_by are all ON DELETE
-- RESTRICT, so any doctor who has taken a fee, corrected a record or booked a
-- follow-up cannot be removed at all. Every other doctor-parent key exists to
-- serve a SET NULL that will almost never run, and when it does it runs once,
-- offline, on an account that did no clinical work.
--
-- Clinics and patients are never deleted by this app — no workflow function and
-- no route issues a DELETE against either. The one hot delete in the schema is
-- `delete from prescription_items where encounter_id = …`, which rewrites a
-- draft's prescription on every review edit, and prescription_items_encounter_idx
-- already covers it.
--
-- A same-clinic guard is never the driver of a query. Its clinic_id is
-- functionally determined by the id beside it, so an index leading with the id
-- and continuing into clinic_id is exactly as selective as the id alone. Where
-- an index on the id exists the guard's probe uses it and rechecks clinic_id
-- from the heap; where none exists, the guard by itself is not a reason to
-- build one. The advisor cannot see this and will keep reporting these keys.
--
-- Per table:
--
--   account_entries.clinic_id — the ledger's own policy permits nothing but
--     doctor-scoped reads, so clinic_id is never a predicate. Only a tenant
--     teardown would read it.
--   account_entries (doctor_id, clinic_id) — account_entries_doctor_occurred_idx
--     already leads with doctor_id.
--   audit_log.actor_id — a trigger writes a row here on every insert, update
--     and delete in the schema, which makes this the most write-heavy table in
--     the app and the worst place to carry an index nobody reads. The audit
--     trail is queried by clinic and by entity, never by actor.
--   clinic_invites.consumed_by, (consumed_by, clinic_id), (created_by, clinic_id)
--     — an invite table is bounded by how many people a clinic has ever
--     invited. The planner will read the one page sequentially whatever we
--     build, so an index here would be pure write cost.
--   encounter_amendments.author_id — amendments are read per encounter and per
--     clinic-day, both already indexed, and the author's name is resolved
--     afterwards by doctors.id. A RESTRICT parent link, never a search key.
--   encounters (doctor_id, clinic_id), (patient_id, clinic_id) — same-clinic
--     guards. A probe drives off the doctor_id or patient_id index above and
--     rechecks clinic_id from the heap.
--   encounters (transcript_id, clinic_id, doctor_id) — served by
--     encounters_one_per_transcript_idx. Its `transcript_id is not null`
--     predicate is implied by the probe's equality, so the planner can use it.
--   follow_ups.patient_id, follow_ups.completed_by and the four same-clinic
--     guards — list_follow_ups always drives from clinic_id and joins out by
--     primary key, so none of these columns is ever a predicate, and their
--     delete paths are a patient erasure and a doctor removal that this app
--     does not perform.
--   patients.created_by and (created_by, clinic_id) — 0001 states in the
--     column's own comment that it is kept for audit and not for access
--     control. Nothing filters on it.
--   prescription_items (encounter_id, clinic_id) — prescription_items_encounter_idx
--     leads with encounter_id and serves both this guard and the draft rewrite.
--   transcripts.clinic_id and (doctor_id, clinic_id) — a transcript is reached
--     by id from its encounter or by doctor_id, which transcripts_doctor_idx
--     covers. clinic_id's only reader is a tenant teardown.
