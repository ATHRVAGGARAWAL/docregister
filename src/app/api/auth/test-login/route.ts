import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { matchesTestAccessCode, normalizeTestEmail, testEmailAllowlist } from "@/lib/auth/test-access";
import { env } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

const NO_STORE = { "Cache-Control": "no-store" };

interface TestLoginBody {
  email?: unknown;
  accessCode?: unknown;
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

/**
 * POST /api/auth/test-login
 *
 * Mints and redeems a Supabase magic link without sending an email. This is
 * intentionally available in production only when both server-side test-auth
 * variables are configured. The email allowlist limits which identities can
 * be assumed; the high-entropy access code is the credential that proves the
 * caller is allowed to use the shortcut.
 */
export async function POST(request: Request) {
  const allowedEmails = testEmailAllowlist(process.env.TEST_AUTH_BYPASS_EMAILS);
  const expectedCode = process.env.TEST_AUTH_ACCESS_CODE;
  if (allowedEmails.size === 0 || !expectedCode || expectedCode.length < 24) {
    return jsonError("No such endpoint.", 404);
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return jsonError("Test access was denied.", 403);
  }

  let body: TestLoginBody;
  try {
    body = (await request.json()) as TestLoginBody;
  } catch {
    return jsonError("Enter a valid email and testing access code.", 400);
  }

  const email = normalizeTestEmail(body.email);
  const emailAllowed = email !== null && allowedEmails.has(email);
  const codeAllowed = matchesTestAccessCode(body.accessCode, expectedCode);

  // One response for either failure avoids turning this endpoint into an
  // allowlist oracle. Evaluate both checks before returning for the same reason.
  if (!emailAllowed || !codeAllowed || email === null) {
    return jsonError("That email or testing access code is not allowed.", 401);
  }

  const admin = createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error || !link.data.properties?.hashed_token) {
    return jsonError("That test account is not available in this project.", 401);
  }

  // Redeem with the publishable client. The resulting session is a normal
  // doctor session governed by RLS; the service role never reaches the cookie.
  const supabase = await getSupabaseServerClient();
  const verified = await supabase.auth.verifyOtp({
    token_hash: link.data.properties.hashed_token,
    type: "email",
  });
  if (verified.error || !verified.data.session) {
    return jsonError("Could not open the test workspace.", 500);
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
