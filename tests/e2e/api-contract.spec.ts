import { expect, test, type APIResponse } from "playwright/test";

/**
 * `/api` answers in JSON, always — including when it is saying no.
 *
 * This is the contract behind a bug that reached a doctor: an expired session
 * turned `fetch("/api/encounters/transcribe")` into a 307 to /login, `fetch`
 * followed it without a word, and the capture flow parsed the login page's HTML
 * as a transcript. It read as a consultation that recorded nothing. Two things
 * keep that from recurring — `proxy.ts` never redirects an `/api` path, and the
 * `[...unmatched]` route answers unknown paths in the same shape — and both of
 * them are invisible to a unit test, because the failure was produced by the
 * middleware and the router, not by any function under test.
 *
 * Deliberately unauthenticated: these are assertions about the surface a
 * browser hits when the session is *gone*, which is the state that produced the
 * bug. Nothing here needs Supabase credentials, so it runs on every clone.
 */

/** Anything that looks like an internal identifier rather than an instruction. */
const LEAKED_INTERNALS = /PGRST|postgres|supabase|<!DOCTYPE|stack trace|at \w+ \(/i;

async function expectJsonError(response: APIResponse, status: number) {
  expect(response.status(), await describeUnexpected(response)).toBe(status);

  // A 3xx is the specific failure mode this guards: `fetch` follows one
  // silently, so the caller never sees a status it could branch on. Note this
  // has to exclude the 3xx band specifically — `toBeLessThan(300)` would also
  // reject the 401 and 404 these tests exist to assert.
  expect(
    response.status() >= 300 && response.status() < 400,
    "an /api response must never be a redirect",
  ).toBe(false);

  expect(response.headers()["content-type"] ?? "").toContain("application/json");

  const body = await response.text();
  const payload = JSON.parse(body) as { error?: unknown };

  expect(typeof payload.error, "every /api failure carries a doctor-readable `error`").toBe(
    "string",
  );
  const message = payload.error as string;
  expect(message.length).toBeGreaterThan(0);
  expect(message, "a doctor must never be shown a raw provider or database string").not.toMatch(
    LEAKED_INTERNALS,
  );
}

/** Enough of the body to see *what* came back when it was not what we wanted. */
async function describeUnexpected(response: APIResponse) {
  return `${response.status()} ${response.headers()["content-type"] ?? "(no content-type)"}: ${(
    await response.text()
  ).slice(0, 200)}`;
}

test.describe("the /api surface is JSON even when it refuses", () => {
  test("an unauthenticated read is a JSON 401, not the login page", async ({ request }) => {
    const response = await request.get("/api/patients", { maxRedirects: 0 });
    await expectJsonError(response, 401);
  });

  test("an unauthenticated transcription upload is a JSON 401", async ({ request }) => {
    // The exact route whose HTML redirect was read as an empty transcript.
    const response = await request.post("/api/encounters/transcribe", {
      maxRedirects: 0,
      multipart: { audio: { name: "clip.webm", mimeType: "audio/webm", buffer: Buffer.from([]) } },
    });
    await expectJsonError(response, 401);
  });

  test("a path no route claims is a JSON 404", async ({ request }) => {
    const response = await request.get("/api/there-is-no-such-endpoint", { maxRedirects: 0 });
    await expectJsonError(response, 404);
  });

  test("a write to a path no route claims is also a JSON 404", async ({ request }) => {
    // A POST is the one that matters: `/api/drafts` exists only as
    // `/api/drafts/[id]`, so a client that forgets the id writes to a path
    // that Next would otherwise answer with an HTML error page.
    const response = await request.post("/api/there-is-no-such-endpoint", {
      maxRedirects: 0,
      data: {},
    });
    await expectJsonError(response, 404);
  });

  test("the liveness endpoint answers without a session", async ({ request }) => {
    const response = await request.get("/api/health", { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"] ?? "").toContain("application/json");
    expect(((await response.json()) as { status?: string }).status).toBe("ok");
  });
});
