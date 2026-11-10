import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { provisionClerkDoctor } from "@/lib/auth/clerk-doctor";
import { isSameOriginRequest } from "@/lib/auth/same-origin";

export async function POST(request: Request) {
  if (!(await auth()).isAuthenticated) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Request denied." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.fullName !== "string" || typeof body.clinicName !== "string"
    || !body.fullName.trim() || body.fullName.length > 120 || !body.clinicName.trim() || body.clinicName.length > 120) {
    return NextResponse.json({ error: "Enter your name and clinic name." }, { status: 400 });
  }
  try {
    await provisionClerkDoctor(body.clinicName, body.fullName);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not set up your clinic. Verify your email and try again." }, { status: 500 });
  }
}
