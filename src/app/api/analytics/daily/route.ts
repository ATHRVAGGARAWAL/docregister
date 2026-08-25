import { NextResponse } from "next/server";

import { ApiError, withDoctor } from "@/lib/api/http";
import { loadDailyStats, shiftDays, todayInIndia } from "@/lib/analytics";

/**
 * GET /api/analytics/daily?from=YYYY-MM-DD&to=YYYY-MM-DD&days=30
 * -> { series: [{ day, revenue_inr, patient_count, new_patients, returning_patients }],
 *      totals, today, deltas }
 *
 * Aggregation happens in Postgres (`clinic_daily_stats`), which matters for two
 * reasons. Days with no patients come back as explicit zero rows via
 * generate_series — a chart that silently skips Sunday makes a week look busier
 * than it was. And bucketing uses `at time zone 'Asia/Kolkata'`, so "today"
 * means the doctor's today; storing timestamptz and grouping in UTC would push
 * every evening consultation after 5:30 pm into tomorrow.
 *
 * Deliberately takes no `doctorId` or `scope`. It used to accept both, which
 * let any member of a clinic read a colleague's revenue by passing their id —
 * ids that `doctors_read` hands out to every member of the clinic. RLS did not
 * catch it because `clinic_daily_stats` is correctly scoped to the *clinic*;
 * the leak was within that boundary. There is no role to gate on either:
 * 0005_admin.sql states plainly that `clinic_role` is decorative and nothing
 * reads it. Until a role actually means something, the only scope this route
 * can honestly serve is the caller's own.
 */

export const GET = withDoctor(async ({ doctor, supabase, request }) => {
  const url = new URL(request.url);

  const to = url.searchParams.get("to") ?? todayInIndia();
  const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 30, 1), 365);
  const from = url.searchParams.get("from") ?? shiftDays(to, -(days - 1));
  // Reject a malformed date before it reaches Postgres, where it would surface
  // as a generic 500 rather than as the bad input it is.
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) {
    throw new ApiError("`from` and `to` must be YYYY-MM-DD dates.");
  }
  if (from > to) throw new ApiError("`from` must not be after `to`.");

  return NextResponse.json(
    await loadDailyStats(supabase, { from, to, doctorId: doctor.id }),
  );
});

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
