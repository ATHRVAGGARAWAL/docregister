# Operations

Runbooks for the scheduled work this app depends on. Everything here is
operator-facing: nothing in this document is reachable by a doctor.

---

## Audio retention — the 30-day purge

### What it does

`POST /api/maintenance/audio-retention` deletes consultation recordings that
are past their retention deadline.

Migration `0004_audit_and_limits.sql` gives every transcript an
`audio_expires_at` of `now() + 30 days` and states the policy: the recording
exists only so a disputed extraction can be checked against what was actually
said, and that window is short. **Only the audio is deleted.** The transcript
text is the medical record and is never expired by this mechanism.

One call:

1. Selects up to `limit` transcripts whose `audio_expires_at` has passed and
   whose audio has not already been deleted, oldest first.
2. Deletes those objects from the `dictations` storage bucket.
3. Sets `audio_deleted_at` and clears `audio_path` **only** for rows whose
   object is confirmed gone.

Step 3 never runs ahead of step 2. If the storage delete fails, the row is left
alone and the next run picks it up again; the alternative would leave the audit
trail claiming a recording was purged while it is still in the bucket.

The route is idempotent and bounded. Calling it twice, or while a previous call
is still running, is safe — the second call finds nothing to do. It is not a
doctor action and is not wrapped in `withDoctor`: it has no session, it sweeps
every clinic, and it runs with the service-role key.

### Configuration

One new environment variable on the deployment that serves the route:

| Variable | Value |
| --- | --- |
| `AUDIO_RETENTION_SECRET` | A long random string, e.g. `openssl rand -hex 32`. Nothing else uses it. |

It is not in `.env.local.example` — add it to your deployment's environment
(Vercel project settings, or wherever the app runs) and to your own `.env.local`
if you want to exercise the route locally.

Until it is set the route answers `503 Audio retention is not configured on
this deployment.` and does nothing. It fails closed on purpose: a missing
secret must never read as "no authentication required" on an endpoint that
deletes across every clinic.

The route also needs `SUPABASE_SERVICE_ROLE_KEY`, which the app already
requires.

### Running it by hand

```bash
curl -sS -X POST \
  -H "x-retention-secret: $AUDIO_RETENTION_SECRET" \
  "https://<your-app-host>/api/maintenance/audio-retention?limit=200"
```

`limit` is optional (default 200, maximum 1000). The response is a summary and
contains no storage paths and nothing patient-identifying:

```json
{
  "ok": true,
  "limit": 200,
  "considered": 12,
  "purged": 12,
  "marked": 12,
  "unconfirmed": 0,
  "failedBatches": 0,
  "remaining": 0,
  "withoutExpiry": 0,
  "startedAt": "2026-08-27T20:30:00.000Z",
  "durationMs": 812
}
```

| Field | Meaning |
| --- | --- |
| `considered` | Expired recordings this batch looked at. |
| `purged` | Objects confirmed gone from the bucket. |
| `marked` | Rows whose bookkeeping was updated. Normally equals `purged`; lower means another run had already closed them. |
| `unconfirmed` | Recordings this run could not confirm were deleted — still present, or in a batch that errored. Left for the next run, never marked. |
| `failedBatches` | Storage delete calls that errored outright. |
| `remaining` | Expired recordings still waiting **after** this batch. The number that says whether the schedule is keeping up. `-1` means the count query itself failed. |
| `withoutExpiry` | Recordings with a `NULL` `audio_expires_at`, which no run will ever purge. See "Known gaps". |

### Dry run

There is no dry-run flag — the endpoint deletes. To see what a run *would*
touch, ask the database directly (read-only, safe to run any time):

```sql
select count(*) as expired,
       min(audio_expires_at) as oldest
from transcripts
where audio_path is not null
  and audio_deleted_at is null
  and audio_expires_at < now();
```

### Scheduling, option A: pg_cron + pg_net (recommended)

Keeps the schedule next to the data, inside the same India-region project, with
no second system to keep alive. Both extensions are available on Supabase but
**not enabled by default** — enable them once, from the SQL editor or
Dashboard → Database → Extensions:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

Store the secret in Vault rather than inline in the job. Job definitions are
readable by anyone who can query `cron.job`, and a secret pasted there is a
secret in a table you were not treating as one:

```sql
select vault.create_secret(
  '<the same value as AUDIO_RETENTION_SECRET>',
  'audio_retention_secret',
  'Shared secret for POST /api/maintenance/audio-retention'
);
```

Then schedule it. **pg_cron schedules in the database's timezone, which is UTC
on Supabase** — `30 20 * * *` is 02:00 IST, i.e. the middle of the night for an
Indian clinic, which is when you want a bulk storage delete running:

```sql
select cron.schedule(
  'audio-retention-purge',
  '30 20 * * *',
  $$
  select net.http_post(
    url := 'https://<your-app-host>/api/maintenance/audio-retention?limit=500',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-retention-secret',
        (select decrypted_secret
           from vault.decrypted_secrets
          where name = 'audio_retention_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);
```

