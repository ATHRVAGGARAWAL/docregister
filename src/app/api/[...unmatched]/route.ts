import { NextResponse } from "next/server";

/**
 * A JSON 404 for any `/api` path that no route file claims.
 *
 * Without this, an unmatched API path falls through to Next's HTML error page.
 * Every client helper in this app reads `body.error` off a JSON body — `getJson`
 * in the dashboard, `readJson` in the capture hook, `errorMessage` here — so an
 * HTML 404 surfaces to a doctor as `Unexpected token '<'` rather than as
 * anything they can act on. That is the same failure this codebase has already
 * fixed twice at the call site; fixing it once at the route makes the whole
 * `/api` surface honest instead of each caller defending itself.
 *
 * App Router prefers a concrete segment over a catch-all, so this only ever
 * runs for paths that genuinely do not exist — `GET /api/drafts`, for instance,
 * where only `/api/drafts/[id]` is defined.
 *
 * Deliberately unauthenticated: it is not wrapped in `withDoctor` because the
 * existence of a route name is not privileged information, and requiring a
 * session here would answer "no such endpoint" with "sign in" — which is the
 * misleading-error problem again, one layer up.
 */
function notFound() {
  return NextResponse.json({ error: "No such endpoint." }, { status: 404 });
}

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
export const HEAD = notFound;
export const OPTIONS = notFound;
