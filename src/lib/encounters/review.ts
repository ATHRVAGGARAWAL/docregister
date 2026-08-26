import type { Extraction, PrescriptionItem } from "../llm/schema.ts";
import { normaliseFrequency } from "../llm/dosage.ts";

/** A patient candidate is always a suggestion. It is never linked automatically. */
export interface PatientMatch {
  id: string;
  full_name: string;
  phone: string | null;
  age_years: number | null;
  last_visit: string | null;
  visit_count: number | null;
}

export type PatientSex = "female" | "male" | "intersex" | "not_recorded";

export const PATIENT_SEX_OPTIONS: ReadonlyArray<{ value: PatientSex; label: string }> = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "intersex", label: "Intersex" },
  { value: "not_recorded", label: "Not recorded" },
];

/**
 * Editable prescription shape.
 *
 * `route` is intentionally a review-layer field rather than an extraction
 * schema field. The current extractor infers it conservatively, but a doctor
 * must still be able to record an explicit PO/IV/topical route by hand.
 */
export interface ReviewMedication extends PrescriptionItem {
  route?: string | null;
}

export interface ReviewExtraction extends Omit<Extraction, "prescription"> {
  prescription: ReviewMedication[];
}

/** The common shape consumed by ReviewSheet for voice and manual capture. */
export interface ReviewDraft {
  encounterId: string;
  transcriptId: string | null;
  rawText: string;
  romanText: string | null;
  languageCode: string | null;
  extraction: ReviewExtraction;
  degraded: boolean;
  warnings: string[];
  suggestedPatients: PatientMatch[];
  source?: "voice" | "manual";
  audioAvailable?: boolean;
  patientIdentity?: {
    phone: string | null;
    sex: PatientSex | null;
  };
}

export interface ManualVisitInput {
  patient_name: string;
  phone: string | null;
  sex: PatientSex | null;
  age_years: number | null;
  diagnosis: string | null;
  treatment: string | null;
  prescription: ReviewMedication[];
}

export interface ReviewChecklistItem {
  key: string;
  label: string;
  targetId: string;
}

const FIELD_LABELS: Record<string, string> = {
  patient_name: "Patient name",
  age_years: "Age",
  diagnosis: "Diagnosis",
  treatment: "Treatment",
};

const MEDICATION_LABELS: Record<string, string> = {
  drug_name: "drug name",
  strength: "strength",
  form: "form",
  route: "route",
  frequency_spoken: "frequency",
  duration: "duration",
  instructions: "instructions",
};

/** Stable DOM id used by both the checklist and the input it jumps to. */
export function reviewFieldId(key: string): string {
  return `review-${key.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
}

/**
 * Turn the extractor's free-form uncertainty paths into a small guided queue.
 * Providers have emitted both `prescription[0].strength` and
 * `prescription.0.strength`, so both spellings are accepted.
 */
export function buildReviewChecklist(extraction: ReviewExtraction): ReviewChecklistItem[] {
  const keys = new Set<string>();

  for (const raw of extraction.uncertain_fields) {
    const key = normaliseReviewKey(raw, extraction.prescription.length);
    if (key) keys.add(key);
  }

  extraction.prescription.forEach((medicine, index) => {
    if (normaliseFrequency(medicine.frequency_spoken).needsReview) {
      keys.add(`prescription.${index}.frequency_spoken`);
    }
  });

  return [...keys].map((key) => ({
    key,
    label: reviewLabel(key),
    targetId: reviewFieldId(key),
  }));
}

export function normalisePatientPhone(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const leadingPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  return `${leadingPlus ? "+" : ""}${digits}`;
}

export function patientPhoneError(value: string): string | null {
  const normalised = normalisePatientPhone(value);
  if (!normalised) return value.trim() ? "Enter a valid phone number." : null;
  const digits = normalised.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) {
    return "Phone number must contain 7 to 15 digits.";
  }
  return null;
}

function normaliseReviewKey(raw: string, medicationCount: number): string | null {
  const value = raw.trim().toLowerCase().replace(/\[(\d+)\]/g, ".$1");
  if (value in FIELD_LABELS) return value;

  const match = value.match(/^prescription(?:\.(\d+))?\.?([a-z_]+)?$/);
  if (!match) return null;

  const index = match[1] === undefined ? 0 : Number(match[1]);
  if (!Number.isInteger(index) || index < 0 || index >= medicationCount) return null;
  const field = match[2] && match[2] in MEDICATION_LABELS ? match[2] : "drug_name";
  return `prescription.${index}.${field}`;
}

function reviewLabel(key: string): string {
  if (key in FIELD_LABELS) return FIELD_LABELS[key];
  const match = key.match(/^prescription\.(\d+)\.([a-z_]+)$/);
  if (!match) return "Flagged detail";
  const medicineNumber = Number(match[1]) + 1;
  return `Medicine ${medicineNumber} ${MEDICATION_LABELS[match[2]] ?? "detail"}`;
}