To change the schedule, run `cron.schedule` again with the same job name — it
replaces the existing job. To remove it: `select cron.unschedule('audio-retention-purge');`

Pick `limit` to fit your host's function timeout. Each batch of 100 objects is
one storage API call, so 500 is a handful of calls and finishes in seconds on a
normal backlog; on a platform with a 10-second function limit, start at 200 and
watch `durationMs`.

### Scheduling, option B: an external scheduler

Any cron that can send a POST with a custom header works — a GitHub Actions
schedule, a container cron, an uptime service with a POST monitor. The command
is the `curl` above, with the secret from that system's secret store.

**Vercel Cron cannot run this.** It issues a `GET` and sends its own
`Authorization: Bearer $CRON_SECRET` header; it cannot POST and cannot set
`x-retention-secret`. A `GET` to this route returns `405` with a JSON body
saying so, which is what you will find in the logs if someone wires it up that
way anyway.

### Is it still running?

The purge failing is silent by nature: recordings simply accumulate. Check it
the way you would check a backup.

**The one query that matters** — the backlog. If this is non-zero and growing
day over day, the purge is not running or is not keeping up:

```sql
select count(*)
from transcripts
where audio_path is not null
  and audio_deleted_at is null
  and audio_expires_at < now();
```

**Did the recording actually stop existing?** Confirm the bookkeeping matches
reality by spot-checking that a row with `audio_deleted_at` set has no
`audio_path` (the purge clears both together, so a row with a path *and* a
deletion timestamp means something went wrong):

```sql
select count(*) from transcripts
where audio_deleted_at is not null and audio_path is not null;
```

That count should always be zero.

**pg_cron job history:**

```sql
-- cron.job_run_details keys on jobid only, so the name comes from cron.job.
select d.jobid, j.jobname, d.status, d.return_message, d.start_time, d.end_time
from cron.job_run_details d
join cron.job j on j.jobid = d.jobid
where j.jobname = 'audio-retention-purge'
order by d.start_time desc
limit 20;
```

**A trap worth knowing:** `net.http_post` only *queues* the HTTP request. The
cron job returns immediately and `cron.job_run_details` records `succeeded`
even when the endpoint answered `401`, or the host was unreachable, or the
deploy is down. A green job history does not mean the purge ran. The actual
answer is in pg_net's response table (it is pruned after a few hours, so look
soon after a run):

```sql
select id, status_code, error_msg, created
from net._http_response
order by created desc
limit 20;
```

`status_code` 200 with the summary in `content` is a real success.

`cron.job_run_details` grows forever unless something trims it. If you keep the
job long-term, prune it:

```sql
delete from cron.job_run_details where end_time < now() - interval '30 days';
```

### Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `401 Not authorised.` | The header value and `AUDIO_RETENTION_SECRET` differ. | They are two copies of one secret — rotating one means rotating both. Update the Vault secret (or the scheduler's) **and** the deployment variable, then redeploy so the new value is loaded. |
| `503 Audio retention is not configured on this deployment.` | `AUDIO_RETENTION_SECRET` is not set in the environment the route runs in. | Set it and redeploy. Setting it in `.env.local` does nothing for a hosted deployment. |
| `503 Audio retention is not migrated.` | `0004_audit_and_limits.sql` has not been applied to this database. | Apply the migration. |
| `502 Could not list expired recordings.` | The service-role key is wrong, rotated, or missing. | Check `SUPABASE_SERVICE_ROLE_KEY`. The server log line carries the Postgres error code. |
| `502 Recordings were deleted but could not be recorded as deleted.` | Objects were removed but the bookkeeping update failed. | Nothing is lost. The next run re-confirms the objects are absent and retries the mark. Investigate if it repeats. |
| `failedBatches` > 0 | The storage API errored on a whole batch. | Transient; the rows are retried next run. Persistent failures point at Storage itself — check the Supabase status page and the project's Storage logs, which hold the detail this route deliberately does not log. |
| `unconfirmed` > 0 every run, with `failedBatches` at 0 | The objects are still present after a delete the API reported as fine. Usually the wrong bucket or a key that is not really the service role. | Confirm the `dictations` bucket exists and that `SUPABASE_SERVICE_ROLE_KEY` is the service-role key, not the publishable one. |
| `remaining` never reaches 0 | The backlog is larger than `limit × frequency`. | Raise `limit` (max 1000) or run hourly until it drains. |
| `withoutExpiry` > 0 | See below. | |

Server logs for this route are prefixed `[audio-retention]` and contain counts
and error codes only — never a storage path, which names a clinic and a doctor.
Do not paste one into an issue.

### Known gaps

**Recordings with no expiry.** Transcripts written before migration 0004 added
the column have `audio_expires_at = NULL`. No cutoff comparison will ever
select them, so this job will never purge them — they are reported as
`withoutExpiry` rather than silently swept up, because putting a retention
deadline on recordings made before the policy existed is a decision for a human,
not for a cleanup job. When you have made that decision, a human applies the
back-fill:

