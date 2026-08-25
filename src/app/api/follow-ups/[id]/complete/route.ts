import { NextResponse } from "next/server";

import { ApiError, readBody, withDoctor } from "@/lib/api/http";
import { callWorkflow } from "@/lib/supabase/workflows";

type Params = { id: string };

interface CompleteBody {
  completionNotes?: unknown;
}

interface FollowUpRow {
  id: string;
  status: "open" | "completed" | "cancelled";
  [key: string]: unknown;
}

/** POST /api/follow-ups/[id]/complete */
export const POST = withDoctor<Params>(async ({ supabase, request, params }) => {
  if (!isUuid(params.id)) throw new ApiError("Follow-up id is invalid.");
  const body = await readBody<CompleteBody>(request);
  const completionNotes = optionalText(body.completionNotes, 2000);

  const { data, error } = await callWorkflow<FollowUpRow[]>(supabase, "complete_follow_up_workflow", {
    p_follow_up_id: params.id,
    p_completion_notes: completionNotes,
  });
  if (error) {
    console.error("[follow-ups/complete] workflow failed", error);
    if (error.code === "P0002") throw new ApiError("Follow-up not found.", 404);
    if (error.code === "23514") throw new ApiError("This follow-up cannot be completed.", 409);
    throw new ApiError("Could not complete this follow-up.", 500);
  }
  const followUp = data?.[0];
  if (!followUp) throw new ApiError("Could not complete this follow-up.", 500);
  return NextResponse.json({ followUp });
});

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function optionalText(value: unknown, max: number): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new ApiError("Completion notes must be text.");
  const text = value.trim();
  if (text.length > max) throw new ApiError("Completion notes are too long.");
  return text || null;
}
