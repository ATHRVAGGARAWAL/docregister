import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /auth/callback?code=…&next=…
 *
 * Where the magic link lands. Supabase uses PKCE, so the link carries a
 * one-time code that has to be exchanged for a session server-side; the cookies
 * that exchange sets are what `proxy.ts` refreshes on every later navigation.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  // Only ever redirect to a path on this origin. An open redirect here would
  // be a phishing primitive aimed at doctors ("your register needs re-login").
  const destination = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", url.origin));
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/login?error=expired_link", url.origin));
  }

  return NextResponse.redirect(new URL(destination, url.origin));
}