```sql
-- Gives pre-0004 recordings 30 days from when they were created, not from now.
update transcripts
   set audio_expires_at = created_at + interval '30 days'
 where audio_path is not null
   and audio_deleted_at is null
   and audio_expires_at is null;
```

**The unused SQL helpers.** `expired_audio_paths(p_limit)` and
`mark_audio_deleted(p_ids)` from 0004/0011 both resolve the clinic from
`auth.uid()`. A service-role connection has no `sub` claim, so `auth.uid()` is
`NULL`, both predicates compare against `NULL`, and the pair returns zero rows
and marks zero rows — a purge built on them would look healthy in every log
line and delete nothing. The route therefore issues the equivalent cross-clinic
queries directly, with the same predicates. Neither function is called from
anywhere under `src/`; this route does not depend on their grants, so tightening
or dropping them is safe.

If you would rather keep this logic in SQL, the migration a human would need to
write adds clinic-agnostic variants — `expired_audio_paths_admin(p_limit int)`
and `mark_audio_deleted_admin(p_ids uuid[])`, both `security definer`, both
`revoke all ... from public, anon, authenticated` so only the service role can
reach them — and the route switches to two `rpc()` calls. That is a tidier
boundary; it is not a behaviour change.

## The nightly purge is scheduled in the database

`pg_cron` job `audio-retention-nightly` runs `public.run_audio_retention()` at
21:10 UTC — 02:40 IST, the quietest part of a clinic's day, and deliberately not
on the hour where every scheduled job in the world lands.

The schedule lives in Postgres rather than in the host's scheduler for two
reasons. This deployment is on a plan whose cron is limited to once a day, and
more importantly the retention promise belongs to the schema: if the app moves
host, the purge moves with the data rather than being left behind in a config
file nobody migrates.

`run_audio_retention()` reads the shared secret from `app_private_settings` —
the same table that holds `clinic_invite_hmac`, RLS-enabled with no policies, so
it is unreachable through PostgREST — and POSTs it to the route with `pg_net`.
`pg_net` is asynchronous, so the job never holds a worker open for the length of
a purge.

### Checking it

```sql
select * from audio_retention_health();
```

| outcome | means |
|---|---|
| `purged` | It ran. The body carries the counts. |
| `app has no secret configured` | `AUDIO_RETENTION_SECRET` is missing from the app's environment. Set it in the host and redeploy. |
| `secret mismatch` | The value in `app_private_settings` and the one in the app environment have drifted. They are two copies of one secret; rotating one means rotating both. |
| `unreachable` | The app did not answer. `detail` carries the transport error. |

### Rotating the secret

```sql
select set_retention_secret('<new value, 32+ chars>');
```

Then set the same value as `AUDIO_RETENTION_SECRET` in the host and redeploy.
Between those two steps the job reports `secret mismatch`, which is the intended
signal rather than a fault.

## Email delivery will rate-limit before a second doctor joins

Supabase's built-in email sender is rate limited, and this project has already hit
it: `/auth/v1/otp` answering `429: For security purposes, you can only request
this after 36 seconds`. The per-address cooldown is roughly a minute, and the
built-in sender also caps how many messages a project may send per hour.

That is survivable for one doctor signing in occasionally. It is not survivable
the moment a colleague joins by clinic name and needs a link of their own while
the first doctor is also signing in — and it is the sign-up path, so the failure
lands on somebody's first impression of the app.

**Fix it before inviting anyone.** Supabase Dashboard → Project Settings → Auth →
SMTP Settings, and point it at a real sender (Resend, SendGrid, Amazon SES, or
the clinic's own provider). Custom SMTP removes the built-in cap; the per-address
cooldown remains and is a reasonable anti-abuse measure.

It is a dashboard change, not a code change — there is nothing to deploy.

### What the app already does about it

`src/app/login/page.tsx` parses the cooldown out of the provider's reply and
turns it into a live countdown on the submit button, which stays disabled until
it expires. The provider's own sentence is not shown: it names a number that is
stale the instant it is painted, and the doctor is looking at the countdown.

### Do not point the test suite at a working account

`E2E_DOCTOR_EMAIL` must be a dedicated account. Every run mints a magic link, and
that consumes the same per-address cooldown a real doctor needs to sign in — one
suite run can lock somebody out of their own register. The suite uses
`e2e-bot@docregister.test`, which owns its own clinic (`E2E Test Clinic
(automated)`) seeded with obviously fictional patients, so tests never read a
real patient record either.

### Controlled production test access

`TEST_AUTH_BYPASS_EMAILS` and `TEST_AUTH_ACCESS_CODE` enable the test-access
field on `/login`. The shortcut only mints a normal RLS-governed session for an
existing allowlisted user; it never creates an account, clinic, patient, visit,
or demo record. The access code must be at least 24 characters and both values
are server-only secrets.

Remove either variable and redeploy to disable the endpoint. Keep seeded E2E
data confined to `e2e-bot@docregister.test`; never add a real or manually tested
doctor address to the seed workflow.
