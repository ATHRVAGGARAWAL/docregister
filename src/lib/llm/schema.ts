import * as z from "zod/v4";

/**
 * Extraction schema.
 *
 * Deliberately free of numeric and string-length constraints. The structured
 * output layer does not support `minimum` / `maximum` / `minLength`, so any
 * such constraint here would either be silently dropped or rejected outright.
 * Range checking for age and fees therefore happens in `validateExtraction`
 * below, after parsing — see the check-constraints in
 * `supabase/migrations/0001_init.sql` for the matching database-level guard.
 *
 * Every field is nullable on purpose. A doctor who does not say the patient's
 * age has not produced an encounter with age 0 — they have produced an
 * encounter with no age, and the review UI needs to show an empty field rather
 * than an invented one.
 */

export const PrescriptionItemSchema = z.object({
  drug_name: z
    .string()
    .describe(
      "Drug as spoken. Preserve Indian brand names exactly (Dolo, Crocin, Pan-D, Shelcal). Never substitute a generic name for a brand or vice versa.",
    ),
  strength: z
    .string()
    .nullable()
    .describe("Strength with unit, e.g. '500 mg', '40 mg', '10 ml'. Null if not stated."),
  form: z
    .string()
    .nullable()
    .describe("Dosage form if stated: tab, cap, syrup, inj, drops, ointment."),
  frequency_spoken: z
    .string()
    .nullable()
    .describe(
      "Frequency exactly as spoken, in whatever language, e.g. 'once daily', 'do baar', 'subah shaam', 'BD', '1-0-1'. Do NOT normalise — a deterministic pass handles that.",
    ),
  duration: z
    .string()
    .nullable()
    .describe("Duration, e.g. '5 days', 'saat din', '2 weeks'. Null if not stated."),
  instructions: z
    .string()
    .nullable()
    .describe("Extra instruction such as 'after food', 'khaali pet', 'at bedtime'."),
});

export const ExtractionSchema = z.object({
  patient_name: z
    .string()
    .nullable()
    .describe(
      "Patient's name in Latin script. Transliterate from Devanagari or Gurmukhi if needed. Null if no name was spoken.",
    ),
  age_years: z
    .number()
    .int()
    .nullable()
    .describe(
      "Age in whole years. Convert spoken numerals in any language ('forty-two', 'athaee', 'बयालीस') to an integer. If stated in months, convert to years and round down. Null if not stated.",
    ),
  diagnosis: z
    .string()
    .nullable()
    .describe(
      "Clinical impression, in English, concise. If the doctor spoke it in Hindi/Punjabi, translate the clinical concept but keep it faithful. Null if none stated.",
    ),
  treatment: z
    .string()
    .nullable()
    .describe(
      "Free-text treatment plan summary in English, including advice and follow-up. This is the narrative; individual drugs also go in `prescription`.",
    ),
  fees_inr: z
    .number()
    .nullable()
    .describe(
      "Consultation fee in Indian rupees as a number. Spoken forms include 'paanch sau' (500), 'छह सौ' (600), 'five hundred', 'do hazaar' (2000). Null if no fee was mentioned.",
    ),
  prescription: z
    .array(PrescriptionItemSchema)
    .describe("One entry per drug. Empty array if nothing was prescribed."),
  /**
   * Drives the review UI. Anything listed here is highlighted for the doctor
   * before commit rather than being quietly accepted.
   */
  uncertain_fields: z
    .array(z.string())
    .describe(
      "Names of fields you were not confident about, e.g. ['patient_name','fees_inr']. Be liberal: flagging a field costs the doctor one glance, a wrong drug name costs far more.",
    ),
  notes_for_doctor: z
    .string()
    .nullable()
    .describe(
      "One short sentence if something needs the doctor's attention, e.g. an ambiguous drug name or a fee that could be 500 or 5000. Null if nothing is ambiguous.",
    ),
});

export type Extraction = z.infer<typeof ExtractionSchema>;
export type PrescriptionItem = z.infer<typeof PrescriptionItemSchema>;

/** Issues found after parsing, surfaced in the review UI. */
export interface ValidationIssue {
  field: string;
  message: string;
}

/**
 * Post-parse range checking. This is where the constraints that JSON Schema
 * cannot express are enforced.
 */
export function validateExtraction(value: Extraction): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (value.age_years !== null) {
    if (!Number.isInteger(value.age_years) || value.age_years < 0 || value.age_years > 130) {
      issues.push({
        field: "age_years",
        message: `Age of ${value.age_years} is outside a plausible range — please confirm.`,
      });
    }
  }

  if (value.fees_inr !== null) {
    if (value.fees_inr < 0) {
      issues.push({ field: "fees_inr", message: "Fee cannot be negative." });
    } else if (value.fees_inr > 100_000) {
      // Usually a mis-heard order of magnitude: "five hundred" heard as 5000.
      issues.push({
        field: "fees_inr",
        message: `₹${value.fees_inr.toLocaleString("en-IN")} is unusually high — check the transcript.`,
      });
    }
  }

  if (!value.patient_name) {
    issues.push({
      field: "patient_name",
      message: "No patient name was captured. Add one before saving.",
    });
  }

  return issues;
}

/**
 * What the doctor just said into the microphone.
 *
 * There is one microphone key and two things a doctor does with it, so this is
 * the fork between the two: a consultation goes on to extraction and a review
 * sheet, a question goes to recall and never touches the register. Deliberately
 * a single field — the classifier is asked for a decision, not for a rationale
 * nobody reads, and every extra field is latency on the dictation path.
 */
export const UtteranceKindSchema = z.object({
  kind: z
    .enum(["dictation", "question"])
    .describe(
      "`dictation` when the doctor is recording a consultation that has just happened. `question` when they are asking for something already in the register — including 'pull up her records', which is a request for a chart rather than for a sentence.",
    ),
});

export type UtteranceKind = z.infer<typeof UtteranceKindSchema>["kind"];

/** Natural-language recall answer. */
export const RecallAnswerSchema = z.object({
  answer: z
    .string()
    .describe(
      "Direct answer to the doctor's question, in the same language they asked. Two or three sentences at most. Cite dates as they appear in the records.",
    ),
  referenced_encounter_ids: z
    .array(z.string())
    .describe("IDs of the encounters you actually used, so the UI can link to them."),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe("How well the records actually answer the question."),
  caveat: z
    .string()
    .nullable()
    .describe(
      "Set when the records are incomplete or ambiguous, e.g. two patients share this name. Null otherwise.",
    ),
});

export type RecallAnswer = z.infer<typeof RecallAnswerSchema>;

/** Structured filter parsed out of a free-text recall question. */
export const RecallQuerySchema = z.object({
  patient_name: z
    .string()
    .nullable()
    .describe("Patient the question is about, in Latin script. Null if the question is not about a specific patient."),
  intent: z
    .enum([
      "last_prescription",
      "visit_history",
      "diagnosis_history",
      "fees_history",
      "general",
      "open_record",
    ])
    .describe(
      "What the doctor is actually asking for. `open_record` is the odd one out: it is a request for the patient's chart to be put on screen rather than a question expecting a sentence back.",
    ),
  time_range_days: z
    .number()
    .int()
    .nullable()
    .describe("Look-back window in days if the question implies one ('last month' = 30). Null for no limit."),
  limit: z
    .number()
    .int()
    .describe("How many past encounters are needed to answer. Use 1 for 'last time', up to 20 for history questions."),
});

export type RecallQuery = z.infer<typeof RecallQuerySchema>;
