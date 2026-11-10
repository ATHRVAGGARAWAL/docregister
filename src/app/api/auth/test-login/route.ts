import { NextResponse } from "next/server";

/** Retired: test access codes must never bypass Clerk authentication. */
export function POST() {
  return NextResponse.json({ error: "Sign in with Clerk to continue." }, {
    status: 410, headers: { "Cache-Control": "no-store" },
  });
}
