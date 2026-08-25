-- docregister — audit trail, rate limiting, usage metering, audio retention
--
-- The schema in 0001 answers "can this doctor reach this row". This migration
-- answers the three questions that come immediately after it in any clinic
-- deployment or DPDP/ABDM review:
--
--   who looked at this patient's chart, and when   -> audit_log
--   what stops one account melting the API bill    -> rate_limits
--   how long do we keep the raw voice recording    -> retention

-- ---------------------------------------------------------------------------
-- Audit trail
-- ---------------------------------------------------------------------------

create type audit_action as enum ('insert', 'update', 'delete', 'read', 'export', 'commit');

create table audit_log (
  id          bigserial primary key,
  clinic_id   uuid not null references clinics (id) on delete cascade,
  -- Nullable: a row can outlive the account that wrote it, and losing the
  -- actor's name must not delete the fact that the access happened.
  actor_id    uuid references doctors (id) on delete set null,
  action      audit_action not null,
  entity      text not null,               -- 'encounters' | 'patients' | …
  entity_id   uuid,
  -- Which columns changed. Deliberately *not* the values: an audit log that
  -- copies every diagnosis is a second, less protected copy of the record.
  changed     text[] not null default '{}',
  detail      jsonb,                       -- non-PHI context only
  at          timestamptz not null default now()
);

create index audit_log_clinic_at_idx on audit_log (clinic_id, at desc);
create index audit_log_entity_idx on audit_log (entity, entity_id, at desc);

alter table audit_log enable row level security;

-- Read-only, and only within your own clinic. There is deliberately no insert,
-- update or delete policy: writes arrive through the security-definer trigger
-- below, so an authenticated session cannot forge an entry or erase its own
-- tracks even with a stolen publishable key.
create policy audit_log_read on audit_log
  for select using (clinic_id = auth_clinic_id());

create or replace function record_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row      record  := coalesce(new, old);
  v_action   audit_action;
  v_changed  text[]  := '{}';
begin
  if tg_op = 'INSERT' then
    v_action := 'insert';
  elsif tg_op = 'DELETE' then
    v_action := 'delete';
  else
    -- A draft becoming a register entry is the moment that matters clinically,
    -- so it gets its own action rather than being one 'update' among many.
    v_action := case
      when new.status is distinct from old.status and new.status = 'committed'
      then 'commit'::audit_action
      else 'update'::audit_action
    end;

    select coalesce(array_agg(key), '{}')
      into v_changed
    from jsonb_each(to_jsonb(new)) n
    where n.value is distinct from (to_jsonb(old) -> n.key);
  end if;

  insert into audit_log (clinic_id, actor_id, action, entity, entity_id, changed)
  values (v_row.clinic_id, auth.uid(), v_action, tg_table_name, v_row.id, v_changed);

  return null;  -- AFTER trigger; the return value is ignored
end;
$$;

create trigger encounters_audit
  after insert or update or delete on encounters
  for each row execute function record_audit();

create trigger patients_audit
  after insert or update or delete on patients
  for each row execute function record_audit();

-- ---------------------------------------------------------------------------
-- Rate limiting
-- ---------------------------------------------------------------------------

-- Postgres-backed rather than in-process. A per-instance in-memory bucket is a
-- suggestion, not a limit: it resets on deploy and multiplies by the number of
-- running instances. The database is already on every one of these paths.

create table rate_limit_policies (
  action          text primary key,
  max_requests    int  not null,
  window_seconds  int  not null,
  constraint rate_limit_policies_sane
    check (max_requests > 0 and window_seconds > 0)
);

-- The limits live here, not in the function's arguments. `consume_rate_limit`
-- is reachable over PostgREST by any authenticated session, so a limit passed
-- as an argument would be a limit the caller gets to choose.
insert into rate_limit_policies (action, max_requests, window_seconds) values
  -- Each dictation is one paid STT call. A busy clinic runs 4-6 patients an
  -- hour; 40 leaves headroom for retries without leaving a stolen session able
  -- to run up a bill.
  ('transcribe', 40,  3600),
  ('extract',    60,  3600),
  ('recall',     60,  3600),
  ('commit',    120,  3600),
  -- Patient search is cheap but it is also the enumeration path: it is the one
  -- endpoint that will happily confirm whether a name exists in a clinic.
  ('match',     240,  3600);

