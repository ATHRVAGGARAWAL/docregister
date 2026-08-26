import { authRequirement, expect, test } from "./fixtures/signed-in";
import { measureLayout } from "./fixtures/layout";
import { WORKSPACES } from "./fixtures/workspaces";

/**
 * Every workspace on the phone this app is actually used on.
 *
 * 393x852 is the iPhone 14/15 viewport, and it is the narrowest screen a doctor
 * here opens the register on. Both failures this file looks for are invisible
 * in a screenshot review: content pushed past the right edge is hidden by the
 * root's `overflow-x-clip` rather than made scrollable, and a control that is
 * 40px tall looks correct and simply misses the tap.
 */

const auth = authRequirement();
test.skip(!auth.ready, auth.reason);

test.use({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});

for (const workspace of WORKSPACES) {
  test(`${workspace.view} fits a phone and can be tapped`, async ({ page }) => {
    await page.goto(`/?view=${workspace.view}`);
    // Measuring before the workspace's own content has arrived measures the
    // skeleton, which fits by construction and proves nothing.
    await expect(page.getByRole("heading", { name: workspace.heading })).toBeVisible();
    await page.waitForLoadState("networkidle");

    const { overflowing, smallTargets } = await measureLayout(page);

    expect(overflowing, `wider than the 393px viewport:\n${overflowing.join("\n")}`).toEqual([]);
    expect(smallTargets, `under 44px on a side:\n${smallTargets.join("\n")}`).toEqual([]);
  });
}
