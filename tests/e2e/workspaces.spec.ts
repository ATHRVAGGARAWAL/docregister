import { recordConsole } from "./fixtures/console-log";
import { authRequirement, expect, test } from "./fixtures/signed-in";
import { currentWorkspace, WORKSPACES } from "./fixtures/workspaces";

/**
 * Every workspace opens from its own URL, and opens quietly.
 *
 * A doctor reaches this app from a bookmark, a restored tab or a link a
 * colleague sent — never from a fresh click through the nav. That path is the
 * one that has broken repeatedly: the directory rendering "0 patients" for a
 * clinic with 46 charts because only a click loaded the list, and the server
 * rendering Overview for every URL so React discarded the whole tree on
 * arrival. Both were invisible to the unit suite and obvious the moment
 * something actually opened the page.
 */

const auth = authRequirement();
test.skip(!auth.ready, auth.reason);

test.describe("workspace deep links", () => {
  for (const workspace of WORKSPACES) {
    test(`?view=${workspace.view} opens ${workspace.nav} with a clean console`, async ({ page }) => {
      const log = recordConsole(page);

      await page.goto(`/?view=${workspace.view}`);

      // Still here: `proxy.ts` bounces an unauthenticated document request to
      // /login, so a session that failed to install shows up as a passing-
      // looking blank page rather than as an auth error.
      await expect(page).toHaveURL(new RegExp(`[?&]view=${workspace.view}(&|$)`));

      await expect(currentWorkspace(page)).toHaveText(workspace.nav);
      await expect(page.getByRole("heading", { name: workspace.heading })).toBeVisible();

      // The workspaces fetch their own data after hydration. Judging the
      // console before those requests land would pass over exactly the
      // failures worth catching.
      await page.waitForLoadState("networkidle");

      expect(
        log.hydration,
        "React discarded the server-rendered tree and re-rendered from scratch",
      ).toEqual([]);
      expect(log.errors, "the browser console must be empty on a healthy page").toEqual([]);
    });
  }
});

test.describe("the first paint already carries the deep-linked workspace", () => {
  // With scripting off there is no client left to correct the server, so what
  // these locators see is exactly what came down the wire. That is the only way
  // to distinguish "the server rendered the right workspace" from "the server
  // rendered Overview and React swapped it in a frame" — the second one is a
  // hydration mismatch, and it is what `parseDashboardUrlState` exists to stop.
  test.use({ javaScriptEnabled: false });

  for (const workspace of WORKSPACES) {
    test(`?view=${workspace.view} is server-rendered as ${workspace.nav}`, async ({ page }) => {
      await page.goto(`/?view=${workspace.view}`);
      await expect(currentWorkspace(page)).toHaveText(workspace.nav);
    });
  }
});

test("an unknown ?view= falls back to the overview rather than rendering nothing", async ({
  page,
}) => {
  await page.goto("/?view=not-a-workspace");
  await expect(currentWorkspace(page)).toHaveText("Overview");
});
