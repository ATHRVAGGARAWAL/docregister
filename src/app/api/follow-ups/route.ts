import { NextResponse } from "next/server";

import { ApiError, readBody, requireString, withDoctor } from "@/lib/api/http";
import { callWorkflow } from "@/lib/supabase/workflows";

export const runtime = "nodejs";

interface FollowUpRow {
  id: string;
  clinic_id: string;
  patient_id: string;
  encounter_id: string | null;
  created_by: string;
  due_at: string;
  reason: string;
  notes: string | null;
  status: "open" | "completed" | "cancelled";
  completed_at: string | null;
  completed_by: string | null;
  completion_notes: string | null;
  created_at: string;
  patient_name?: string;
  patient_phone?: string | null;
  creator_name?: string;
  completer_name?: string | null;
}

interface CreateFollowUpBody {
  patientId?: unknown;
  encounterId?: unknown;
  dueAt?: unknown;
  reason?: unknown;
  notes?: unknown;
  idempotencyKey?: unknown;
}

/** GET /api/follow-ups?status=open|completed|cancelled|all&limit=100 */
export const GET = withDoctor(async ({ supabase, request }) => {
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "open";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 100, 1), 200);
  if (!["open", "completed", "cancelled", "all"].includes(status)) {
    throw new ApiError("`status` must be `open`, `completed`, `cancelled`, or `all`.");
  }

  const { data, error } = await callWorkflow<FollowUpRow[]>(supabase, "list_follow_ups", {
    p_status: status,
    p_limit: limit,
  });
  if (error) {
    console.error("[follow-ups/list] workflow failed", error);
    throw new ApiError("Could not load follow-ups.", 500);
  }

  return NextResponse.json({ followUps: data ?? [], status, limit });
});

/** POST /api/follow-ups — schedule a recall item for an existing patient. */
export const POST = withDoctor(async ({ supabase, request }) => {
  const body = await readBody<CreateFollowUpBody>(request);
  const patientId = requireUuid(body.patientId, "patientId");
  const encounterId = body.encounterId == null || body.encounterId === "" ? null : requireUuid(body.encounterId, "encounterId");
  const dueAt = requireDate(body.dueAt, "dueAt");
  const reason = requireString(body.reason, "reason");
  if (reason.length > 500) throw new ApiError("The follow-up reason is too long.");
  const notes = optionalText(body.notes, "notes", 2000);
  const idempotencyKey = optionalText(body.idempotencyKey, "idempotencyKey", 120);

  const { data, error } = await callWorkflow<FollowUpRow[]>(supabase, "create_follow_up_workflow", {
    p_patient_id: patientId,
    p_encounter_id: encounterId,
    p_due_at: dueAt.toISOString(),
    p_reason: reason,
    p_notes: notes,
    p_idempotency_key: idempotencyKey,
  });
  if (error) {
    console.error("[follow-ups/create] workflow failed", error);
    if (error.code === "P0002") throw new ApiError("Patient or encounter not found.", 404);
    if (error.code === "23514") throw new ApiError("Check the follow-up date and details.", 422);
    if (error.code === "23505") throw new ApiError("That follow-up was already created. Reload the list.", 409);
    throw new ApiError("Could not schedule this follow-up.", 500);
  }

  const followUp = data?.[0];
  if (!followUp) throw new ApiError("Could not schedule this follow-up.", 500);
  return NextResponse.json({ followUp }, { status: 201 });
});

function requireUuid(value: unknown, field: string): string {
  const parsed = requireString(value, field);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed)) {
    throw new ApiError(`\`${field}\` is invalid.`);
  }
  return parsed;
}

function requireDate(value: unknown, field: string): Date {
  const text = requireString(value, field);
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new ApiError(`\`${field}\` is invalid.`);
  if (date.getTime() < Date.now() - 86_400_000) throw new ApiError("A follow-up cannot be scheduled in the past.");
  return date;
}

function optionalText(value: unknown, field: string, max: number): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new ApiError(`\`${field}\` must be text.`);
  const text = value.trim();
  if (text.length > max) throw new ApiError(`\`${field}\` is too long.`);
  return text || null;
}
