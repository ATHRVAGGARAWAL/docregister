import { authRequirement, expect, test } from "./fixtures/signed-in";

/**
 * What a doctor sees when the clinic's connection drops mid-consultation.
 *
 * The hook this covers reads `navigator.onLine`, which cannot be tested without
 * a browser — there is no DOM test environment in this repo and adding one would
 * mean mocking the exact thing under test. Playwright drives the real event
 * path instead: `context.setOffline` flips the browser's own connectivity, so
 * the `offline` and `online` events fire the way they do on a phone leaving a
 * building.
 *
 * The property that matters is not the banner. It is that the microphone stays
 * usable: MediaRecorder is entirely local, so a doctor mid-consultation must
 * still be able to capture what is being said even though it cannot be filed
 * yet. A dead button would lose the consultation; a banner loses nothing.
 */
const auth = authRequirement();
test.skip(!auth.ready, auth.reason);

test.use({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });

const micKey = (page: import("playwright/test").Page) =>
  page.getByRole("button", { name: "Start recording a visit" });

test("going offline says so without taking the microphone away", async ({ page, context }) => {
  await page.goto("/");
  await expect(micKey(page)).toBeVisible();

  await context.setOffline(true);
  // The notice is driven by a window event, not a poll, so it lands on the next
  // tick rather than after a timeout.
  await expect(page.getByText(/offline|no connection|cannot be filed/i).first()).toBeVisible({
    timeout: 10_000,
  });

  // The whole point: still recordable.
  await expect(micKey(page)).toBeVisible();
  await expect(micKey(page)).toBeEnabled();

  await context.setOffline(false);
  await expect(page.getByText(/offline|no connection|cannot be filed/i)).toHaveCount(0, {
    timeout: 10_000,
  });
});

test("the notice clears itself when the connection returns", async ({ page, context }) => {
  await page.goto("/");
  await expect(micKey(page)).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByText(/offline|no connection|cannot be filed/i).first()).toBeVisible({
    timeout: 10_000,
  });

  await context.setOffline(false);
  // `navigator.onLine` going true proves an interface exists, not that anything
  // is reachable — which is why the hook documents that asymmetry and why the
  // app offers a retry rather than sending on its own. What is asserted here is
  // only that the app stops claiming to be offline.
  await expect(micKey(page)).toBeEnabled();
  await expect(page.getByText(/offline|no connection|cannot be filed/i)).toHaveCount(0, {
    timeout: 10_000,
  });
});
