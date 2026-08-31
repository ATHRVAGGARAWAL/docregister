import type { ToothFindingKind, ToothFindingState } from "@/lib/dental/tooth-status";

export type PracticeRole =
  | "owner"
  | "dentist"
  | "hygienist"
  | "assistant"
  | "receptionist"
  | "accountant"
  | "stock_manager";

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "checked_in"
  | "in_chair"
  | "completed"
  | "cancelled"
  | "no_show";

export interface Operatory {
  id: string;
  name: string;
  code: string | null;
  colour: string;
  sort_order: number;
  is_active: boolean;
}

export interface Appointment {
  id: string;
  patient_id: string | null;
  clinician_id: string | null;
  operatory_id: string | null;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  appointment_type: string;
  reason: string | null;
  notes: string | null;
  reminder_at: string | null;
  patient: {
    id: string;
    full_name: string;
    phone: string | null;
  } | null;
  clinician: {
    id: string;
    full_name: string;
  } | null;
  operatory: Operatory | null;
}

export interface PatientAlert {
  id: string;
  kind: "allergy" | "medical" | "medication" | "pregnancy" | "risk" | "other";
  label: string;
  severity: "info" | "important" | "critical";
  note: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ToothFinding {
  id: string;
  tooth_fdi: number;
  surfaces: string[];
  finding: ToothFindingKind;
  state: ToothFindingState;
  severity: "mild" | "moderate" | "severe" | null;
  note: string | null;
  observed_at: string;
  resolved_at: string | null;
}

export interface TreatmentPlanItem {
  id: string;
  plan_id: string;
  procedure_name: string;
  scope: "tooth" | "quadrant" | "arch" | "full_mouth" | "other";
  tooth_fdi: number | null;
  surfaces: string[];
  status: "planned" | "scheduled" | "in_progress" | "completed" | "deferred" | "cancelled";
  phase: number;
  planned_sittings: number | null;
  quantity: number;
  unit_price_paise: number;
  discount_paise: number;
  note: string | null;
  sort_order: number;
}

export interface TreatmentPlan {
  id: string;
  patient_id: string;
  clinician_id: string | null;
  title: string;
  diagnosis: string | null;
  status: "draft" | "proposed" | "accepted" | "active" | "completed" | "cancelled";
  priority: "urgent" | "high" | "routine" | "elective";
  accepted_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  patient: { id: string; full_name: string } | null;
  items: TreatmentPlanItem[];
}

export interface LabCase {
  id: string;
  patient_id: string;
  lab_name: string;
  work_type: string;
  tooth_notation: string | null;
  shade: string | null;
  status: "draft" | "sent" | "in_progress" | "ready" | "received" | "fitted" | "cancelled";
  sent_at: string | null;
  due_at: string | null;
  patient: { id: string; full_name: string } | null;
}

export interface InventoryStockItem {
  id: string;
  sku: string | null;
  name: string;
  category: string;
  unit: string;
  reorder_level: number;
  on_hand: number;
  nearest_expiry: string | null;
}

export interface FinanceOverview {
  invoiced_paise: number;
  collected_paise: number;
  refunded_paise: number;
  outstanding_paise: number;
  draft_estimates: number;
  open_invoices: number;
}
