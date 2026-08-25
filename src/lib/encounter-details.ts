import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { applyEncounterAmendments } from "@/lib/encounter-amendments";
import type { VisitAmendment, VisitDetailsPayload, VisitPrescriptionItem } from "@/lib/types";

type RawEncounter = {
  id: string;
  clinic_id: string;
  doctor_id: string;
  patient_id: string | null;
  transcript_id: string | null;
  status: VisitDetailsPayload["encounter"]["status"];
  occurred_at: string;
  patient_name_spoken: string | null;
  age_years: number | null;
  diagnosis: string | null;
  treatment: string | null;
  fees_inr: number | string | null;
  is_new_patient: boolean | null;
  visit_number: number | null;
};

type RawPatient = {
  id: string;
  full_name: string;
  phone: string | null;
  age_years: number | null;
  sex: string | null;
};

type RawPrescription = VisitPrescriptionItem & { id: string; position: number };

/**
 * Load one visit and replay its immutable corrections over the original row.
 * The original encounter and prescription are intentionally only ever read.
 */
export async function loadEncounterDetails(
  supabase: SupabaseClient,
  encounterId: string,
  clinicId: string,
): Promise<VisitDetailsPayload | null> {
  const { data: encounter, error: encounterError } = await supabase
    .from("encounters")
    .select(
      `id, clinic_id, doctor_id, patient_id, transcript_id, status, occurred_at,
       patient_name_spoken, age_years, diagnosis, treatment, fees_inr,
       is_new_patient, visit_number`,
    )
    .eq("id", encounterId)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (encounterError) throw encounterError;
  if (!encounter) return null;

  const raw = encounter as unknown as RawEncounter;
  const [patientResult, clinicianResult, prescriptionResult, transcriptResult] = await Promise.all([
    raw.patient_id
      ? supabase
          .from("patients")
          .select("id, full_name, phone, age_years, sex")
          .eq("id", raw.patient_id)
          .eq("clinic_id", clinicId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("doctors")
      .select("id, full_name, speciality")
      .eq("id", raw.doctor_id)
      .eq("clinic_id", clinicId)
      .maybeSingle(),
    supabase
      .from("prescription_items")
      .select(
        "id, drug_name, strength, form, frequency_spoken, frequency_code, frequency_label, needs_review, duration, route, instructions, corrected, position",
      )
      .eq("encounter_id", raw.id)
      .eq("clinic_id", clinicId)
      .order("position", { ascending: true }),
    raw.transcript_id
      ? supabase
          .from("transcripts")
          .select(
            "id, raw_text, roman_text, live_text, provider, model, language_code, confidence, degraded, duration_ms, created_at",
          )
          .eq("id", raw.transcript_id)
          .eq("clinic_id", clinicId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (patientResult.error || clinicianResult.error || prescriptionResult.error || transcriptResult.error) {
    throw patientResult.error ?? clinicianResult.error ?? prescriptionResult.error ?? transcriptResult.error;
  }

  // This table was introduced by migration 0014; its generated type is kept
  // untouched by design, so the dynamic boundary is isolated to this helper.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration 0014 is intentionally not copied into database.types.ts
  const db = supabase as any;
  const { data: amendmentRows, error: amendmentsError } = await db
    .from("encounter_amendments")
    .select("id, encounter_id, revision, reason, before_values, after_values, author_id, created_at")
    .eq("encounter_id", raw.id)
    .eq("clinic_id", clinicId)
    .order("revision", { ascending: true });
  if (amendmentsError) throw amendmentsError;

  const amendments = (amendmentRows ?? []) as Array<{
    id: string;
    encounter_id: string;
    revision: number;
    reason: string;
    before_values: Record<string, unknown>;
    after_values: Record<string, unknown>;
    author_id: string;
    created_at: string;
  }>;

  const authorIds = [...new Set(amendments.map((amendment) => amendment.author_id))];
  const { data: authors, error: authorsError } = authorIds.length
    ? await supabase.from("doctors").select("id, full_name").in("id", authorIds).eq("clinic_id", clinicId)
    : { data: [], error: null };
  if (authorsError) throw authorsError;
  const authorNames = new Map((authors ?? []).map((author) => [author.id, author.full_name]));

  const prescription = ((prescriptionResult.data ?? []) as unknown as RawPrescription[]).map((item) => ({
    id: item.id,
    drug_name: item.drug_name,
    strength: item.strength,
    form: item.form,
    frequency_spoken: item.frequency_spoken,
    frequency_code: item.frequency_code,
    frequency_label: item.frequency_label,
    needs_review: item.needs_review,
    duration: item.duration,
    route: item.route,
    instructions: item.instructions,
    corrected: item.corrected,
    position: item.position,
  }));

  const sourceEffective: VisitDetailsPayload["encounter"]["effective"] = {
    patient_name_spoken: raw.patient_name_spoken,
    age_years: raw.age_years,
    diagnosis: raw.diagnosis,
    treatment: raw.treatment,
    fees_inr: raw.fees_inr === null ? null : Number(raw.fees_inr),
    prescription,
  };
  const replayed = applyEncounterAmendments(sourceEffective, amendments);
  const effective = {
    ...replayed,
    fees_inr: replayed.fees_inr === null ? null : Number(replayed.fees_inr),
  };
  const mappedAmendments: VisitAmendment[] = amendments.map((amendment) => {
    return {
      id: amendment.id,
      revision: amendment.revision,
      reason: amendment.reason,
      before_values: amendment.before_values,
      after_values: amendment.after_values,
      author: { id: amendment.author_id, full_name: authorNames.get(amendment.author_id) ?? null },
      created_at: amendment.created_at,
    };
  });

  const patient = (patientResult.data ?? null) as RawPatient | null;
  const clinician = clinicianResult.data
    ? {
        id: clinicianResult.data.id,
        full_name: clinicianResult.data.full_name,
        speciality: clinicianResult.data.speciality,
      }
    : null;
  const transcript = transcriptResult.data
    ? {
        id: transcriptResult.data.id,
        raw_text: transcriptResult.data.raw_text,
        roman_text: transcriptResult.data.roman_text,
        live_text: transcriptResult.data.live_text,
        provider: transcriptResult.data.provider,
        model: transcriptResult.data.model,
        language_code: transcriptResult.data.language_code,
        confidence: transcriptResult.data.confidence,
        degraded: transcriptResult.data.degraded,
        duration_ms: transcriptResult.data.duration_ms,
        created_at: transcriptResult.data.created_at,
      }
    : null;

  return {
    encounter: {
      id: raw.id,
      status: raw.status,
      occurred_at: raw.occurred_at,
      patient_id: raw.patient_id,
      patient,
      clinician,
      patient_name_spoken: raw.patient_name_spoken,
      age_years: raw.age_years,
      diagnosis: raw.diagnosis,
      treatment: raw.treatment,
      fees_inr: raw.fees_inr === null ? null : Number(raw.fees_inr),
      visit_number: raw.visit_number,
      is_new_patient: raw.is_new_patient,
      prescription,
      transcript,
      effective,
    },
    amendments: mappedAmendments,
  };
}
