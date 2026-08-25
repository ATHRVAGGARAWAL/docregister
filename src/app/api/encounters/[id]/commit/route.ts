import { NextResponse } from "next/server";

import { ApiError, readBody, withDoctor } from "@/lib/api/http";

/**
 * POST /api/encounters/[id]/commit
 * body: { patientId } | { newPatient: { full_name, phone?, age_years?, sex? } }
 * -> { encounterId, patientId, visitNumber, isNewPatient }
 *
 * Step 3 of 3, and the only place a dictated visit enters the register.
 *
 * This route exists as a distinct, explicit action because a human has to stand
 * behind every row. Everything upstream — the recogniser, the extractor, the
 * dosage table — is a suggestion engine. This is the signature.
 */

export const runtime = "nodejs";

type Params = { id: string };

interface CommitBody {
  patientId?: string;
  newPatient?: {
    full_name?: string;
    phone?: string | null;
    age_years?: number | null;
    sex?: string | null;
  };
  /** Client-generated, stable across retries. Guards double-taps on flaky 3G. */
  idempotencyKey?: string;
}

export const POST = withDoctor<Params>(async ({ doctor, supabase, request, params }) => {
  const body = await readBody<CommitBody>(request);

  const { data: encounter, error: loadError } = await supabase
    .from("encounters")
    .select("id, status, patient_id, patient_name_spoken, age_years, visit_number, is_new_patient")
    .eq("id", params.id)
    .single();

  if (loadError || !encounter) throw new ApiError("Encounter not found.", 404);

  // Committing twice is a no-op that returns the original result, not an error.
  // On a phone in a clinic corridor, the second tap is almost always the same
  // intent as the first.
  if (encounter.status === "committed") {
    return NextResponse.json({
      encounterId: encounter.id,
      patientId: encounter.patient_id,
      visitNumber: encounter.visit_number,
      isNewPatient: encounter.is_new_patient,
      alreadyCommitted: true,
    });
  }

  if (encounter.status === "discarded") {
    throw new ApiError("This draft was discarded.", 409);
  }

  let patientId = body.patientId ?? null;

  if (!patientId && body.newPatient) {
    const fullName = body.newPatient.full_name?.trim() || encounter.patient_name_spoken?.trim();
    if (!fullName) throw new ApiError("A patient name is required.");

    const { data: created, error: patientError } = await supabase
      .from("patients")
      .insert({
        clinic_id: doctor.clinic_id,
        full_name: fullName,
        phone: body.newPatient.phone?.trim() || null,
        age_years: body.newPatient.age_years ?? encounter.age_years ?? null,
        sex: body.newPatient.sex ?? null,
        created_by: doctor.id,
      })
      .select("id")
      .single();

    if (patientError) {
      // The unique index on (clinic_id, phone) is what fires here: the same
      // number is already on file, so link to that patient rather than
      // creating a second chart for one person.
      if (patientError.code === "23505" && body.newPatient.phone) {
        const { data: existing } = await supabase
          .from("patients")
          .select("id")
          .eq("phone", body.newPatient.phone.trim())
          .single();
        patientId = existing?.id ?? null;
      }
      if (!patientId) {
        console.error("[commit] patient insert failed", patientError);
        throw new ApiError("Could not create the patient record.", 500);
      }
    } else {
      patientId = created.id;
    }
  }

  if (!patientId) {
    throw new ApiError("Choose an existing patient or add a new one before saving.");
  }

  if (body.idempotencyKey) {
    await supabase
      .from("encounters")
      .update({ idempotency_key: body.idempotencyKey })
      .eq("id", params.id);
  }

  // A database function, not three round trips. Assigning a visit number,
  // deciding new-vs-returning, and flipping the status have to happen together
  // — two concurrent commits for one patient must not both read "visit 1".
  const { data, error } = await supabase.rpc("commit_encounter", {
    p_encounter_id: params.id,
    p_patient_id: patientId,
  });

  if (error) {
    console.error("[commit] rpc failed", error);
    throw new ApiError("Could not save this visit to the register.", 500);
  }

  const result = Array.isArray(data) ? data[0] : data;

  return NextResponse.json({
    encounterId: params.id,
    patientId,
    visitNumber: result?.visit_number ?? null,
    isNewPatient: result?.is_new_patient ?? null,
    alreadyCommitted: false,
  });
}, { rateLimit: "commit" });
