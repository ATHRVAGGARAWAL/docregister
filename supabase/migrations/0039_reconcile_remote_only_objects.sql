-- docregister — write down the objects that only ever existed on the server.
--
-- Eight migrations were applied to the remote project through the Supabase MCP
-- `apply_migration` tool without a matching file ever being written:
--
--   follow_ups_fix_variable_conflict   clinic_join_signup_trigger
--   pending_clinic_name                audio_retention_schedule
--   vault_setter_temporary             retention_secret_setter
--   audio_retention_cron               audio_retention_health
--
-- The result is a repository that cannot rebuild its own database. A fresh
-- `supabase db reset`, a staging environment, or a recovery from a bad push
-- would all come up missing `pending_clinic_name` — which `src/app/page.tsx`
-- calls on every pending doctor's first load — and the entire audio-retention
-- job, which is the only thing stopping dictation recordings accumulating
-- forever under a policy that says they must not.
--
-- Every definition below was read back from the live project with
-- `pg_get_functiondef` rather than reconstructed from memory, so this file is
-- what is actually running. `create or replace` throughout: on the remote these
-- are no-ops that re-assert what is already there, and on a fresh database they
-- are the real thing.
--
-- Two of the original eight are deliberately absent:
--
--   * `follow_ups_fix_variable_conflict` — its content did land in the repo,
--     folded into 0015 (`#variable_conflict use_column`). Verified.
--   * `clinic_join_signup_trigger` — `handle_new_doctor` is fully defined by
--     0023, which is in the repo. The separate migration only re-applied it.
--
-- What this file CANNOT reproduce is the secret itself. `set_retention_secret`
-- is here; the value it stores is not, and must not be — see the note at the
-- bottom.

-- ---------------------------------------------------------------------------
-- Extensions the retention job runs on
-- ---------------------------------------------------------------------------

-- `pg_net` issues the outbound HTTP call and `pg_cron` schedules it. Both are
-- Supabase-managed and live outside `public`.
--
-- Guarded on availability rather than written as a bare `create extension`,
-- because a plain PostgreSQL has neither and `scripts/validate-migrations.sh`
-- applies this chain to exactly that. The guard reads
-- `pg_available_extensions`, so it skips only where the extension genuinely
-- cannot be installed and still fails loudly on a real deployment problem —
-- unlike an exception handler, which would swallow anything.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The clinic a pending doctor is waiting on
-- ---------------------------------------------------------------------------

-- `auth_clinic_id()` returns null until an owner admits a doctor, so a pending
-- member's every query comes back empty — including the name of the clinic they
-- just asked to join. This is the one fact they are allowed to see before
-- admission, and it is scoped to the row that names them: the join to `doctors`
-- on `auth.uid()` means a caller cannot read the name of a clinic they have not
-- applied to.
create or replace function pending_clinic_name(p_clinic_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.name
  from clinics c
  join doctors d on d.clinic_id = c.id
  where d.id = auth.uid()
    and c.id = p_clinic_id
$$;

revoke execute on function pending_clinic_name(uuid) from public, anon;
grant execute on function pending_clinic_name(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Audio retention
-- ---------------------------------------------------------------------------

-- The shared secret between this database and the retention route.
--
-- Held in a table rather than passed as a cron argument, because a cron command
-- is world-readable in `cron.job` to anyone who can select it. The value is
-- bytea only to keep it out of casual `select *` output in the dashboard; that
-- is obfuscation, not encryption, and the row is protected by RLS being enabled
-- with no policy — nothing but a SECURITY DEFINER function reaches it.
create table if not exists app_private_settings (
  key   text primary key,
  value bytea not null
);

alter table app_private_settings enable row level security;
revoke all on app_private_settings from anon, authenticated;

create or replace function set_retention_secret(p_secret text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if length(coalesce(p_secret, '')) < 32 then
    raise exception 'retention secret must be at least 32 characters';
  end if;

  insert into app_private_settings (key, value)
  values ('audio_retention_secret', convert_to(p_secret, 'UTF8'))
  on conflict (key) do update set value = excluded.value;
end;
$$;

revoke execute on function set_retention_secret(text) from public, anon, authenticated;

-- Calls the app's retention route, which is the only place that knows how to
-- delete a storage object and null the pointer in the same breath.
create or replace function run_audio_retention()
returns bigint
language plpgsql
security definer
set search_path = public, extensions, net, pg_temp
as $$
declare
  v_secret text;
  v_request_id bigint;
begin
  select convert_from(value, 'UTF8') into v_secret
  from app_private_settings
  where key = 'audio_retention_secret';

  if v_secret is null then
    -- Loud rather than silent. A purge that never runs looks identical to a
    -- purge that finds nothing, and the whole point of this job is that
    -- recordings stop accumulating.
    raise exception 'audio_retention_secret is not set in app_private_settings';
  end if;

  select net.http_post(
    url     := 'https://docregister.athrv.dev/api/maintenance/audio-retention?limit=500',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-retention-secret', v_secret
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke execute on function run_audio_retention() from public, anon, authenticated;

-- Did last night's purge actually happen?
--
-- `pg_net` answers asynchronously, so the cron job's own exit status says only
-- that the request was queued. The response lands in `net._http_response`, and
-- this turns the four outcomes that matter into words a human can act on —
-- "secret mismatch" is a different problem from "unreachable".
create or replace function audio_retention_health(p_limit integer default 10)
returns table (
  ran_at timestamptz,
  status_code integer,
  outcome text,
  detail text
)
language sql
stable
security definer
set search_path = public, net, pg_temp
as $$
  select
    r.created                                   as ran_at,
    r.status_code,
    case
      when r.error_msg is not null then 'unreachable'
      when r.status_code = 200     then 'purged'
      when r.status_code = 401     then 'secret mismatch'
      when r.status_code = 503     then 'app has no secret configured'
      else 'failed'
    end                                          as outcome,
    coalesce(r.error_msg, left(r.content, 300))  as detail
  from net._http_response r
  order by r.created desc
  limit greatest(p_limit, 1)
$$;

revoke execute on function audio_retention_health(integer) from public, anon;
grant execute on function audio_retention_health(integer) to authenticated;

-- 02:40 IST nightly, expressed in UTC because pg_cron runs on the server clock.
-- Unscheduled first so re-running this file cannot leave two jobs behind, each
-- firing its own purge.
do $$
begin
  perform cron.unschedule('audio-retention-nightly');
exception when others then
  -- No such job on a fresh database, which is the normal case here.
  null;
end $$;

do $$
begin
  perform cron.schedule(
    'audio-retention-nightly',
    '10 21 * * *',
    $cron$select public.run_audio_retention();$cron$
  );
end $$;

-- ---------------------------------------------------------------------------
-- What this file deliberately does not carry
-- ---------------------------------------------------------------------------
--
-- The retention secret itself. A rebuilt database has the machinery and no
-- value, so `run_audio_retention` raises rather than silently posting an
-- unauthenticated request. Restore it out of band, once, with:
--
--     select set_retention_secret('<the same value the app has>');
--
-- and confirm with `select * from audio_retention_health(5)` the next morning.
-- The value must match `AUDIO_RETENTION_SECRET` in the app's environment; if it
-- does not, the health view says "secret mismatch" rather than failing quietly.
