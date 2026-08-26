import { test as base } from "playwright/test";

import { appBaseUrl } from "./app-url";
import { mintDoctorSession, type StorageState } from "./supabase-session";

export { expect } from "playwright/test";
export { authRequirement } from "./supabase-session";

/**
 * `test`, but every page and every `request` starts signed in as the doctor.
 *
 * The session is worker-scoped, so one magic link is redeemed per worker
 * process rather than one per test. Sign-in is not what any of these tests are
 * about, and Supabase's auth endpoints are rate limited — a suite that mints
 * thirty sessions to assert thirty things about the UI eventually fails on the
 * thirty-first for a reason that has nothing to do with the app.
 */
export const test = base.extend<object, { doctorSession: StorageState }>({
  doctorSession: [
    // The empty pattern stays: Playwright reads the destructuring pattern to
    // work out a fixture's dependencies, so removing it changes behaviour.
    async ({}, use) => {
      await use(await mintDoctorSession(appBaseUrl()));
    },
    { scope: "worker" },
  ],

  // Overriding the option rather than calling `context.addCookies` in each
  // test: `storageState` is also what the `request` fixture is built from, so
  // an API call from a test carries the same session the browser does.
  storageState: async ({ doctorSession }, use) => {
    await use(doctorSession);
  },
});