create table rate_limits (
  bucket_key   text        not null,
  window_start timestamptz not null,
  hits         int         not null default 0,
  primary key (bucket_key, window_start)
);

create index rate_limits_window_idx on rate_limits (window_start);

alter table rate_limit_policies enable row level security;
alter table rate_limits enable row level security;
-- No policies at all: both tables are reachable only through the security
-- definer function below.

/**
 * Consume one unit against the caller's own bucket.
 *
 * Returns true when the request may proceed. The bucket key is built from
 * `auth.uid()` inside the function, so a caller cannot spend someone else's
 * quota or mint themselves a fresh one by varying an argument.
 */
create or replace function consume_rate_limit(p_action text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_policy   rate_limit_policies;
  v_uid      uuid := auth.uid();
  v_window   timestamptz;
  v_hits     int;
begin
  if v_uid is null then
    return false;              -- unauthenticated callers get nothing
  end if;

  select * into v_policy from rate_limit_policies where action = p_action;

  if not found then
    -- An unknown action is a bug or a probe. Fail closed, but not silently —
    -- 10/hour is low enough to notice and high enough not to brick a rollout
    -- that added an endpoint before its policy row.
    v_policy.max_requests   := 10;
    v_policy.window_seconds := 3600;
  end if;

  -- Fixed window. A sliding window is more precise at the boundary and costs a
  -- row per request to keep; the failure mode here is at worst 2x the limit
  -- across a window edge, which is the right trade for abuse control.
  v_window := to_timestamp(
    floor(extract(epoch from now()) / v_policy.window_seconds) * v_policy.window_seconds
  );

  insert into rate_limits (bucket_key, window_start, hits)
  values (v_uid::text || ':' || p_action, v_window, 1)
  on conflict (bucket_key, window_start)
    do update set hits = rate_limits.hits + 1
  returning hits into v_hits;

  return v_hits <= v_policy.max_requests;
end;
$$;

revoke all on function consume_rate_limit(text) from public;
grant execute on function consume_rate_limit(text) to authenticated;

-- Old windows are dead weight. Called opportunistically from the app rather
-- than requiring pg_cron, which is not enabled on every Supabase plan.
create or replace function prune_rate_limits()
returns void
language sql
security definer
set search_path = public
as $$
  delete from rate_limits where window_start < now() - interval '2 days';
$$;

-- ---------------------------------------------------------------------------
-- Audio retention
-- ---------------------------------------------------------------------------

-- The recording is the most sensitive artifact this app holds: a doctor's and a
-- patient's actual voices, discussing a diagnosis. It has no clinical use once
-- the transcript is confirmed — it exists so a disputed extraction can be
-- checked against what was said. That window is short.
alter table transcripts
  add column audio_expires_at timestamptz
    default (now() + interval '30 days'),
  add column audio_deleted_at timestamptz;

comment on column transcripts.audio_expires_at is
  'When the raw audio becomes eligible for deletion. The transcript text is the medical record and is never expired by this mechanism.';

create index transcripts_audio_expiry_idx
  on transcripts (audio_expires_at)
  where audio_path is not null and audio_deleted_at is null;

-- Storage objects cannot be removed from SQL, so this hands the caller the
-- paths and the application deletes them, then calls `mark_audio_deleted`.
create or replace function expired_audio_paths(p_limit int default 500)
returns table (id uuid, audio_path text)
language sql
stable
security invoker
as $$
  select t.id, t.audio_path
  from transcripts t
  where t.clinic_id = auth_clinic_id()
    and t.audio_path is not null
    and t.audio_deleted_at is null
    and t.audio_expires_at < now()
  order by t.audio_expires_at
  limit p_limit;
$$;

create or replace function mark_audio_deleted(p_ids uuid[])
returns int
language sql
security invoker
as $$
  with updated as (
    update transcripts
       set audio_deleted_at = now(),
           audio_path       = null
     where id = any(p_ids)
       and clinic_id = auth_clinic_id()
    returning 1
  )
  select count(*)::int from updated;
$$;
