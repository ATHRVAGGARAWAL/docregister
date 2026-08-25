import "server-only";

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
export function todayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

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
    revenue_inr: Number(point.revenue_inr) || 0,
    patient_count: Number(point.patient_count) || 0,
    new_patients: Number(point.new_patients) || 0,
    returning_patients: Number(point.returning_patients) || 0,
  }));

  const totals = series.reduce(
    (acc, point) => ({
      revenue_inr: acc.revenue_inr + point.revenue_inr,
      patient_count: acc.patient_count + point.patient_count,
      new_patients: acc.new_patients + point.new_patients,
      returning_patients: acc.returning_patients + point.returning_patients,
    }),
    { revenue_inr: 0, patient_count: 0, new_patients: 0, returning_patients: 0 },
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
    // Percentage deltas are computed here rather than in the component so the
    // divide-by-zero case (a first day, or a holiday) is handled once.
    deltas: {
      revenue: percentDelta(today?.revenue_inr, yesterday?.revenue_inr),
      patients: percentDelta(today?.patient_count, yesterday?.patient_count),
    },
  };
}

function percentDelta(current?: number, previous?: number): number | null {
  if (current === undefined || previous === undefined) return null;
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** An empty payload, so a failed query renders an empty dashboard, not a crash. */
export function emptyAnalytics(days = 30): AnalyticsPayload {
  const to = todayInIndia();
  const from = shiftDays(to, -(days - 1));
  const series: DailyPoint[] = Array.from({ length: days }, (_, index) => ({
    day: shiftDays(from, index),
    revenue_inr: 0,
    patient_count: 0,
    new_patients: 0,
    returning_patients: 0,
  }));

  return {
    from,
    to,
    scope: "doctor",
    series,
    totals: { revenue_inr: 0, patient_count: 0, new_patients: 0, returning_patients: 0 },
    today: series.at(-1) ?? null,
    deltas: { revenue: null, patients: null },
  };
}
