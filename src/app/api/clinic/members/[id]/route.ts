import { NextResponse } from "next/server";

import { ApiError, withDoctor } from "@/lib/api/http";

/**
 * Admit or turn away a pending member.
 *
 * Both call a SECURITY DEFINER function that re-checks the caller is an active
 * owner of that member's clinic. That check is deliberately in the database
 * rather than here: this route is one caller, and PostgREST exposes the same
 * RPCs directly, so a check that only existed in TypeScript would be one that
 * anyone could route around.
 */
type Params = { id: string };

export const POST = withDoctor<Params>(async ({ supabase, params }) => {
  const { data, error } = await supabase.rpc("approve_clinic_member", {
    p_doctor_id: params.id,
  });

  if (error) {
    // `insufficient_privilege` is the function refusing, which is a legitimate
    // answer. Anything else is ours, and should not be dressed up as one.
    if (error.code === "42501") {
      throw new ApiError("Only a clinic owner can approve a member.", 403);
    }
    console.error("[clinic/members] approve failed", error.code);
    throw new ApiError("Could not approve that member. Try again.", 500);
  }

  return NextResponse.json({ member: data });
}, { rateLimit: "commit" });

export const DELETE = withDoctor<Params>(async ({ supabase, params }) => {
  const { error } = await supabase.rpc("decline_clinic_member", {
    p_doctor_id: params.id,
  });

  if (error) {
    if (error.code === "42501") {
      throw new ApiError("Only a clinic owner can decline a request.", 403);
    }
    console.error("[clinic/members] decline failed", error.code);
    throw new ApiError("Could not decline that request. Try again.", 500);
  }

  return NextResponse.json({ ok: true });
}, { rateLimit: "commit" });
