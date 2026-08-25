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

export interface PatientHistoryPrescription {
  id: string;
  drug_name: string;
  strength: string | null;
  form: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
}

export interface PatientHistoryEncounter {
  id: string;
  occurred_at: string;
  age_years: number | null;
  diagnosis: string | null;
  treatment: string | null;
  fees_inr: number | null;
  visit_number: number | null;
  doctor_name: string | null;
  prescription: PatientHistoryPrescription[];
}

export interface PatientHistoryPayload {
  patient: {
    id: string;
    full_name: string;
    phone: string | null;
    age_years: number | null;
    sex: string | null;
    abha_id: string | null;
    notes: string | null;
    first_seen_at: string;
  };
  encounters: PatientHistoryEncounter[];
}
