import { NextResponse } from "next/server";

import { ApiError, withDoctor } from "@/lib/api/http";
import { loadPatients } from "@/lib/patients";

/**
 * GET /api/patients?q=&limit=&offset=&days=
 * -> { patients: [{ id, full_name, phone, age_years, last_visit, visit_count }], totalCount }
 *
 * The directory behind the patients workspace. `q` is optional: with nothing in
 * it this is "every chart in the clinic, most recently seen first".
 *
 * No doctor filter. A chart belongs to the clinic rather than to whoever first
 * entered it — `patients.created_by` is kept for audit, not for access — so a
 * locum covering a colleague's list finds the same patients. `patients_rw` draws
 * the only boundary that matters, at the clinic.
 *
 * `rateLimit: "match"` rather than a bucket of its own. The action names are a
 * closed set: a new one needs both a widened `RateLimitAction` union and a row
 * in `rate_limit_policies`, and without the row `consume_rate_limit` falls back
 * to its conservative default and starts refusing this route after ten
 * requests an hour. Sharing the lookup bucket is honest anyway — this and
 * `/api/patients/match` enumerate the same table.
 */
export const GET = withDoctor(async ({ supabase, request }) => {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";

  // `Number(null)` is 0 and `Number("abc")` is NaN, and both fall to the
  // default through `||`. `Math.min` is what stops "1e999", which parses to
  // Infinity and would otherwise be handed to Postgres as a null limit.
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 100);
  const offset = Math.min(Math.max(Number(url.searchParams.get("offset")) || 0, 0), 100_000);

  if (query.length > 120) {
    throw new ApiError("That search is too long.");
  }

  // Clamped like every other range in the app. 0 or absent means the whole
  // directory, which is what the filter's "All" option sends.
  const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 0, 0), 3650);

  const result = await loadPatients(supabase, {
    search: query,
    limit,
    offset,
    days: days || undefined,
  });

  return NextResponse.json(result);
}, { rateLimit: "match" });
