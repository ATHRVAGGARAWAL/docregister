import type {
  Extraction,
  PrescriptionItem,
  ProcedureItem,
  ToothFindingItem,
} from "../llm/schema.ts";
import { normaliseFrequency } from "../llm/dosage.ts";
import { parseSurfaces, parseToothReference } from "../dental/tooth.ts";
import { inferScope, parseSitting } from "../dental/procedure.ts";

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

export interface ReviewExtraction extends Omit<Extraction, "prescription" | "procedures" | "tooth_findings"> {
  prescription: ReviewMedication[];
  procedures: ReviewProcedure[];
  tooth_findings: ReviewToothFinding[];
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
  tooth_findings: ReviewToothFinding[];
}

/**
 * A procedure as the review sheet edits it.
 *
 * Mirrors `ReviewMedication`: the model's verbatim `*_spoken` fields plus the
 * resolved values a deterministic pass produced, both kept. `tooth_spoken` is
 * the evidence and `tooth_fdi` is the answer, and a dentist correcting the
 * second must not silently erase the first.
 */
export interface ReviewProcedure extends ProcedureItem {
  catalogue_id?: string | null;
  scope?: string | null;
  tooth_fdi?: number | null;
  surfaces?: string[];
  sitting_number?: number | null;
  total_sittings?: number | null;
  /** The dentist has corrected this row; stop re-deriving it from speech. */
  resolved?: boolean;
}

export interface ReviewToothFinding extends ToothFindingItem {
  tooth_fdi?: number | null;
  surfaces?: string[];
  /** The dentist has corrected this row; preserve that correction. */
  resolved?: boolean;
}

export function normaliseToothFindings(
  items: readonly ReviewToothFinding[],
): ReviewToothFinding[] {
  return items.map((item) => {
    if (item.resolved) return item;
    const tooth = parseToothReference(item.tooth_spoken);
    return {
      ...item,
      tooth_fdi: tooth.fdi,
      surfaces: parseSurfaces(item.surfaces_spoken),
    };
  });
}

/**
 * Resolve the spoken fields of every procedure, deterministically.
 *
 * One place, called by every capture route. `src/app/api/drafts/[id]/route.ts`
 * already shows the cost of the alternative: it passes `body.prescription`
 * straight through where the other two routes normalise it, so every autosave
 * rewrites `frequency_code` and `frequency_label` to null.
 */
export function normaliseProcedures(items: readonly ReviewProcedure[]): ReviewProcedure[] {
  return items.map((item) => {
    // A row the dentist has already corrected is left exactly as they left it.
    // Re-deriving would overwrite their tooth with the model's reading on every
    // re-render.
    if (item.resolved) return item;

    const tooth = parseToothReference(item.tooth_spoken);
    const sitting = parseSitting(item.sitting_spoken);
    const scope = inferScope(item.procedure_name, tooth.fdi);
    return {
      ...item,
      catalogue_id: item.catalogue_id ?? null,
      scope,
      tooth_fdi: tooth.fdi,
      // Surfaces mean something only on a crown, and the database enforces the
      // same rule — `encounter_procedures_surfaces_scoped` rejects them on a
      // full-mouth scaling.
      surfaces: scope === "tooth" ? parseSurfaces(item.surfaces_spoken) : [],
      sitting_number: sitting.sitting,
      total_sittings: sitting.total,
    };
  });
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
  consultation_fee_inr: "Consultation amount",
};

const PROCEDURE_LABELS: Record<string, string> = {
  procedure_name: "procedure",
  tooth_fdi: "tooth",
  tooth_spoken: "tooth",
  surfaces: "surfaces",
  sitting_number: "sitting",
  total_sittings: "total sittings",
  notes: "notes",
};

