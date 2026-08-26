import { authRequirement, expect, test } from "./fixtures/signed-in";
import type { Page } from "playwright/test";

/**
 * The patient directory, driven the way a doctor reaches it.
 *
 * Two of this workspace's shipped bugs were about a *number* rather than about
 * a list: a deep link that rendered "0 patients" over a clinic with 46 charts
 * because only a nav click ever loaded them, and a failed search that kept
 * showing the last successful total, so a lookup that never happened read as a
 * clinic that had emptied. Both are cases where the page looked fine — which is
 * why they need a browser to catch and why a component test would not have.
 */

const auth = authRequirement();
test.skip(!auth.ready, auth.reason);

/** The one line that says how many charts the doctor is looking at. */
function countChip(page: Page) {
  return page.getByText(/^(?:Showing [\d,]+ of )?[\d,]+ (?:patients?|shown)$/);
}

/** The list region, which reports its own load state through `aria-busy`. */
function directory(page: Page) {
  return page.locator("main section[aria-busy]");
}

function charts(page: Page) {
  return page.locator("main").getByRole("listitem");
}

function searchBox(page: Page) {
  return page.getByRole("textbox", { name: "Search patients" });
}

/** Whatever number the chip is currently claiming. */
async function claimedCount(page: Page): Promise<number> {
  const text = await countChip(page).innerText();
  const match = text.match(/([\d,]+) (?:patients?|shown)$/);
  expect(match, `could not read a count out of "${text}"`).not.toBeNull();
  return Number(match![1].replace(/,/g, ""));
}

/** Counts are grouped 2-2-3 for en-IN, so the expected string is built the same way. */
const grouped = (value: number) => new Intl.NumberFormat("en-IN").format(value);

/**
 * Open the directory and wait for the first list to actually be on screen.
 *
 * Getting this wait wrong is how a test misses the very bug this file is
 * about. The chip reads "0 patients" in three different states — before the
 * request is made, while it is in flight, and when the clinic really is empty —
 * and `aria-busy` is "false" in the first of those too, so neither signal alone
 * can tell them apart. Waiting for the response and then for the list to have
 * replaced its own placeholder is what distinguishes "loaded and empty" from
 * "has not looked yet".
 */
async function openDirectory(page: Page) {
  const listed = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/patients",
  );
  await page.goto("/?view=patients");
  await listed;
  await expect(page.getByText("Loading patients…")).toBeHidden();
  await expect(directory(page)).toHaveAttribute("aria-busy", "false");
}

/**
 * Type a query and wait for the answer.
 *
 * Enter rather than the 300ms debounce: the component treats it as "do not make
 * me wait", and a test that sleeps instead is a test that starts failing on a
 * slow machine.
 */
async function search(page: Page, term: string) {
  const answered = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/patients",
  );
  await searchBox(page).fill(term);
  await searchBox(page).press("Enter");
  await answered;
  await expect(directory(page)).toHaveAttribute("aria-busy", "false");
}

test("a deep link to the directory lists the clinic's charts", async ({ page }) => {
  await openDirectory(page);

  const total = await claimedCount(page);
  expect(total, "the directory loaded but reported no charts at all").toBeGreaterThan(0);

  const rows = await charts(page).count();
  expect(rows).toBeGreaterThan(0);
  expect(rows).toBeLessThanOrEqual(total);

  // "214 patients" above a list of 50 is a lie the doctor cannot see, so the
  // header has to name both numbers whenever the page is a slice of the result.
  if (rows < total) {
    await expect(countChip(page)).toHaveText(
      `Showing ${grouped(rows)} of ${grouped(total)} patients`,
    );
  }

  // The deep-link bug wore this exact sentence while the clinic had 46 charts.
  await expect(page.getByText("No patients yet")).toBeHidden();
});

test("searching narrows the directory to the chart that was asked for", async ({
  page,
  request,
}) => {
  // The name comes from the API rather than from the page, so the assertion
  // does not depend on which chart happens to sort first in the DOM.
  const directoryPage = (await (await request.get("/api/patients?limit=1")).json()) as {
    patients?: { full_name: string }[];
  };
  const name = directoryPage.patients?.[0]?.full_name;
  test.skip(!name, "this clinic has no charts to search for");

  await openDirectory(page);
  const total = await claimedCount(page);
  test.skip(total < 2, "narrowing needs at least two charts to narrow from");

  await search(page, name!);

  expect(
    await claimedCount(page),
    `searching for "${name}" returned the whole directory`,
  ).toBeLessThan(total);
  await expect(charts(page).filter({ hasText: name! }).first()).toBeVisible();
});

test("a search that matches nothing says nothing matched", async ({ page }) => {
  await openDirectory(page);

  const nonsense = "zzqqxx-not-a-patient";
  await search(page, nonsense);

  // Zero is the honest answer here, and the empty state has to be the one about
  // a search rather than the one about a clinic with no charts yet.
  await expect(page.getByText(`No patients match “${nonsense}”`)).toBeVisible();
  await expect(page.getByText("No patients yet")).toBeHidden();
  expect(await claimedCount(page)).toBe(0);
});

test("a failed search reports what is on screen, not a confident zero", async ({ page }) => {
  await openDirectory(page);
  const rowsBefore = await charts(page).count();
  expect(rowsBefore).toBeGreaterThan(0);

  // 500 rather than 401: a 401 makes the dashboard tear the session down, which
  // is a different (and correct) behaviour from the one under test.
  await page.route("**/api/patients?*", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Something went wrong on our end. Please try again." }),
    }),
  );

  await search(page, "Sun");

  // Scoped rather than bare: the page carries more than one live region, so an
  // unfiltered `getByRole("alert")` is a strict-mode violation rather than an
  // assertion about this failure.
  await expect(
    page.getByRole("alert").filter({ hasText: "Could not load the patient list" }),
  ).toBeVisible();

  // The count that survives a failure describes the rows still on screen. The
  // stale total would have said "46 patients" above an error saying the number
  // is unknown, and 0 would have said the clinic is empty. Neither happened.
  await expect(countChip(page)).toHaveText(`${grouped(rowsBefore)} shown`);
  await expect(charts(page)).toHaveCount(rowsBefore);
});
