import { NextResponse } from "next/server";

import { ApiError, readBody, withDoctor } from "@/lib/api/http";
import { normaliseDuration, normaliseFrequency, normaliseRoute } from "@/lib/llm/dosage";

/**
 * PATCH  /api/encounters/[id]   — save the doctor's edits to a draft
 * DELETE /api/encounters/[id]   — discard a draft
 *
 * Edits are confined to drafts on purpose. Once an encounter is committed it is
 * part of the day's register and, for a clinical record, silently mutable
 * history is a liability. Correcting a committed visit is a separate, audited
 * action — not a PATCH.
 */

type Params = { id: string };

interface PrescriptionInput {
  drug_name?: string;
  strength?: string | null;
  form?: string | null;
  frequency_spoken?: string | null;
  duration?: string | null;
  instructions?: string | null;
}

interface PatchBody {
  patient_name_spoken?: string | null;
  age_years?: number | null;
  diagnosis?: string | null;
  treatment?: string | null;
  fees_inr?: number | null;
  prescription?: PrescriptionInput[];
}

export const PATCH = withDoctor<Params>(async ({ supabase, request, params, doctor }) => {
  const body = await readBody<PatchBody>(request);

  const { data: encounter, error } = await supabase
    .from("encounters")
    .select("id, status")
    .eq("id", params.id)
    .single();

  if (error || !encounter) throw new ApiError("Encounter not found.", 404);
  if (encounter.status !== "draft") {
    throw new ApiError("This visit has already been saved to the register.", 409);
  }

  const patch: Record<string, unknown> = {};
  if ("patient_name_spoken" in body) patch.patient_name_spoken = body.patient_name_spoken;
  if ("age_years" in body) patch.age_years = coerceAge(body.age_years);
  if ("diagnosis" in body) patch.diagnosis = body.diagnosis;
  if ("treatment" in body) patch.treatment = body.treatment;
  if ("fees_inr" in body) patch.fees_inr = coerceFees(body.fees_inr);

  if (Object.keys(patch).length > 0) {
    patch.edited_by_doctor = true;
    const { error: updateError } = await supabase
      .from("encounters")
      .update(patch)
      .eq("id", params.id);
    if (updateError) throw new ApiError("Could not save your changes.", 500);
  }

  if (body.prescription) {
    await supabase.from("prescription_items").delete().eq("encounter_id", params.id);

    const items = body.prescription
      .filter((item) => item.drug_name?.trim())
      .map((item, index) => {
        const frequency = normaliseFrequency(item.frequency_spoken ?? null);
        return {
          encounter_id: params.id,
          clinic_id: doctor.clinic_id,
          position: index,
          drug_name: item.drug_name!.trim(),
          strength: item.strength ?? null,
          form: item.form ?? null,
          frequency_spoken: item.frequency_spoken ?? null,
          frequency_code: frequency.code,
          frequency_label: frequency.label,
          // A doctor typing the frequency by hand has reviewed it by definition.
          needs_review: false,
          route: normaliseRoute(item.instructions ?? item.form ?? null),
          duration: normaliseDuration(item.duration ?? null),
          instructions: item.instructions ?? null,
        };
      });

    if (items.length > 0) {
      const { error: itemsError } = await supabase.from("prescription_items").insert(items);
      if (itemsError) throw new ApiError("Could not save the prescription.", 500);
    }
  }

  return NextResponse.json({ ok: true });
});

export const DELETE = withDoctor<Params>(async ({ supabase, params }) => {
  const { data: encounter } = await supabase
    .from("encounters")
    .select("id, status")
    .eq("id", params.id)
    .single();

  if (!encounter) throw new ApiError("Encounter not found.", 404);
  if (encounter.status === "committed") {
    throw new ApiError("Committed visits cannot be discarded.", 409);
  }

  // Soft-discard. The transcript and audio survive, because "I threw away the
  // draft, can you get it back" is a question that gets asked.
  const { error } = await supabase
    .from("encounters")
    .update({ status: "discarded" })
    .eq("id", params.id);

  if (error) throw new ApiError("Could not discard the draft.", 500);
  return NextResponse.json({ ok: true });
});

function coerceAge(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const age = Number(value);
  if (!Number.isFinite(age) || age < 0 || age > 130) {
    throw new ApiError("Age must be between 0 and 130.");
  }
  return Math.floor(age);
}

function coerceFees(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const fees = Number(value);
  if (!Number.isFinite(fees) || fees < 0) throw new ApiError("Fees cannot be negative.");
  if (fees > 1_000_000) throw new ApiError("That fee looks wrong — please check it.");
  return fees;
}
