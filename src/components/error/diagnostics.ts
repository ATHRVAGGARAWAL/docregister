/**
 * The reference code a doctor reads out, and the console line it has to match.
 *
 * A doctor is never shown a stack trace, so the only thing tying "the screen
 * broke during the 3pm clinic" to anything greppable is a short code that is on
 * the screen *and* in the log. Both come from here so the two cannot drift.
 *
 * No `"use client"` of its own: `useErrorDiagnostic` is a hook, so this module
 * only ever joins the client graph of whichever boundary imports it.
 */

import { useEffect, useState } from "react";

/**
 * Crockford's base32 alphabet — no I, L, O or U — so a code survives being
 * read down a clinic phone line without "was that a one or an ell". Rendered
 * in `.tnum`, which is monospaced, so 0 and O stay distinguishable too.
 */
const READABLE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * A correlation handle, not a credential: it authorises nothing and guards
 * nothing, so `Math.random` is sufficient — and unlike `crypto.randomUUID` it
 * is present in an insecure context, which is exactly the degraded situation a
 * boundary has to keep working in.
 */
export function createDiagnosticId(): string {
  let code = "";
  for (let index = 0; index < 8; index += 1) {
    code += READABLE_ALPHABET[Math.floor(Math.random() * READABLE_ALPHABET.length)];
  }

  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/**
 * Next's boundaries type the caught value as `unknown` and its source notes it
 * does not guarantee an `Error`, so a thrown string or a rejected `null`
 * reaches a fallback intact. Reading `.digest` off one of those must not be
 * the thing that breaks the error screen.
 */
function digestOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;

  const { digest } = error as { digest?: unknown };
  return typeof digest === "string" && digest.length > 0 ? digest : null;
}

/**
 * Resolves the code shown to the doctor and logs the raw failure exactly once.
 *
 * Server errors arrive with `digest`, the hash Next has already written to the
 * server log; reusing it verbatim is what lets a support call jump straight to
 * that line, so it is never reformatted. Anything thrown in the browser has no
 * digest and gets a generated code instead — which is only useful because the
 * `console.error` below carries the same code.
 */
export function useErrorDiagnostic(scope: string, error: unknown): string {
  const [generatedId] = useState(createDiagnosticId);
  const diagnosticId = digestOf(error) ?? generatedId;

  useEffect(() => {
    // The one place the raw value is allowed out of a boundary. Everything the
    // doctor sees is written by hand; this is written for whoever is on call.
    console.error(`[boundary:${scope}] ${diagnosticId}`, error);
  }, [scope, diagnosticId, error]);

  return diagnosticId;
}