const FINDING_LABELS: Record<string, string> = {
  finding: "finding",
  tooth_fdi: "tooth",
  tooth_spoken: "tooth",
  surfaces: "surfaces",
  severity: "severity",
  state: "status",
  note: "note",
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

  // Both lists are defended rather than trusted, because this function runs in
  // a `useState` initialiser inside the review sheet: anything it throws throws
  // during render, and the doctor loses the sheet at the one moment it matters
  // — after they have finished dictating and before anything is saved. An
  // extraction is assembled from a model response, a stored draft row and a
  // reconciliation pass, and a missing array from any of those is a bad review
  // queue, not a lost consultation.
  const uncertain = Array.isArray(extraction.uncertain_fields)
    ? extraction.uncertain_fields
    : [];
  const prescription = Array.isArray(extraction.prescription)
    ? extraction.prescription
    : [];
  const procedures = Array.isArray(extraction.procedures) ? extraction.procedures : [];
  const findings = Array.isArray(extraction.tooth_findings) ? extraction.tooth_findings : [];

  for (const raw of uncertain) {
    const key = normaliseReviewKey(
      raw,
      prescription.length,
      procedures.length,
      findings.length,
    );
    if (key) keys.add(key);
  }

  prescription.forEach((medicine, index) => {
    if (normaliseFrequency(medicine.frequency_spoken).needsReview) {
      keys.add(`prescription.${index}.frequency_spoken`);
    }
  });

  // A procedure the dentist has to look at is one whose tooth did not resolve.
  // `needs_review` is set by the deterministic pass in the capture routes;
  // an unresolved tooth on a per-tooth procedure is flagged even without it,
  // because a procedure charted against no tooth is the failure this whole
  // review step exists to catch.
  // Derived from the spoken value, not from a resolved field, so the queue is
  // right whether or not normalisation has run — the same reason the frequency
  // check above calls `normaliseFrequency` rather than reading `frequency_code`.
  procedures.forEach((procedure, index) => {
    if (procedure.resolved) return;
    const tooth = parseToothReference(procedure.tooth_spoken);
    const scope = procedure.scope ?? inferScope(procedure.procedure_name, tooth.fdi);
    const unresolvedTooth = scope === "tooth" && tooth.fdi === null;
    if (tooth.needsReview || unresolvedTooth || parseSitting(procedure.sitting_spoken).needsReview) {
      keys.add(`procedures.${index}.tooth_fdi`);
    }
  });

  findings.forEach((finding, index) => {
    if (finding.resolved) return;
    const tooth = parseToothReference(finding.tooth_spoken);
    if (tooth.needsReview || tooth.fdi === null) {
      keys.add(`tooth_findings.${index}.tooth_fdi`);
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

function normaliseReviewKey(
  raw: string,
  medicationCount: number,
  procedureCount: number,
  findingCount: number,
): string | null {
  const value = raw.trim().toLowerCase().replace(/\[(\d+)\]/g, ".$1");
  if (value in FIELD_LABELS) return value;

  // Procedures before prescriptions: both are `list.index.field`, and a key
  // that named a procedure used to fall through this function and return null,
  // which meant the model could flag a tooth it was unsure of and the review
  // sheet would never show it. A silently dropped flag on a tooth number is the
  // worst possible thing for this list to do.
  const procedureMatch = value.match(/^procedures?(?:\.(\d+))?\.?([a-z_]+)?$/);
  if (procedureMatch) {
    const index = procedureMatch[1] === undefined ? 0 : Number(procedureMatch[1]);
    if (!Number.isInteger(index) || index < 0 || index >= procedureCount) return null;
    const field =
      procedureMatch[2] && procedureMatch[2] in PROCEDURE_LABELS
        ? procedureMatch[2]
        : "tooth_fdi";
    // `tooth_spoken` and `tooth_fdi` are the same thing to a reviewer, and two
    // checklist rows for one field would make them confirm it twice.
    return `procedures.${index}.${field === "tooth_spoken" ? "tooth_fdi" : field}`;
  }

  const findingMatch = value.match(/^tooth_findings?(?:\.(\d+))?\.?([a-z_]+)?$/);
  if (findingMatch) {
    const index = findingMatch[1] === undefined ? 0 : Number(findingMatch[1]);
    if (!Number.isInteger(index) || index < 0 || index >= findingCount) return null;
    const field =
      findingMatch[2] && findingMatch[2] in FINDING_LABELS
        ? findingMatch[2]
        : "tooth_fdi";
    return `tooth_findings.${index}.${field === "tooth_spoken" ? "tooth_fdi" : field}`;
  }

  const match = value.match(/^prescription(?:\.(\d+))?\.?([a-z_]+)?$/);
  if (!match) return null;

  const index = match[1] === undefined ? 0 : Number(match[1]);
  if (!Number.isInteger(index) || index < 0 || index >= medicationCount) return null;
  const field = match[2] && match[2] in MEDICATION_LABELS ? match[2] : "drug_name";
  return `prescription.${index}.${field}`;
}

function reviewLabel(key: string): string {
  if (key in FIELD_LABELS) return FIELD_LABELS[key];

  const procedureMatch = key.match(/^procedures\.(\d+)\.([a-z_]+)$/);
  if (procedureMatch) {
    const procedureNumber = Number(procedureMatch[1]) + 1;
    return `Procedure ${procedureNumber} ${PROCEDURE_LABELS[procedureMatch[2]] ?? "detail"}`;
  }

  const findingMatch = key.match(/^tooth_findings\.(\d+)\.([a-z_]+)$/);
  if (findingMatch) {
    const findingNumber = Number(findingMatch[1]) + 1;
    return `Finding ${findingNumber} ${FINDING_LABELS[findingMatch[2]] ?? "detail"}`;
  }

  const match = key.match(/^prescription\.(\d+)\.([a-z_]+)$/);
  if (!match) return "Flagged detail";
  const medicineNumber = Number(match[1]) + 1;
  return `Medicine ${medicineNumber} ${MEDICATION_LABELS[match[2]] ?? "detail"}`;
}
