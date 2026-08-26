import "server-only";
import { todayInIndia } from "@/lib/format";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AnalyticsPayload, DailyPoint } from "@/lib/types";

/**
 * Daily aggregation, shared by the dashboard's server render and the
 * `/api/analytics/daily` route the range filter calls.
 *
 * It lives here rather than in the route because the first paint must not go
 * out over HTTP to our own API — a server component calling `fetch("/api/…")`
 * pays a second round trip and has to forward cookies by hand. Both callers
 * running the same function is also what guarantees the numbers do not shift
 * when the doctor taps "30 days" and re-fetches what they were already looking
 * at.
 */

/** Today's date in IST, regardless of where the server runs. */
// Defined in `format.ts` so the client charts can use it too — this module is
// `server-only`, and a chart legitimately needs to know whether its last point
// is today. Re-exported because every existing caller imports it from here.
export { todayInIndia };

export function shiftDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Midnight IST of the given day, as an instant. Bounds "today's register". */
export function startOfDayInIndia(isoDate: string): string {
  return `${isoDate}T00:00:00+05:30`;
}

export async function loadDailyStats(
  // The typed client is generated per-project; this helper only needs `.rpc`.
  supabase: SupabaseClient,
  options: { from?: string; to?: string; doctorId: string | null },
): Promise<AnalyticsPayload> {
  const to = options.to ?? todayInIndia();
  const from = options.from ?? shiftDays(to, -29);

  const { data, error } = await supabase.rpc("clinic_daily_stats", {
    p_from: from,
    p_to: to,
    p_doctor_id: options.doctorId,
  });

  if (error) throw error;

  // Postgres `numeric` and `bigint` arrive as strings through PostgREST when
  // they could lose precision. Coercing once here means no chart component ever
  // has to wonder whether it is adding numbers or concatenating strings.
  const series: DailyPoint[] = ((data ?? []) as DailyPoint[]).map((point) => ({
    day: String(point.day),
    patient_count: Number(point.patient_count) || 0,
    new_patients: Number(point.new_patients) || 0,
    returning_patients: Number(point.returning_patients) || 0,
  }));

  const totals = series.reduce(
    (acc, point) => ({
      patient_count: acc.patient_count + point.patient_count,
      new_patients: acc.new_patients + point.new_patients,
      returning_patients: acc.returning_patients + point.returning_patients,
    }),
    { patient_count: 0, new_patients: 0, returning_patients: 0 },
  );

  const today = series.at(-1) ?? null;
  const yesterday = series.at(-2) ?? null;

  return {
    from,
    to,
    scope: options.doctorId ? "doctor" : "clinic",
    series,
    totals,
    today,
    yesterday,
    // Deliberately not a percentage.
    //
    // `today` is always the in-progress day — `series.at(-1)` is the current IST
    // bucket — and `yesterday` is always a finished one. A percentage between
    // the two is not a change, it is a clock reading: at 9am every doctor with
    // any patients yesterday saw "-100%" in alarming red, and the number only
    // stops being a lie some time in the evening.
    //
    // The raw pair beside it is true at every hour and lets the doctor make the
    // comparison themselves, which is the one they can actually calibrate. Kept
    // in the payload rather than dropped so the shape stays stable for callers.
    deltas: { patients: null },
  };
}

/** An empty payload, so a failed query renders an empty dashboard, not a crash. */
export function emptyAnalytics(days = 30): AnalyticsPayload {
  const to = todayInIndia();
  const from = shiftDays(to, -(days - 1));
  const series: DailyPoint[] = Array.from({ length: days }, (_, index) => ({
    day: shiftDays(from, index),
    patient_count: 0,
    new_patients: 0,
    returning_patients: 0,
  }));

  return {
    from,
    to,
    scope: "doctor",
    series,
    totals: { patient_count: 0, new_patients: 0, returning_patients: 0 },
    today: series.at(-1) ?? null,
    yesterday: series.at(-2) ?? null,
    deltas: { patients: null },
  };
}
