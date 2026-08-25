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

export interface VisitPrescriptionItem {
  id?: string;
  drug_name: string;
  strength: string | null;
  form: string | null;
  frequency_spoken: string | null;
  frequency_code?: string | null;
  frequency_label: string | null;
  needs_review?: boolean;
  duration: string | null;
  route?: string | null;
  instructions: string | null;
  corrected?: boolean;
  position: number;
}

export interface VisitAmendment {
  id: string;
  revision: number;
  reason: string;
  before_values: Record<string, unknown>;
  after_values: Record<string, unknown>;
  author: { id: string; full_name: string | null };
  created_at: string;
}

export interface VisitDetailsPayload {
  encounter: {
    id: string;
    status: "draft" | "committed" | "discarded";
    occurred_at: string;
    patient_id: string | null;
    patient: {
      id: string;
      full_name: string;
      phone: string | null;
      age_years: number | null;
      sex: string | null;
    } | null;
    clinician: { id: string; full_name: string; speciality: string | null } | null;
    patient_name_spoken: string | null;
    age_years: number | null;
    diagnosis: string | null;
    treatment: string | null;
    fees_inr: number | null;
    visit_number: number | null;
    is_new_patient: boolean | null;
    prescription: VisitPrescriptionItem[];
    transcript: {
      id: string;
      raw_text: string;
      roman_text: string | null;
      live_text: string | null;
      provider: string;
      model: string | null;
      language_code: string | null;
      confidence: number | null;
      degraded: boolean;
      duration_ms: number | null;
      created_at: string;
    } | null;
    effective: {
      patient_name_spoken: string | null;
      age_years: number | null;
      diagnosis: string | null;
      treatment: string | null;
      fees_inr: number | null;
      prescription: VisitPrescriptionItem[];
    };
  };
  amendments: VisitAmendment[];
}
