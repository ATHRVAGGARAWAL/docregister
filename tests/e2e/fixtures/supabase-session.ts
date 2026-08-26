import { createClient, type Session } from "@supabase/supabase-js";
import type { PlaywrightTestOptions } from "playwright/test";

/**
 * A signed-in doctor, without a browser ever visiting /login.
 *
 * Every workspace in this app is behind `proxy.ts`, so an unauthenticated test
 * gets a redirect to /login and nothing else. Driving the real sign-in form is
 * not an option: it is a magic link, which means a mailbox, which means the
 * suite would depend on email delivery to assert that a chart list renders.
 *
 * So the session is minted the way the auth server itself would mint it —
 * `generateLink` produces the token the emailed link would have carried,
 * `verifyOtp` redeems it — and then written into the cookie jar in exactly the
 * format `@supabase/ssr` reads. Nothing here is a test-only code path in the
 * app: the app cannot tell this session apart from one a doctor created, which
 * is the whole point. `proxy.ts` calls `getUser()`, which verifies the token
 * against the auth server, so a hand-forged cookie would not have worked here
 * even if we had tried.
 */

export type StorageState = Exclude<PlaywrightTestOptions["storageState"], undefined | string>;

interface SupabaseEnv {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  email: string;
}

function readEnv(): { env: SupabaseEnv } | { missing: string[] } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Supabase renamed the anon key to the publishable key and both names are
  // still in circulation, exactly as `src/lib/env.ts` accepts both.
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.E2E_DOCTOR_EMAIL;

  const missing: string[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!email) missing.push("E2E_DOCTOR_EMAIL");

  if (missing.length > 0) return { missing };
  return { env: { url: url!, anonKey: anonKey!, serviceRoleKey: serviceRoleKey!, email: email! } };
}

/**
 * Whether the signed-in half of the suite can run at all.
 *
 * A fork has no repository secrets and a fresh clone has no `.env.local`, and
 * in both cases the honest outcome is "not run", not "failed" — a red X nobody
 * can clear teaches contributors to ignore the check. The reason is spelled out
 * so a developer who *did* mean to run these knows precisely what to set.
 */
export function authRequirement(): { ready: boolean; reason: string } {
  const read = readEnv();
  if ("env" in read) return { ready: true, reason: "" };
  return {
    ready: false,
    reason:
      `Signed-in end-to-end tests need ${read.missing.join(", ")}. ` +
      "Set them in .env.local (E2E_DOCTOR_EMAIL is the address of a doctor that already " +
      "exists in that Supabase project) and re-run.",
  };
}

/**
 * The cookie name `@supabase/ssr` will look for.
 *
 * Derived, not configured, because it is derived on the other side too:
 * `SupabaseClient` builds `sb-${hostname.split(".")[0]}-auth-token` from the
 * project URL. Hard-coding a project ref here would work until the day someone
 * points `.env.local` at a different project, and then it would fail as
 * "redirected to /login" with nothing pointing at the cookie name.
 */
function authCookieName(supabaseUrl: string): string {
  return `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
}

/**
 * `@supabase/ssr` stores a session as `base64-<payload>` and splits it across
 * `name.0`, `name.1`, … once it exceeds `MAX_CHUNK_SIZE`, because a single
 * cookie cannot hold 4KB of JWT. Its `combineChunks` simply concatenates the
 * parts back in order, so any split at or below that size round-trips — the
 * boundaries do not have to match the ones the library would have chosen.
 */
const MAX_CHUNK_SIZE = 3180;

function sessionCookies(name: string, session: Session, appUrl: URL) {
  const encoded = `base64-${Buffer.from(JSON.stringify(session)).toString("base64")}`;

  const parts =
    encoded.length <= MAX_CHUNK_SIZE
      ? [{ name, value: encoded }]
      : Array.from({ length: Math.ceil(encoded.length / MAX_CHUNK_SIZE) }, (_unused, index) => ({
          name: `${name}.${index}`,
          value: encoded.slice(index * MAX_CHUNK_SIZE, (index + 1) * MAX_CHUNK_SIZE),
        }));

  return parts.map((part) => ({
    ...part,
    domain: appUrl.hostname,
    path: "/",
    // A session cookie. The access token inside it expires in an hour and
    // `proxy.ts` refreshes it on navigation, so an expiry here would only be a
    // second, staler clock to disagree with.
    expires: -1,
    httpOnly: false,
    // Follows the app, not the auth server: marking this Secure against a
    // http://localhost dev server means the browser holds a cookie it will
    // never send, which presents as an unexplained redirect to /login.
    secure: appUrl.protocol === "https:",
    sameSite: "Lax" as const,
  }));
}

/** Storage state for a browser context that is already signed in as the doctor. */
export async function mintDoctorSession(baseUrl: string): Promise<StorageState> {
  const read = readEnv();
  if (!("env" in read)) {
    throw new Error(authRequirement().reason);
  }
  const { url, anonKey, serviceRoleKey, email } = read.env;

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) {
    // `magiclink` never creates a user, so the overwhelmingly likely cause is
    // that this address has no account in this project — worth saying, because
    // the provider's own message for it is just "User not found".
    throw new Error(
      `Could not mint a session for ${email}: ${link.error.message}. ` +
        "E2E_DOCTOR_EMAIL must be a doctor that already exists in this Supabase project.",
    );
  }

  // Redeemed with the publishable key, not the service role key: the service
  // role bypasses RLS, and a session minted under it would let the suite see
  // rows a real doctor cannot — which is exactly the class of bug these tests
  // exist to catch.
  const anon = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const verified = await anon.auth.verifyOtp({
    token_hash: link.data.properties.hashed_token,
    type: "email",
  });
  if (verified.error || !verified.data.session) {
    throw new Error(
      `Could not redeem the sign-in link for ${email}: ${verified.error?.message ?? "no session returned"}.`,
    );
  }

  return {
    cookies: sessionCookies(authCookieName(url), verified.data.session, new URL(baseUrl)),
    origins: [],
  };
}
