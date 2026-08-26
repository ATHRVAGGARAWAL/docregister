import os from "node:os";
import path from "node:path";

// `@next/env` is CommonJS, so the named export is only reachable through the
// default import under ESM.
import nextEnv from "@next/env";
import { defineConfig } from "playwright/test";

import { appBaseUrl } from "./tests/e2e/fixtures/app-url";

// The suite needs the same Supabase credentials the app runs on, and they live
// in `.env.local` rather than the shell. Next's own loader is used instead of
// hand-parsing so precedence matches what `next dev` sees — otherwise a test
// could sign in against a different project than the one it is driving.
nextEnv.loadEnvConfig(process.cwd());

export default defineConfig({
  testDir: "./tests/e2e",

  // Traces, screenshots and videos land outside the repository. `.gitignore`
  // does not cover Playwright's default `test-results/`, and a suite that
  // leaves a dirty tree behind is a suite people stop running before they
  // commit.
  outputDir: path.join(process.env.PLAYWRIGHT_OUTPUT_DIR ?? os.tmpdir(), "docregister-e2e"),

  // A doctor's register is shared mutable state: two workers signing in as the
  // same doctor and searching the same clinic would see each other's requests
  // and read them as their own failures. Serial is slower and honest.
  workers: 1,
  fullyParallel: false,

  // Never, including CI: a retried flake is a flake nobody looks at, and this
  // suite exists to catch exactly the intermittent hydration and load-order
  // defects a retry would paper over.
  retries: 0,

  // Refuse to pass on a suite that was committed half-focused.
  forbidOnly: Boolean(process.env.CI),

  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: appBaseUrl(),

    // Desktop is the default because the sidebar only exists above `lg`, and
    // it is where `aria-current` is actually visible. The phone-sized
    // assertions live in `mobile-layout.spec.ts`, which sets its own viewport
    // — a second project would re-run every other spec at a second width for
    // no new information.
    viewport: { width: 1280, height: 800 },

    // The app pins `Asia/Kolkata` and `en-IN` wherever it formats a date or a
    // count, so a browser in another zone would render a different day than
    // the server did — a hydration mismatch produced by the test machine
    // rather than by the app, failing `workspaces.spec.ts` for the wrong
    // reason.
    timezoneId: "Asia/Kolkata",
    locale: "en-IN",

    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  // Reuses whatever is already serving. Locally that is the `next dev` a
  // developer already has open — starting a second one would fight it for the
  // port. CI has no server yet, so it runs the built app: `next dev` there
  // would measure the dev bundle's layout and its React error overlay, neither
  // of which a doctor ever sees.
  webServer: {
    command: process.env.CI ? "npm run start" : "npm run dev:next",
    // `/api/health` rather than `/`: the root redirects an unauthenticated
    // request to /login, so it reports "up" from the moment the router is
    // listening, before the app can actually render anything.
    url: `${appBaseUrl().replace(/\/$/, "")}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
