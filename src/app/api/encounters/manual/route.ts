import { NextResponse } from "next/server";

import { ApiError, readBody, withDoctor } from "@/lib/api/http";
import {
  normalisePatientPhone,
  patientPhoneError,
  type ManualVisitInput,
  type PatientSex,
  type ReviewMedication,
} from "@/lib/encounters/review";
import { normaliseDuration, normaliseFrequency, normaliseRoute } from "@/lib/llm/dosage";
import { callWorkflow } from "@/lib/supabase/workflows";

export const runtime = "nodejs";

const SEX_VALUES = new Set<PatientSex>(["female", "male", "intersex", "not_recorded"]);
const MAX_MEDICATIONS = 30;

/**
 * POST /api/encounters/manual
 *
 * Creates a manual draft, never a committed record. The response has the same
 * shape consumed by ReviewSheet as voice capture, so manual entry cannot skip
 * the human confirmation boundary.
 */
export const POST = withDoctor(async ({ supabase, request }) => {
  const body = await readBody<Partial<ManualVisitInput>>(request);
  const patientName = requiredText(body.patient_name, "A patient name is required.", 160);
  const phoneInput = typeof body.phone === "string" ? body.phone : "";
  const phoneIssue = patientPhoneError(phoneInput);
  if (phoneIssue) throw new ApiError(phoneIssue);
  const phone = normalisePatientPhone(phoneInput);
  const sex = optionalSex(body.sex);
  const age = optionalInteger(body.age_years, "Age", 0, 130);
  const fees = optionalNumber(body.fees_inr, "Fees", 0, 1_000_000);
  const diagnosis = optionalText(body.diagnosis, 2_000);
  const treatment = optionalText(body.treatment, 2_000);
  const prescription = parsePrescription(body.prescription);
  const encounterId = crypto.randomUUID();

  const storedPrescription = prescription.map((medicine) => {
    const frequency = normaliseFrequency(medicine.frequency_spoken);
    return {
      ...medicine,
      frequency_code: frequency.code,
      frequency_label: frequency.label,
      // A value typed by a doctor is reviewed by definition. An omitted
      // frequency still enters the guided checklist in ReviewSheet.
      needs_review: false,
      duration: normaliseDuration(medicine.duration),
      route: medicine.route?.trim() || normaliseRoute(medicine.instructions ?? medicine.form),
    };
  });

  const values = {
    patient_name: patientName,
    age_years: age,
    diagnosis,
    treatment,
    fees_inr: fees,
    phone,
    sex,
  };

  const { error } = await callWorkflow(supabase, "create_manual_draft", {
    p_encounter_id: encounterId,
    p_values: values,
    p_prescription: storedPrescription,
  });

  if (error) {
    console.error("[manual encounter] create failed", error);
    throw new ApiError("Could not create the manual draft.", 500);
  }

  const { data: matches, error: matchError } = await supabase.rpc("match_patients", {
    p_name: patientName,
    p_phone: phone,
    p_limit: 8,
  });
  if (matchError) console.error("[manual encounter] patient match failed", matchError);

  return NextResponse.json({
    encounterId,
    transcriptId: null,
    rawText: "",
    romanText: null,
    languageCode: null,
    extraction: {
      patient_name: patientName,
      age_years: age,
      diagnosis,
      treatment,
      fees_inr: fees,
      prescription,
      uncertain_fields: [],
      notes_for_doctor: null,
    },
    degraded: false,
    warnings: [],
    suggestedPatients: matches ?? [],
    source: "manual",
    audioAvailable: false,
    patientIdentity: { phone, sex },
  });
});

function parsePrescription(value: unknown): ReviewMedication[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ApiError("Prescription must be a list.");
  if (value.length > MAX_MEDICATIONS) {
    throw new ApiError(`A visit can contain at most ${MAX_MEDICATIONS} medicines.`);
  }

  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new ApiError(`Medicine ${index + 1} is invalid.`);
    }
    const item = entry as Record<string, unknown>;
    const drugName = optionalText(item.drug_name, 200);
    const hasOtherValue = [
      item.strength,
      item.form,
      item.route,
      item.frequency_spoken,
      item.duration,
      item.instructions,
    ].some((part) => typeof part === "string" && part.trim());

    if (!drugName) {
      if (hasOtherValue) throw new ApiError(`Medicine ${index + 1} needs a drug name.`);
      return [];
    }

    return [
      {
        drug_name: drugName,
        strength: optionalText(item.strength, 120),
        form: optionalText(item.form, 80),
        route: optionalText(item.route, 80),
        frequency_spoken: optionalText(item.frequency_spoken, 120),
        duration: optionalText(item.duration, 120),
        instructions: optionalText(item.instructions, 500),
      },
    ];
  });
}

function requiredText(value: unknown, message: string, limit: number): string {
  const text = optionalText(value, limit);
  if (!text) throw new ApiError(message);
  return text;
}

function optionalText(value: unknown, limit: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new ApiError("A text field was invalid.");
  const text = value.trim();
  if (!text) return null;
  if (text.length > limit) throw new ApiError(`A text field exceeds ${limit} characters.`);
  return text;
}

function optionalInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new ApiError(`${label} must be a whole number between ${minimum} and ${maximum}.`);
  }
  return number;
}

function optionalNumber(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new ApiError(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return number;
}

function optionalSex(value: unknown): PatientSex | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !SEX_VALUES.has(value as PatientSex)) {
    throw new ApiError("Sex value is invalid.");
  }
  return value as PatientSex;
}
