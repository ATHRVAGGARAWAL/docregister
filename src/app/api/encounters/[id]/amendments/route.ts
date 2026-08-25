import { NextResponse } from "next/server";

import { ApiError, readBody, requireString, withDoctor } from "@/lib/api/http";
import { callWorkflow } from "@/lib/supabase/workflows";

type Params = { id: string };

interface AmendmentBody {
  reason?: string;
  /** A partial effective visit snapshot. The RPC validates the allow-list. */
  changes?: Record<string, unknown>;
  /** Friendly single-field form accepted by the correction sheet. */
  field?: string;
  value?: unknown;
}

/**
 * POST /api/encounters/[id]/amendments
 *
 * Appends an audited correction to a committed visit. This route intentionally
 * has no PATCH/PUT path: the encounter and prescription source rows remain
 * unchanged forever.
 */
export const POST = withDoctor<Params>(async ({ supabase, request, params }) => {
  const body = await readBody<AmendmentBody>(request);
  const reason = requireString(body.reason, "reason").trim();
  if (reason.length > 2000) throw new ApiError("The correction reason is too long.");

  let changes = body.changes;
  if (!changes && body.field) changes = { [body.field]: body.value };
  if (!changes || typeof changes !== "object" || Array.isArray(changes) || Object.keys(changes).length === 0) {
    throw new ApiError("Choose at least one value to correct.");
  }

  const allowed = new Set([
    "patient_name_spoken",
    "age_years",
    "diagnosis",
    "treatment",
    "fees_inr",
    "prescription",
  ]);
  if (Object.keys(changes).some((key) => !allowed.has(key))) {
    throw new ApiError("That visit field cannot be corrected.");
  }

  const { data, error } = await callWorkflow<AmendmentRow[]>(supabase, "append_encounter_amendment", {
    p_encounter_id: params.id,
    p_changes: changes,
    p_reason: reason,
  });
  if (error) {
    console.error("[encounters/amendments] append failed", error);
    if (error.code === "P0002") throw new ApiError("Committed visit not found.", 404);
    if (error.code === "23514") throw new ApiError(error.message.includes("reason") ? "A correction reason is required." : "The correction is invalid.", 422);
    if (error.code === "55000") throw new ApiError("Visit corrections are append-only.", 409);
    throw new ApiError("Could not record this correction.", 500);
  }

  const amendment = data?.[0];
  if (!amendment) throw new ApiError("Could not record this correction.", 500);
  return NextResponse.json({ amendment }, { status: 201 });
});

interface AmendmentRow {
  id: string;
  encounter_id: string;
  revision: number;
  reason: string;
  before_values: Record<string, unknown>;
  after_values: Record<string, unknown>;
  author_id: string;
  created_at: string;
}
