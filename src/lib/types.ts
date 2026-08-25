/** Shapes shared between the server components, the API routes, and the charts. */

export interface DailyPoint {
  /** ISO date in IST, e.g. "2026-08-24". Never a timestamp — these are buckets. */
  day: string;
  revenue_inr: number;
  patient_count: number;
  new_patients: number;
  returning_patients: number;
}

export interface AnalyticsPayload {
  from: string;
  to: string;
  scope: "doctor" | "clinic";
  series: DailyPoint[];
  totals: Omit<DailyPoint, "day">;
  today: DailyPoint | null;
  deltas: { revenue: number | null; patients: number | null };
}

export interface RegisterEntry {
  id: string;
  occurred_at: string;
  patient_name: string;
  patient_id: string | null;
  age_years: number | null;
  diagnosis: string | null;
  treatment: string | null;
  fees_inr: number | null;
  is_new_patient: boolean | null;
  visit_number: number | null;
  status: "draft" | "committed" | "discarded";
  drugs: string[];
}
