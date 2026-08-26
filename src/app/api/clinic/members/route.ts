import { NextResponse } from "next/server";

import { withDoctor } from "@/lib/api/http";

/**
 * Who is in this clinic, and who is waiting at the door.
 *
 * No owner check on the read. Every doctor already sees their colleagues —
 * `doctors_read` is `clinic_id = auth_clinic_id()` and has been since the first
 * migration — so gating this would hide something the database already shares,
 * while doing nothing about the rows themselves. The privileged part is
 * admitting someone, and that check lives in `approve_clinic_member`, where it
 * cannot be skipped by calling PostgREST directly.
 */
export const GET = withDoctor(async ({ supabase }) => {
  const { data, error } = await supabase
    .from("doctors")
    .select("id, full_name, role, membership_status, requested_at, approved_at, speciality")
    .order("membership_status", { ascending: true })
    .order("requested_at", { ascending: false });

  if (error) {
    console.error("[clinic/members]", error.code);
    // An empty list would read as "you have no colleagues", which is a
    // different and load-bearing claim — it is the screen an owner uses to
    // decide whether a join request exists at all.
    return NextResponse.json({ error: "Could not load your clinic members." }, { status: 500 });
  }

  const members = data ?? [];
  return NextResponse.json({
    members,
    pendingCount: members.filter((m) => m.membership_status === "pending").length,
  });
}, { rateLimit: "match" });
