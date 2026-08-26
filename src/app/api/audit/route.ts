import { NextResponse } from "next/server";

import { ApiError, withDoctor } from "@/lib/api/http";
import {
  type AuditAction,
  type AuditEntry,
  type AuditPage,
  auditEntitiesFor,
  describeAuditDetail,
  encodeAuditCursor,
  isAuditAction,
  parseAuditCursor,
} from "@/lib/audit";
import type { getSupabaseServerClient } from "@/lib/supabase/server";
import { callWorkflow } from "@/lib/supabase/workflows";

export const runtime = "nodejs";

/** Enough to fill a phone screen twice over without making the first paint wait. */
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/**
 * The audit trail, read back.
 *
 * Tenancy is the database's job here, not this handler's. Read back from the
 * live database on 2026-08-27: `pg_class.relrowsecurity` is true for
 * `audit_log`, and `pg_policies` returns exactly one policy on it —
 * `audit_log_read`, `FOR SELECT`, to `public`, `USING (clinic_id =
 * auth_clinic_id())`, no `WITH CHECK`. There is no INSERT, UPDATE or DELETE
 * policy, and with row security on, a command without a policy is denied.
 *
 * Two consequences the code below relies on. The select cannot return another
 * clinic's rows even if this file forgot to filter — and it does not filter by
 * `clinic_id`, deliberately, so that the policy stays the single place tenancy
 * is decided. And the trail cannot be edited by anything holding only an
 * `authenticated` session: rows arrive through the audit trigger and
 * `log_sensitive_access`, both SECURITY DEFINER.
 *
 * What the policy does not express is *who inside one clinic* may read it, and
 * that is the check below. Owner-only because the trail names colleagues: "Dr
 * Rao changed a patient chart at 9:42" is a fact about staff conduct, and the
 * owner is the person accountable for it. It stays in the route rather than in
 * the policy because `audit_log_read` is also what the app's own logged reads
 * rely on; narrowing it to owners would break them.
 */
export const GET = withDoctor(async ({ doctor, supabase, request }) => {
  if (doctor.role !== "owner") {
    throw new ApiError("Only the clinic owner can view the audit trail.", 403);
  }

  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const cursorParam = url.searchParams.get("cursor");
  const cursor = parseAuditCursor(cursorParam);

  // A cursor this route did not mint, or one mangled in transit. Answering with
  // page one instead would loop "load more" back to the top for ever.
  if (cursorParam && !cursor) {
    throw new ApiError("That page of the audit trail is no longer valid. Reload the page.", 400);
  }

  const entityParam = url.searchParams.get("entity");
  const entities = entityParam && entityParam !== "all" ? auditEntitiesFor(entityParam) : null;
  if (entityParam && entityParam !== "all" && !entities) {
    throw new ApiError("That is not a record type this clinic keeps.", 400);
  }

  const actionParam = url.searchParams.get("action");
  let action: AuditAction | null = null;
  if (actionParam && actionParam !== "all") {
    if (!isAuditAction(actionParam)) {
      throw new ApiError("That is not an action the audit trail records.", 400);
    }
    action = actionParam;
  }

  // Counted only on the first page: it is a count over the whole filtered set,
  // so paging cannot change it, and re-running it per page would charge an
  // owner scrolling through a year of history for the same number ten times.
  let query = supabase
    .from("audit_log")
    .select("id, at, action, entity, entity_id, actor_id, changed, detail", {
      count: cursor ? undefined : "exact",
    })
    .order("at", { ascending: false })
    .order("id", { ascending: false })
    // One extra row is the cheapest honest answer to "is there more?" — a
    // second COUNT would be a different query against a moving table.
    .limit(limit + 1);

  if (entities) query = query.in("entity", entities);
  if (action) query = query.eq("action", action);

  if (cursor) {
    // Strictly a page *after* the cursor row, ties on `at` broken by id. The
    // interpolated values passed the pattern in `parseAuditCursor`, which is
    // what makes this safe: a PostgREST filter is a string grammar, not a bound
    // parameter list.
    query = query.or(`at.lt.${cursor.at},and(at.eq.${cursor.at},id.lt.${cursor.id})`);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("[audit]", error.code, error.message);
    throw new ApiError("Could not load the audit trail.", 500);
  }

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const actorNames = await resolveActorNames(
    supabase,
    doctor.clinic_id,
    page.map((row) => row.actor_id),
  );

  const entries: AuditEntry[] = page.map((row) => ({
    id: row.id,
    at: row.at,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    actorId: row.actor_id,
    actorName: row.actor_id ? (actorNames.get(row.actor_id) ?? null) : null,
    changed: row.changed ?? [],
    // `detail` is free-form jsonb written by several callers. It is narrowed to
    // a sentence fragment here, on the server, so that whatever a future caller
    // decides to stash in it cannot reach a doctor's screen unreviewed.
    context: describeAuditDetail(row.detail),
  }));

  const last = page.at(-1);

  // Only a first page is a new act of reading. An owner working through one
  // list would otherwise write a row per page turn, and within a few minutes
  // the trail would be mostly a record of itself.
  if (!cursor) {
    const { error: auditError } = await callWorkflow<null>(supabase, "log_sensitive_access", {
      p_action: "read",
      p_entity: "audit_log",
      p_detail: { surface: "audit_log" },
    });

    // Fail closed, as every other logged read in this app does. A trail that
    // quietly stops recording who read it is worse than one that is briefly
    // unavailable — and the owner can retry.
    if (auditError) {
      console.error("[audit] audit failed", auditError);
      throw new ApiError("Could not open the audit trail.", 500);
    }
  }

  const body: AuditPage = {
    entries,
    nextCursor: hasMore && last ? encodeAuditCursor({ id: last.id, at: last.at }) : null,
    total: cursor ? null : (count ?? null),
  };

  return NextResponse.json(body, {
    // Never a shared cache: this is one clinic's staff activity.
    headers: { "Cache-Control": "no-store" },
  });
}, { rateLimit: "match" });

/**
 * `Number(null)` and `Number("")` are both 0, so an absent `limit` has to be
 * caught before the numeric checks. Clamped instead, a request that simply did
 * not mention a limit would come back holding a single row.
 */
function parseLimit(raw: string | null): number {
  if (raw === null || raw.trim() === "") return DEFAULT_LIMIT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_LIMIT;
  return Math.min(Math.trunc(parsed), MAX_LIMIT);
}

/**
 * Actor names, fetched separately rather than embedded.
 *
 * A PostgREST embed on `audit_log_actor_id_fkey` would fold the join into the
 * page query, but it also makes the row shape depend on a foreign key name; the
 * rest of this app resolves author names with a second `doctors` select for the
 * same reason. `clinic_id` is repeated on top of RLS as a belt-and-braces
 * guard, matching `encounter-details.ts`.
 *
 * A name that does not come back stays null and renders as unattributed —
 * missing here means the account was deleted, which is exactly what a null
 * `actor_id` means too.
 */
async function resolveActorNames(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  clinicId: string,
  actorIds: readonly (string | null)[],
): Promise<Map<string, string>> {
  const ids = [...new Set(actorIds.filter((id): id is string => id !== null))];
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from("doctors")
    .select("id, full_name")
    .in("id", ids)
    .eq("clinic_id", clinicId);

  if (error) {
    // Names are the readable part of a row, not the load-bearing part: the
    // action, the record and the time are already in hand. Losing the join is
    // worth degrading to "unattributed", not worth failing the page.
    console.error("[audit] actors", error.code, error.message);
    return new Map();
  }

  return new Map((data ?? []).map((actor) => [actor.id, actor.full_name]));
}
