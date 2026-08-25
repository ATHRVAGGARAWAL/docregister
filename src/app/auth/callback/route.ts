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

  const destination = safeDestination(next, url.origin);

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

/**
 * Resolve `next` to a path on this origin, or fall back to "/".
 *
 * Checking the string for a leading "//" is not enough, and the version of this
 * that did was a live open redirect. WHATWG URL treats a backslash as a
 * separator for special schemes and strips leading control characters, so
 * "/\\evil.com" and "/\tevil.com" both survive a `startsWith("//")` test and
 * then resolve to https://evil.com. That is the exact phishing primitive this
 * guard exists to stop — and it lands *after* the session exchange, so the
 * doctor arrives at the attacker's page already signed in.
 *
 * Resolving against the real origin and comparing the result is the only check
 * that does not have to anticipate the parser's quirks one at a time.
 */
function safeDestination(next: string, origin: string): string {
  try {
    const resolved = new URL(next, origin);
    if (resolved.origin !== origin) return "/";
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return "/";
  }
}
