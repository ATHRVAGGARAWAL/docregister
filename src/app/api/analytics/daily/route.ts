import { NextResponse } from "next/server";

import { withDoctor } from "@/lib/api/http";
import { loadDailyStats, shiftDays, todayInIndia } from "@/lib/analytics";

/**
 * GET /api/analytics/daily?from=YYYY-MM-DD&to=YYYY-MM-DD&days=30&scope=clinic
 * -> { series: [{ day, revenue_inr, patient_count, new_patients, returning_patients }],
 *      totals, today, deltas }
 *
 * Aggregation happens in Postgres (`clinic_daily_stats`), which matters for two
 * reasons. Days with no patients come back as explicit zero rows via
 * generate_series — a chart that silently skips Sunday makes a week look busier
 * than it was. And bucketing uses `at time zone 'Asia/Kolkata'`, so "today"
 * means the doctor's today; storing timestamptz and grouping in UTC would push
 * every evening consultation after 5:30 pm into tomorrow.
 */

export const GET = withDoctor(async ({ doctor, supabase, request }) => {
  const url = new URL(request.url);

  const to = url.searchParams.get("to") ?? todayInIndia();
  const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 30, 1), 365);
  const from = url.searchParams.get("from") ?? shiftDays(to, -(days - 1));
  const scope = url.searchParams.get("scope"); // "clinic" | "me" (default)
  const doctorId =
    scope === "clinic" ? null : (url.searchParams.get("doctorId") ?? doctor.id);

  try {
    return NextResponse.json(await loadDailyStats(supabase, { from, to, doctorId }));
  } catch (error) {
    console.error("[analytics/daily]", error);
    return NextResponse.json({ error: "Could not load analytics." }, { status: 500 });
  }
});
