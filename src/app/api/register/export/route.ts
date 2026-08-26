import { NextResponse } from "next/server";

import { shiftDays, startOfDayInIndia } from "@/lib/analytics";
import { ApiError, withDoctor } from "@/lib/api/http";
import { todayInIndia } from "@/lib/format";
import { searchRegister } from "@/lib/register";
import {
  buildRegisterCsv,
  registerExportFilename,
  type RegisterExportRow,
} from "@/lib/register-export";
import { callWorkflow } from "@/lib/supabase/workflows";

/**
 * GET /api/register/export?from=2026-07-01&to=2026-07-31&format=csv
 * -> text/csv attachment
 *
 * A record a doctor cannot get out of the app is not really theirs. The DPDP
 * Act says so; a doctor who cannot hand their accountant a spreadsheet says it
 * more directly, by keeping a paper register alongside this one.
 *
 * The rows come from `searchRegister` — the same `register_search` RPC the
 * register screen reads — so an export and the screen can never disagree, and
 * the clinic boundary stays where it already is, in that function's RLS. "All"
 * in that RPC means confirmed visits plus drafts still awaiting review; drafts
 * the doctor deliberately discarded are left out, which is the right default
 * for a file that leaves the building.
 */

export const runtime = "nodejs";

/** `searchRegister`'s own ceiling, so this is the fewest round trips possible. */
const PAGE_SIZE = 500;

/**
 * Roughly a year at fifty-five patients a day. Past this an export stops being
 * a download and starts being a report job, and the doctor is better served by
 * a sentence they can act on than by a request that dies behind a proxy.
 */
const MAX_ROWS = 20_000;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `recall` rather than `match`: `match` is sized for interactive typing at
 * 240/hour, and this is the most expensive read in the app — it walks a whole
 * range instead of one page. `recall` is already the bucket for "one request,
 * many patient records at once", and its 60/hour sits far above real use (a
 * doctor exports monthly) while still capping how fast a stolen session can
 * copy a register out. A dedicated bucket would need a migration and a change
 * to `RateLimitAction`.
 */
export const GET = withDoctor(async ({ doctor, supabase, request }) => {
  const url = new URL(request.url);

  const format = url.searchParams.get("format") ?? "csv";
  if (format !== "csv") throw new ApiError("Only `csv` export is supported.");

  const today = todayInIndia();
  const to = readDay(url.searchParams.get("to"), today, "to");
  const from = readDay(url.searchParams.get("from"), shiftDays(to, -29), "from");
  if (from > to) throw new ApiError("`from` must be on or before `to`.");

  // `register_search` takes a start instant and no end, and `searchRegister`
  // derives that start from a day count ending today. So the query is widened
  // to reach `from` and both edges are trimmed here. Over a year is refused
  // rather than quietly narrowed — an export that silently returns less than it
  // was asked for is the exact failure this endpoint exists to fix.
  const days = daysInclusive(from, today);
  if (days > 365) throw new ApiError("Exports cover up to 365 days. Choose a later start date.");

  const startsAt = Date.parse(startOfDayInIndia(from));
  const endsBefore = Date.parse(startOfDayInIndia(shiftDays(to, 1)));

  const rows: RegisterExportRow[] = [];
  // `register_search` orders by `occurred_at desc`, so a visit committed while
  // this is paging lands on page 0 and pushes every later page down by one row
  // — which an offset walk sees as the same encounter twice. Deduplicating by
  // id costs one Set and removes the whole class of duplicate.
  const seen = new Set<string>();
  let offset = 0;

  for (;;) {
    const page = await searchRegister(supabase, doctor.id, { limit: PAGE_SIZE, offset, days });

    if (offset === 0 && page.totalCount > MAX_ROWS) {
      throw new ApiError(
        `That range holds ${page.totalCount} visits, more than one file can carry. Export a shorter range.`,
        413,
      );
    }

    for (const entry of page.entries) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      const occurredAt = Date.parse(entry.occurred_at);
      if (occurredAt >= endsBefore || occurredAt < startsAt) continue;
      rows.push(entry);
    }

    if (page.entries.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    // The count check above already refused anything larger, so this is only
    // reached on the last full page of a maximal range. It is here so the loop
    // is finite even when the count is not available.
    if (offset >= MAX_ROWS) break;
  }

  // Written before the file is handed over, and a failure here fails the
  // request. An untracked copy of a whole register is the single event this
  // audit log exists to record, so "the export worked, the log did not" is not
  // an outcome worth having.
  const { error: auditError } = await callWorkflow<null>(supabase, "log_sensitive_access", {
    p_action: "export",
    p_entity: "register",
    p_entity_id: null,
    p_detail: { surface: "register_export", format, from, to, row_count: rows.length },
  });
  if (auditError) {
    console.error("[register-export] audit failed", auditError);
    throw new ApiError("Could not complete the audited export.", 500);
  }

  return new NextResponse(buildRegisterCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${registerExportFilename(from, to)}"`,
      // The body is every patient this doctor saw in the range. It has no
      // business in a shared cache or a browser's back-forward store.
      "Cache-Control": "no-store",
    },
  });
}, { rateLimit: "recall" });

/** An ISO day, or the fallback. Anything else is the caller's mistake, said plainly. */
function readDay(value: string | null, fallback: string, field: string): string {
  const day = value?.trim() ?? "";
  if (day === "") return fallback;
  if (!ISO_DAY.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) {
    throw new ApiError(`\`${field}\` must be a date like 2026-07-01.`);
  }
  return day;
}

/** Days from `from` up to and including `today`; at least 1 when `from` is ahead of today. */
function daysInclusive(from: string, today: string): number {
  const span = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.max(Math.round(span / 86_400_000) + 1, 1);
}
