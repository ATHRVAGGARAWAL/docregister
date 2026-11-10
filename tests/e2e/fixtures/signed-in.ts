import { test as base } from "playwright/test";

import { appBaseUrl } from "./app-url";
import { mintDoctorSession, type StorageState } from "./clerk-session";

export { expect } from "playwright/test";
export { authRequirement } from "./clerk-session";

/** Each worker authenticates once through Clerk, then isolates browser storage per test. */
export const test = base.extend<object, { doctorSession: StorageState }>({
  doctorSession: [
    // The empty pattern stays: Playwright reads the destructuring pattern to
    // work out a fixture's dependencies, so removing it changes behaviour.
    async ({ browser }, use) => {
      await use(await mintDoctorSession(appBaseUrl(), browser));
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
