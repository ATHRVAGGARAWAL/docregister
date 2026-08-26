import { NextResponse } from "next/server";

import type { Json } from "@/lib/supabase/database.types";
import { ApiError, PGRST_NO_ROWS, readBody, withDoctor } from "@/lib/api/http";
import { loadEncounterDetails } from "@/lib/encounter-details";
import { normaliseDuration, normaliseFrequency, normaliseRoute } from "@/lib/llm/dosage";
import { callWorkflow } from "@/lib/supabase/workflows";

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

/**
 * GET /api/encounters/[id] — the complete visit record. The response includes
 * the signed source values, effective replayed values, transcript evidence, and
 * every append-only amendment. A committed row is never updated while reading.
 */
export const GET = withDoctor<Params>(async ({ doctor, supabase, params }) => {
  let payload;
  try {
    payload = await loadEncounterDetails(supabase, params.id, doctor.clinic_id);
  } catch (error) {
    console.error("[encounters/details] lookup failed", error);
    throw new ApiError("Could not open this visit.", 500);
  }
  if (!payload) throw new ApiError("Visit not found.", 404);

  const { error: auditError } = await callWorkflow<null>(supabase, "log_sensitive_access", {
    p_action: "read",
    p_entity: "encounter",
    p_entity_id: params.id,
    p_detail: { surface: "visit_details" },
  });
  if (auditError) {
    console.error("[encounters/details] audit failed", auditError);
    throw new ApiError("Could not open this visit.", 500);
  }

  return NextResponse.json(payload);
}, { rateLimit: "match" });

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
  prescription?: PrescriptionInput[];
}

export const PATCH = withDoctor<Params>(async ({ supabase, request, params }) => {
  const body = await readBody<PatchBody>(request);

  const { data: encounter, error: loadError } = await supabase
    .from("encounters")
    .select("id, status")
    .eq("id", params.id)
    .single();

  // Same distinction the DELETE path makes below: a miss is a 404, a broken
  // query is ours, and answering both with "not found" would tell a doctor
  // their draft is gone while it is still on the screen in front of them.
  if (loadError && loadError.code !== PGRST_NO_ROWS) {
    console.error("[encounters/patch] load failed", loadError);
    throw new ApiError("Could not save your changes.", 500);
  }
  if (!encounter) throw new ApiError("Encounter not found.", 404);
  if (encounter.status !== "draft") {
    throw new ApiError("This visit has already been saved to the register.", 409);
  }

  // Typed against the generated schema rather than `Record<string, unknown>`,
  // so a column that does not exist is a compile error rather than a silently
  // ignored key. The free-text fields go through `coerceText`, which is what
  // stops `{"diagnosis": {"a": 1}}` or a 10 MB string reaching Postgres — they
  // were previously written straight through with no check of any kind.
  const patch: Record<string, Json> = {};
  if ("patient_name_spoken" in body) patch.patient_name_spoken = coerceText(body.patient_name_spoken);
  if ("age_years" in body) patch.age_years = coerceAge(body.age_years);
  if ("diagnosis" in body) patch.diagnosis = coerceText(body.diagnosis);
  if ("treatment" in body) patch.treatment = coerceText(body.treatment);

  let items: Array<Record<string, Json>> | null = null;
  if (body.prescription) {
    items = body.prescription
      .filter((item) => item.drug_name?.trim())
      .map((item) => {
        const frequency = normaliseFrequency(item.frequency_spoken ?? null);
        return {
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
  }

  // The field update and prescription replacement succeed or roll back as one
  // operation. Authenticated sessions cannot write either table directly.
  const { error: workflowError } = await callWorkflow<unknown>(
    supabase,
    "update_draft_workflow",
    {
      p_encounter_id: params.id,
      p_patch: patch,
      p_prescription: items,
      p_expected_version: null,
    },
  );

  if (workflowError) {
    console.error("[encounters/patch] workflow failed", workflowError);
    if (workflowError.code === "P0002") throw new ApiError("Encounter not found.", 404);
    if (workflowError.code === "40001") {
      throw new ApiError("This draft changed elsewhere. Reload it and try again.", 409);
    }
    if (workflowError.code === "23514") {
      throw new ApiError("This visit can no longer be edited.", 409);
    }
    throw new ApiError("Could not save your changes.", 500);
  }

  return NextResponse.json({ ok: true });
});

export const DELETE = withDoctor<Params>(async ({ supabase, params }) => {
  const { data: encounter, error: loadError } = await supabase
    .from("encounters")
    .select("id, status")
    .eq("id", params.id)
    .single();

  // `.single()` returns null data both when there is no such row and when the
  // query failed, so the two have to be told apart before answering. Reporting
  // a database outage as "Encounter not found." sends the doctor looking for a
  // draft that is still sitting there, and invites them to re-dictate a visit
  // that was never lost.
  if (loadError && loadError.code !== PGRST_NO_ROWS) {
    console.error("[encounters/delete] load failed", loadError);
    throw new ApiError("Could not discard the draft.", 500);
  }
  if (!encounter) throw new ApiError("Encounter not found.", 404);
  if (encounter.status === "committed") {
    throw new ApiError("Committed visits cannot be discarded.", 409);
  }

  // Soft-discard through the only mutation path the database grants. The
  // transcript and audio survive, because recovery is a supported workflow.
  const { error } = await callWorkflow<unknown>(supabase, "discard_draft_workflow", {
    p_encounter_id: params.id,
    p_expected_version: null,
  });

  if (error) {
    console.error("[encounters/delete] workflow failed", error);
    if (error.code === "P0002") throw new ApiError("Encounter not found.", 404);
    if (error.code === "23514") throw new ApiError("Committed visits cannot be discarded.", 409);
    throw new ApiError("Could not discard the draft.", 500);
  }
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

/**
 * A clinical free-text field: a string of sane length, or nothing.
 *
 * Anything else is dropped rather than rejected, because a malformed value here
 * is a client bug and the rest of the edit is still worth saving. The cap is
 * deliberate — these columns are unbounded `text`, and nothing upstream limited
 * what reached them.
 */
const MAX_TEXT = 2_000;

function coerceText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_TEXT);
}
