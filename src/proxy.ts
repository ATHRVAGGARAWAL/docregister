import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { buildCsp, securityHeaders } from "@/lib/security/headers";

/**
 * Next 16 renamed middleware to **proxy**: the file is `proxy.ts`, the export is
 * `proxy`, and the edge runtime is no longer supported here — this always runs
 * on Node. Writing this as `middleware.ts` would simply never execute, which is
 * a silent failure mode worth knowing about, because the app would still build
 * and every route would quietly be unauthenticated.
 *
 * Three jobs, in this order:
 *
 *  1. Mint a per-request CSP nonce. It has to happen before anything renders,
 *     because Next reads the nonce out of the request's own CSP header while
 *     server-rendering and stamps it onto every script tag it emits.
 *  2. Refresh the Supabase session. Access tokens are short-lived; without a
 *     refresh on each navigation a doctor gets signed out mid-clinic.
 *  3. Bounce unauthenticated *document* requests to /login before a Server
 *     Component can start rendering patient data. Data requests are left alone
 *     — see the `isApi` note below.
 */
export async function proxy(request: NextRequest) {
  const dev = process.env.NODE_ENV === "development";

  // Fresh per request. A nonce reused across responses is just a very long
  // 'unsafe-inline'.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, { dev });

  // The request headers are how the nonce reaches the renderer. Setting it only
  // on the response would protect nothing: React would emit un-nonced script
  // tags and the browser would refuse to run its own framework bundle.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const withRequestHeaders = { request: { headers: requestHeaders } };
  let response = NextResponse.next(withRequestHeaders);
  const { pathname } = request.nextUrl;

  // Uptime checks must still answer when the authentication provider is the
  // thing that is down. The route itself returns no privileged information,
  // and it still receives the same CSP and security headers as every response.
  if (pathname === "/api/health") {
    return decorate(response, { csp, dev, authenticated: false });
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write to both the request (so the same pass sees the fresh token)
          // and the response (so the browser keeps it).
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next(withRequestHeaders);
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Must be getUser(), not getSession(). getSession() reads the cookie without
  // verifying its signature, so a forged cookie would pass. getUser() checks
  // with the auth server.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico";

  // /api is not public — every route under it goes through `withDoctor`, which
  // answers an unauthenticated call with 401 `{"error":"Sign in to continue."}`
  // — but it must never be *redirected*. `fetch` follows a 307 silently, so an
  // expired session turned `fetch("/api/encounters/transcribe")` into a 200
  // carrying the login page's HTML; the client's `readJson` then parsed nothing
  // out of it and carried on with an empty transcript instead of telling the
  // doctor to sign in. Letting the request reach its route means the browser
  // gets the failure shape every client handler here is written against. The
  // session refresh above still runs for these requests, which is what keeps a
  // long dictation from expiring mid-upload.
  const isApi = pathname.startsWith("/api");

  if (!user && !isPublic && !isApi) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Send them back where they were headed once they sign in.
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return decorate(NextResponse.redirect(url), { csp, dev, authenticated: false });
  }

  if (user && pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return decorate(NextResponse.redirect(url), { csp, dev, authenticated: true });
  }

  return decorate(response, { csp, dev, authenticated: Boolean(user) });
}

/**
 * Attach the header set to whichever response we ended up with.
 *
 * Applied to redirects as well as to rendered pages. A redirect is still a
 * document the browser will act on, and it is the response an unauthenticated
 * attacker sees most often.
 */
function decorate(
  response: NextResponse,
  { csp, dev, authenticated }: { csp: string; dev: boolean; authenticated: boolean },
): NextResponse {
  response.headers.set("Content-Security-Policy", csp);
  for (const [key, value] of Object.entries(securityHeaders({ dev }))) {
    response.headers.set(key, value);
  }

  // Anything rendered for a signed-in doctor contains patient data. Clinic
  // computers are shared and the back button is a real disclosure path, so
  // these responses are never written to disk and never served from cache
  // after sign-out.
  if (authenticated) {
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  }

  return response;
}

export const config = {
  // Skip static assets and the audio worklet — running an auth round trip for
  // every icon is pure latency.
  //
  // `.webmanifest` is here for a stronger reason than latency: a browser fetches
  // the manifest to decide whether the app is installable, and it does that
  // without credentials. Bounced to /login it parses as HTML, so installation
  // silently never becomes available — no error, just an "Add to home screen"
  // that is permanently absent.
  matcher: [
    "/((?!_next/static|_next/image|worklets|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?|webmanifest)$).*)",
  ],
};
