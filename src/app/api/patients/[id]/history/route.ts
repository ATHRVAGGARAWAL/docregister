import { NextResponse } from "next/server";

import { ApiError, withDoctor } from "@/lib/api/http";
import { callWorkflow } from "@/lib/supabase/workflows";
import type { PatientHistoryPayload } from "@/lib/types";

interface PatientRow {
  id: string;
  full_name: string;
  phone: string | null;
  age_years: number | null;
  sex: string | null;
  abha_id: string | null;
  notes: string | null;
  first_seen_at: string;
}

interface EncounterRow {
  id: string;
  occurred_at: string;
  age_years: number | null;
  diagnosis: string | null;
  treatment: string | null;
  fees_inr: number | string | null;
  visit_number: number | null;
  doctors: { full_name: string } | null;
  prescription_items: {
    id: string;
    drug_name: string;
    strength: string | null;
    form: string | null;
    frequency_label: string | null;
    frequency_spoken: string | null;
    duration: string | null;
    instructions: string | null;
    position: number;
  }[];
}

export const GET = withDoctor<{ id: string }>(async ({ doctor, supabase, params }) => {
  const patientId = params.id;

  const { data: patient, error: patientError } = await supabase
    .from("patients")
    .select("id, full_name, phone, age_years, sex, abha_id, notes, first_seen_at")
    .eq("id", patientId)
    .eq("clinic_id", doctor.clinic_id)
    .maybeSingle();

  if (patientError) {
    console.error("[patient-history] patient lookup failed", patientError);
    throw new ApiError("Could not open this patient chart.", 500);
  }
  if (!patient) throw new ApiError("Patient chart not found.", 404);

  const { data: encounters, error: encountersError } = await supabase
    .from("encounters")
    .select(
      `id, occurred_at, age_years, diagnosis, treatment, fees_inr, visit_number,
       doctors ( full_name ),
       prescription_items (
         id, drug_name, strength, form, frequency_label, frequency_spoken,
         duration, instructions, position
       )`,
    )
    .eq("clinic_id", doctor.clinic_id)
    .eq("patient_id", patientId)
    .eq("status", "committed")
    .order("occurred_at", { ascending: false });

  if (encountersError) {
    console.error("[patient-history] encounter lookup failed", encountersError);
    throw new ApiError("Could not load this patient’s medical history.", 500);
  }

  const payload: PatientHistoryPayload = {
    patient: patient as PatientRow,
    encounters: ((encounters ?? []) as unknown as EncounterRow[]).map((encounter) => ({
      id: encounter.id,
      occurred_at: encounter.occurred_at,
      age_years: encounter.age_years,
      diagnosis: encounter.diagnosis,
      treatment: encounter.treatment,
      fees_inr: encounter.fees_inr === null ? null : Number(encounter.fees_inr),
      visit_number: encounter.visit_number,
      doctor_name: encounter.doctors?.full_name ?? null,
      prescription: [...encounter.prescription_items]
        .sort((a, b) => a.position - b.position)
        .map((item) => ({
          id: item.id,
          drug_name: item.drug_name,
          strength: item.strength,
          form: item.form,
          frequency: item.frequency_label ?? item.frequency_spoken,
          duration: item.duration,
          instructions: item.instructions,
        })),
    })),
  };

  const { error: auditError } = await callWorkflow<null>(supabase, "log_sensitive_access", {
    p_action: "read",
    p_entity: "patient",
    p_entity_id: patientId,
    p_detail: { surface: "patient_history" },
  });
  if (auditError) {
    console.error("[patient-history] audit failed", auditError);
    throw new ApiError("Could not open this patient chart.", 500);
  }

  return NextResponse.json(payload);
}, { rateLimit: "match" });
