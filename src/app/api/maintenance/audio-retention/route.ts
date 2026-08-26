import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * POST /api/maintenance/audio-retention?limit=200
 *   -> { ok, considered, purged, marked, unconfirmed, remaining, … }
 *
 * The 30-day audio purge. Migration 0004 declared the retention window and
 * added `transcripts.audio_expires_at`; until this route existed nothing ever
 * acted on it, so every consultation recording stayed in the `dictations`
 * bucket forever while the schema claimed otherwise. For an app that positions
 * itself on keeping PHI in India under a stated retention policy, the gap was
 * not a missing feature but a promise the code did not keep.
 *
 * This is a machine endpoint, not a doctor action, so it is deliberately not
 * wrapped in `withDoctor`: there is no session behind it, the work spans every
 * clinic, and a doctor must never be able to trigger a cross-clinic delete.
 * It authenticates on a shared secret instead (see `secretMatches`) and runs
 * as the service role (see `createRetentionClient`).
 *
 * Only the raw audio is ever touched. The transcript text is the medical
 * record and is never expired by this mechanism — see the column comment in
 * 0004_audit_and_limits.sql.
 *
 * ## Why this does not call `expired_audio_paths` / `mark_audio_deleted`
 *
 * Both functions resolve the clinic from `auth.uid()` — `expired_audio_paths`
 * filters on `clinic_id = auth_clinic_id()` and `mark_audio_deleted` joins to
 * `doctors where id = auth.uid()`. A service-role connection has no `sub`
 * claim, so `auth.uid()` is NULL, both predicates compare against NULL, and
 * the pair returns zero rows and marks zero rows. Verified against the live
 * database: `select count(*) from expired_audio_paths(500)` is 0 with a null
 * uid even as superuser. Calling them from here would produce a job that looks
 * healthy in every log line and deletes nothing — the exact failure this route
 * exists to end. They are correct as *doctor-facing* RPCs (a doctor purging
 * their own clinic's audio) and are left alone; the queries below are their
 * cross-clinic equivalents, with the same predicates written out. If an
 * operator would rather keep this logic in SQL, `docs/operations.md` records
 * the clinic-argument variants a migration would need to add.
 */

/** `node:crypto` — `timingSafeEqual` does not exist in the Edge runtime. */
export const runtime = "nodejs";

const SECRET_HEADER = "x-retention-secret";
const BUCKET = "dictations";

/**
 * How many transcripts one call may consider. Bounded so a scheduler cannot
 * ask for an unbounded batch and hold a serverless invocation open until it is
 * killed halfway through — which is survivable here (see the ordering note in
 * `POST`) but wastes a run. A backlog is drained by calling again; `remaining`
 * in the response says whether that is needed.
 */
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

/**
 * Storage deletes go out in batches of this size. The failure unit is the
 * batch, so smaller batches mean a transient error strands fewer rows until
 * the next run.
 */
const STORAGE_BATCH = 100;

/**
 * How many ids may go into one `.in("id", …)` filter.
 *
 * PostgREST puts that list in the query string, so the ceiling is the gateway's
 * URL limit, not a database one. A uuid plus its separator is 37 bytes; 100 of
 * them is ~3.7 KB, which sits comfortably inside the usual 8 KB while keeping
 * the number of round trips low.
 */
const MARK_BATCH = 100;

/**
 * The one new secret this route needs, read the way `src/lib/env.ts` reads its
 * own: a lazy getter, so importing this module cannot fail a deployment that
 * has not scheduled the purge yet. It is declared here rather than added to
 * `env.ts` because nothing else in the app authenticates a caller this way,
 * and a value in `env.ts` reads as available to any route that imports it.
 */
const retentionEnv = {
  get purgeSecret(): string {
    const value = process.env.AUDIO_RETENTION_SECRET;
    if (!value) {
      throw new Error(
        "Missing required environment variable AUDIO_RETENTION_SECRET. " +
          "See docs/operations.md — the audio purge cannot authenticate its caller until it is set.",
      );
    }
    return value;
  },
} as const;

type RetentionClient = SupabaseClient<Database>;

/**
 * A Supabase client that **bypasses RLS entirely**.
 *
 * Every other server path in this app goes through `getSupabaseServerClient`,
 * which carries the doctor's session so the policies in 0001_init.sql enforce
 * clinic isolation in the database. This one cannot: the purge has no session
 * and its whole job is to sweep every clinic. That makes it the one client in
 * the codebase where a mistaken `where` clause is not caught by anything, so
 * it is built here, in the only file that may use it, and never exported.
 *
 * The guard rails that replace RLS are, in order:
 *
 *  1. The caller is authenticated before this function is ever called.
 *  2. Every query below re-states the full expiry predicate. Nothing selects
 *     or updates a row on the strength of an id alone.
 *  3. Nothing from the request reaches a query. The only caller-supplied value
 *     is `limit`, which is parsed to an integer and clamped.
 *  4. Only two columns are ever written, both of them retention bookkeeping.
 *
 * `persistSession` and `autoRefreshToken` are off because there is no session
 * to persist and a background refresh timer would outlive the request.
 */
function createRetentionClient(): RetentionClient {
  return createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Compare the presented secret with the configured one in constant time.
 *
 * `presented === expected` returns the moment two bytes differ, so how long it
 * takes is a function of how many leading bytes the caller got right. This
 * endpoint can be called as often as an attacker likes, over and over, and it
 * does nothing else before answering — which is exactly the quiet, repeatable
 * signal a timing attack needs to extend a guess one byte at a time. The
 * secret it protects deletes storage objects across every clinic, so the three
 * lines are worth it whether or not the attack is practical through a CDN.
 *
 * Hashing first is what makes `timingSafeEqual` usable: it throws on a length
 * mismatch, and a caller must not be able to learn the secret's length by
 * sending a one-character header and reading the error. Two SHA-256 digests
 * are always 32 bytes.
 */
function secretMatches(presented: string, expected: string): boolean {
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Nonsense is refused; more-than-we-allow is clamped.
 *
 * The asymmetry is deliberate. `limit=abc` or `limit=0` is a scheduler that has
 * been configured wrong, and failing loudly is how that gets noticed. A number
 * above `MAX_LIMIT` is a scheduler asking to drain as much as it can, which is
 * a reasonable thing to ask and a bad thing to fail a nightly job over.
 */
function parseLimit(raw: string | null): number | null {
  if (raw === null || raw === "") return DEFAULT_LIMIT;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return Math.min(parsed, MAX_LIMIT);
}

function chunked<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}

/**
 * Did this object survive the delete?
 *
 * Called only for paths the storage API did not list as removed. That happens
 * when the object was already gone — a previous run deleted it and died before
 * marking the row, or someone removed it by hand — and "already gone" is a
 * success for retention, not something to retry forever. A HEAD per straggler
 * is cheap because stragglers are rare and the batch is bounded.
 *
 * Any answer other than a definite "absent" returns false: an unreachable
 * storage API must leave the row for the next run, never mark it purged.
 */
async function confirmAbsent(supabase: RetentionClient, path: string): Promise<boolean> {
  try {
    const { data } = await supabase.storage.from(BUCKET).exists(path);
    return data === false;
  } catch {
    return false;
  }
}

/**
 * PostgREST/Postgres codes for "that column or function is not there", which
 * for this route means the deployment is running ahead of migration 0004.
 * Worth naming so the operator gets that sentence instead of a generic 502.
 */
const MISSING_SCHEMA_CODES = new Set(["42703", "42P01", "PGRST202", "PGRST204"]);

export async function POST(request: Request) {
  let expected: string;
  try {
    expected = retentionEnv.purgeSecret;
  } catch {
    // Fail closed. A missing secret must never read as "no authentication
    // required" on an endpoint that deletes across every clinic.
    console.error(
      "[audio-retention] AUDIO_RETENTION_SECRET is not set; refusing to run. See docs/operations.md.",
    );
    return json({ error: "Audio retention is not configured on this deployment." }, 503);
  }

  const presented = request.headers.get(SECRET_HEADER);
  if (!presented || !secretMatches(presented, expected)) {
    return json({ error: "Not authorised." }, 401);
  }

  const limit = parseLimit(new URL(request.url).searchParams.get("limit"));
  if (limit === null) {
    return json({ error: "`limit` must be a whole number of 1 or more." }, 400);
  }

  const startedAt = new Date();
  // One fixed cutoff for every query in this run, rather than a fresh `now()`
  // per statement, so the batch and the leftover count reported beside it are
  // describing the same set of rows.
  const cutoff = startedAt.toISOString();
  const supabase = createRetentionClient();

  const { data: rows, error: selectError } = await supabase
    .from("transcripts")
    .select("id, audio_path")
    .lt("audio_expires_at", cutoff)
    .is("audio_deleted_at", null)
    .not("audio_path", "is", null)
    // Oldest first: if the backlog is larger than one batch, the recordings
    // that have been over the retention line longest leave first.
    .order("audio_expires_at", { ascending: true })
    .limit(limit);

  if (selectError) {
    if (MISSING_SCHEMA_CODES.has(selectError.code)) {
      console.error("[audio-retention] retention columns are missing", selectError.code);
      return json(
        {
          error:
            "Audio retention is not migrated. Apply supabase/migrations/0004_audit_and_limits.sql.",
        },
        503,
      );
    }
    console.error("[audio-retention] could not list expired recordings", selectError.code);
    return json({ error: "Could not list expired recordings." }, 502);
  }

  const candidates = (rows ?? []).flatMap((row) =>
    row.audio_path ? [{ id: row.id, path: row.audio_path }] : [],
  );

  // Storage first, database second, and the database only for objects
  // confirmed gone. The reverse order is tempting because it is one round trip
  // shorter, but a mark that lands before a delete that then fails leaves
  // `audio_deleted_at` asserting a recording was purged while it is still
  // sitting in the bucket — and because the row no longer matches the query
  // above, nothing would ever revisit it. That is worse than not running at
  // all: the audit trail would be confidently wrong, which is the one thing
  // retention bookkeeping exists to prevent. Failing this way round costs a
  // retry on the next run and nothing else.
  const purgedIds: string[] = [];
  let unconfirmed = 0;
  let failedBatches = 0;

  for (const batch of chunked(candidates, STORAGE_BATCH)) {
    const { data: removed, error: removeError } = await supabase.storage
      .from(BUCKET)
      .remove(batch.map((candidate) => candidate.path));

    if (removeError) {
      // Skip the whole batch: without a per-object result there is no honest
      // way to say which of these files is gone. Logged by count and error
      // name only — a storage error can quote the key it failed on, and an
      // object path names a clinic and a doctor.
      failedBatches += 1;
      unconfirmed += batch.length;
      console.error("[audio-retention] storage delete failed", {
        objects: batch.length,
        error: removeError.name,
      });
      continue;
    }

    const removedPaths = new Set((removed ?? []).map((object) => object.name));

    for (const candidate of batch) {
      if (removedPaths.has(candidate.path) || (await confirmAbsent(supabase, candidate.path))) {
        purgedIds.push(candidate.id);
      } else {
        unconfirmed += 1;
      }
    }
  }

  let marked = 0;
  if (purgedIds.length > 0) {
    // Chunked for the same reason the deletes are: `.in("id", …)` becomes a
    // query string, and PostgREST is fronted by a gateway that rejects a long
    // one. At `MAX_LIMIT` this list is a thousand uuids — roughly 37 KB of URL,
    // well past any reasonable header limit — so a full backlog run would fail
    // here, after the objects were already deleted. That is the worst place in
    // this route to fail, because it is the window where storage and the audit
    // trail disagree.
    const timestamp = new Date().toISOString();
    for (const batch of chunked(purgedIds, MARK_BATCH)) {
      const { data: updated, error: updateError } = await supabase
        .from("transcripts")
        .update({ audio_deleted_at: timestamp, audio_path: null })
        // `purgedIds` is built from this run's own select, never from the
        // request. `audio_deleted_at is null` is re-asserted so that two
        // overlapping runs cannot restamp a row the first one already closed —
        // the second simply updates nothing, which is what makes the whole
        // route safe to call again at any time.
        .in("id", batch)
        .is("audio_deleted_at", null)
        .select("id");

      if (updateError) {
        // The objects are gone but the rows still claim otherwise. Nothing is
        // lost — the next run finds the same rows, `remove` reports nothing to
        // delete, `confirmAbsent` says absent, and the mark is retried. Earlier
        // batches in this loop stay marked, which is correct: they describe
        // objects that really are gone.
        console.error("[audio-retention] could not record the deletions", updateError.code);
        return json(
          { error: "Recordings were deleted but could not be recorded as deleted." },
          502,
        );
      }

      marked += updated?.length ?? 0;
    }
  }

  const [remaining, withoutExpiry] = await Promise.all([
    // What is still over the line after this batch. This is the number that
    // says whether the schedule is keeping up: if it never reaches zero, the
    // job is running too rarely or with too small a limit.
    countPending(supabase, { kind: "expired", cutoff }),
    // Rows written before 0004 added the column have no expiry, so no cutoff
    // will ever select them and this route will never purge them. Surfaced
    // rather than guessed at: back-filling a retention deadline onto existing
    // recordings is a policy decision for a human, not for a cleanup job.
    countPending(supabase, { kind: "unscheduled" }),
  ]);

  return json({
    ok: true,
    limit,
    considered: candidates.length,
    purged: purgedIds.length,
    marked,
    unconfirmed,
    failedBatches,
    remaining,
    withoutExpiry,
    startedAt: cutoff,
    durationMs: Date.now() - startedAt.getTime(),
  });
}

/**
 * A JSON 405 rather than Next's empty one. The purge mutates, so it is POST
 * only; a scheduler misconfigured to GET should be told that in a body its
 * logs will show. Unauthenticated on purpose — the existence of a route name
 * is not privileged information, and answering "sign in" here would send an
 * operator looking in the wrong place.
 */
export function GET() {
  return json({ error: "Use POST to run the audio retention purge." }, 405);
}

/** Which set of still-present recordings to count. */
type PendingScope = { kind: "expired"; cutoff: string } | { kind: "unscheduled" };

async function countPending(
  supabase: RetentionClient,
  scope: PendingScope,
): Promise<number> {
  const pending = supabase
    .from("transcripts")
    .select("id", { count: "exact", head: true })
    .is("audio_deleted_at", null)
    .not("audio_path", "is", null);

  const { count, error } =
    scope.kind === "expired"
      ? await pending.lt("audio_expires_at", scope.cutoff)
      : await pending.is("audio_expires_at", null);

  if (error) {
    console.error("[audio-retention] could not count pending recordings", error.code);
    // Reported as unknown rather than guessed at. A 0 here would read as
    // "nothing left to do" on the one metric that says the schedule is behind.
    return -1;
  }
  return count ?? 0;
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
