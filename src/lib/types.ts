/** Shapes shared between the server components, the API routes, and the charts. */

export interface DailyPoint {
  /** ISO date in IST, e.g. "2026-08-24". Never a timestamp — these are buckets. */
  day: string;
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
  /** The last finished day, for comparisons `today` cannot honestly support. */
  yesterday: DailyPoint | null;
  deltas: { patients: number | null };
}

export interface RegisterEntry {
  id: string;
  occurred_at: string;
  patient_name: string;
  patient_id: string | null;
  age_years: number | null;
  diagnosis: string | null;
  treatment: string | null;
  is_new_patient: boolean | null;
  visit_number: number | null;
  status: "draft" | "committed" | "discarded";
  drugs: string[];
  /**
   * What was done, per tooth, as short display strings — "36 RCT", "26 MO".
   *
   * For a dental visit this is the line a dentist scans the register for, which
   * is why it sits beside `drugs` rather than inside it. Empty for a visit with
   * no per-tooth work, such as a consultation or a scaling.
   */
  procedures: string[];
}

/** The durable result returned after the human-reviewed commit transaction. */
export interface CommitOutcome {
  encounterId: string;
  patientId: string;
  visitNumber: number | null;
  isNewPatient: boolean | null;
  alreadyCommitted: boolean;
  /** Linked Accounts row created from the reviewed consultation amount. */
  accountEntryId: string | null;
  /** The visit saved, but its optional Accounts entry could not be created. */
  accountEntryError: boolean;
  /** The visit saved, but structured tooth findings could not be attached. */
  toothFindingError?: boolean;
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
  visit_number: number | null;
  doctor_name: string | null;
  prescription: PatientHistoryPrescription[];
}

export interface PatientHistoryPayload {
  /**
   * Every committed per-tooth procedure, oldest first, carrying the effect the
   * clinic's catalogue declares. Folded into a per-tooth state by
   * `deriveToothStatus` — the precedence rules live there, where they can be
   * tested against named clinical sequences rather than asserted in SQL.
   */
  toothProcedures: {
    encounter_id: string;
    occurred_at: string;
    tooth_fdi: number;
    surfaces: string[] | null;
    procedure_name: string;
    tooth_effect: string;
    status: string;
    sitting_number: number | null;
    total_sittings: number | null;
  }[];
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
      prescription: VisitPrescriptionItem[];
    };
  };
  amendments: VisitAmendment[];
}

export type AccountEntryKind = "income" | "expense";
export type AccountEntryStatus = "paid" | "pending";
export type AccountPaymentMethod = "cash" | "upi" | "card" | "bank_transfer" | "other";

export interface AccountEntry {
  id: string;
  kind: AccountEntryKind;
  status: AccountEntryStatus;
  amount_paise: number;
  currency: "INR";
  category: string;
  payment_method: AccountPaymentMethod | null;
  counterparty: string | null;
  note: string | null;
  patient_id: string | null;
  encounter_id: string | null;
  source: string;
  occurred_at: string;
  created_at: string;
  updated_at: string;
}

export interface AccountSummary {
  received_paise: number;
  pending_paise: number;
  expenses_paise: number;
  net_paise: number;
}

export interface AccountsPayload {
  entries: AccountEntry[];
  summary: AccountSummary;
  totalCount: number;
}
