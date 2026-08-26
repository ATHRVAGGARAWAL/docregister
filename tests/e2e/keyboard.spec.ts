import type { Page } from "playwright/test";

import { authRequirement, expect, test } from "./fixtures/signed-in";
import { currentWorkspace } from "./fixtures/workspaces";

/**
 * The navigation, driven with nothing but a keyboard.
 *
 * Two kinds of doctor need this and neither shows up in a screenshot: the one
 * using a screen reader, and the one with a hand on a patient who is tabbing
 * with the other. Both fail the same way — a control that focus never reaches,
 * a focus ring that is drawn nowhere, or a menu that swallows the Tab key and
 * will not give it back. WCAG 2.1.2 calls the last one a keyboard trap and it
 * is the one bug on this list a mouse user will never report, because for them
 * the app is fine.
 *
 * Which workspace each URL opens is `workspaces.spec.ts`'s job. This file only
 * cares that the keyboard can get there, can see where it is, and can leave.
 */

const auth = authRequirement();
test.skip(!auth.ready, auth.reason);

const NAV = 'nav[aria-label="Primary navigation"]';

/** The sidebar's seven items, in the order they are drawn. */
const WORKSPACE_LABELS = [
  "Overview",
  "Register",
  "Patients",
  "Recall",
  "Follow-ups",
  "Accounts",
  "Settings",
];

interface FocusStop {
  /** Stable per-element handle, so "did Tab actually move" is answerable. */
  id: string | null;
  label: string;
  inNav: boolean;
  inDialog: boolean;
  /** Chromium's own answer to "should this element be drawing a focus ring". */
  focusVisible: boolean;
  /** Everything that could be drawing one, as one comparable string. */
  ring: string;
}

/**
 * Give every element an identity that survives a Tab.
 *
 * A trap is not "focus stopped moving" — inside one, Tab still cycles. It is
 * "focus never reaches the rest of the page", and telling those apart needs the
 * stops to be comparable to each other rather than just to their own labels.
 * Two nav items would otherwise be indistinguishable from the same one twice.
 */
async function tagFocusStops(page: Page) {
  await page.evaluate(() => {
    let next = 0;
    for (const element of document.querySelectorAll("*")) {
      element.setAttribute("data-kbd-stop", String(next));
      next += 1;
    }
  });
}

async function focusStop(page: Page): Promise<FocusStop> {
  return page.evaluate((nav) => {
    const element = document.activeElement as HTMLElement | null;
    if (!element || element === document.body || element === document.documentElement) {
      return { id: null, label: "", inNav: false, inDialog: false, focusVisible: false, ring: "" };
    }
    const style = getComputedStyle(element);
    const label =
      element.getAttribute("aria-label") ?? (element.innerText || element.textContent || "");
    return {
      id: element.getAttribute("data-kbd-stop"),
      label: label.trim().replace(/\s+/g, " "),
      inNav: Boolean(element.closest(nav)),
      inDialog: Boolean(element.closest('[role="dialog"]')),
      // `:focus-visible` is the browser's own judgement, which is the one the
      // stylesheet keys off. Asserting the class list instead would pass on a
      // rule that never matches.
      focusVisible: element.matches(":focus-visible"),
      ring: `${style.outline} / ${style.outlineWidth} / ${style.boxShadow}`,
    };
  }, NAV);
}

/** Tab until `done` is true, or give up and say how far it got. */
async function tabUntil(
  page: Page,
  done: (stop: FocusStop) => boolean,
  { limit = 80, shift = false } = {},
): Promise<{ stops: FocusStop[]; found: boolean }> {
  const stops: FocusStop[] = [];
  for (let press = 0; press < limit; press += 1) {
    await page.keyboard.press(shift ? "Shift+Tab" : "Tab");
    const stop = await focusStop(page);
    stops.push(stop);
    if (done(stop)) return { stops, found: true };
  }
  return { stops, found: false };
}

async function tabIntoNav(page: Page): Promise<FocusStop> {
  await tagFocusStops(page);
  const { stops, found } = await tabUntil(page, (stop) => stop.inNav);
  expect(
    found,
    `Tab never reached the navigation in ${stops.length} presses; it stopped on ` +
      `${stops.map((stop) => stop.label || "(unlabelled)").slice(-8).join(" → ")}`,
  ).toBe(true);
  return stops[stops.length - 1];
}

/** The nav item labels a keyboard user meets, starting from the one in focus. */
async function walkNav(page: Page, from: FocusStop): Promise<FocusStop[]> {
  const stops = [from];
  for (let press = 1; press < WORKSPACE_LABELS.length; press += 1) {
    await page.keyboard.press("Tab");
    stops.push(await focusStop(page));
  }
  return stops;
}

test("Tab walks the whole sidebar, in the order it is drawn", async ({ page }) => {
  await page.goto("/?view=overview");
  await expect(currentWorkspace(page)).toHaveText("Overview");

  const first = await tabIntoNav(page);
  const stops = await walkNav(page, first);

  // Reading order and focus order have to agree. When they diverge, a screen
  // reader user builds a mental map of the sidebar that the keyboard then
  // contradicts, and there is nothing on screen to explain the difference.
  expect(stops.map((stop) => stop.label)).toEqual(WORKSPACE_LABELS);
  expect(
    new Set(stops.map((stop) => stop.id)).size,
    "Tab visited the same control twice inside the navigation",
  ).toBe(WORKSPACE_LABELS.length);
});

test("every nav item shows the keyboard where it is", async ({ page }) => {
  await page.goto("/?view=overview");
  await expect(currentWorkspace(page)).toHaveText("Overview");

  // Measured at rest first, per item: the open workspace is drawn differently
  // from the other six, so one shared "unfocused" value would be wrong for it.
  const items = page.locator(NAV).getByRole("button");
  await expect(items).toHaveCount(WORKSPACE_LABELS.length);
  const resting = await items.evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      return `${style.outline} / ${style.outlineWidth} / ${style.boxShadow}`;
    }),
  );

  const stops = await walkNav(page, await tabIntoNav(page));

  for (const [index, stop] of stops.entries()) {
    expect(stop.focusVisible, `${stop.label} does not match :focus-visible when tabbed to`).toBe(
      true,
    );
    // The indicator is a ring drawn as a box-shadow, and the rule that draws it
    // also removes the default outline. If both ended up empty the item would
    // be focused with nothing to show for it — invisible focus is the failure
    // mode, not a missing class name.
    expect(stop.ring, `${stop.label} draws nothing while focused`).not.toBe(resting[index]);
    expect(stop.ring, `${stop.label} has neither an outline nor a ring`).not.toMatch(
      /^none \/ 0px \/ none$/,
    );
  }
});

test("Enter and Space open the workspace the keyboard is on", async ({ page }) => {
  await page.goto("/?view=overview");
  await expect(currentWorkspace(page)).toHaveText("Overview");

  const stops = await walkNav(page, await tabIntoNav(page));
  const accounts = stops.findIndex((stop) => stop.label === "Accounts");
  const settings = stops.findIndex((stop) => stop.label === "Settings");
  expect(accounts).toBeGreaterThanOrEqual(0);

  // Tab back from Settings — the walk ends on the last item — and press Enter
  // on Accounts.
  for (let press = 0; press < stops.length - 1 - accounts; press += 1) {
    await page.keyboard.press("Shift+Tab");
  }
  expect((await focusStop(page)).label).toBe("Accounts");
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { name: "Accounts", exact: true })).toBeVisible();
  await expect(currentWorkspace(page)).toHaveText("Accounts");
  // Focus has to stay on the item that was just activated. Losing it here sends
  // a keyboard user back to the top of the document after every move.
  expect((await focusStop(page)).label).toBe("Accounts");

  // Space is the other key a native button answers to, and a `div` wearing
  // `role="button"` would answer only to Enter.
  for (let press = 0; press < settings - accounts; press += 1) {
    await page.keyboard.press("Tab");
  }
  expect((await focusStop(page)).label).toBe("Settings");
  await page.keyboard.press("Space");

  await expect(page.getByRole("heading", { name: "Account & settings" })).toBeVisible();
  await expect(currentWorkspace(page)).toHaveText("Settings");
});

test("exactly one nav item claims to be the current page", async ({ page }) => {
  await page.goto("/?view=overview");
  const marked = page.locator(`${NAV} [aria-current]`);
  await expect(marked).toHaveCount(1);
  await expect(marked).toHaveAttribute("aria-current", "page");

  const stops = await walkNav(page, await tabIntoNav(page));
  const patients = stops.findIndex((stop) => stop.label === "Patients");
  for (let press = 0; press < stops.length - 1 - patients; press += 1) {
    await page.keyboard.press("Shift+Tab");
  }
  await page.keyboard.press("Enter");

  // Two marked items is worse than none: a screen reader announces "current
  // page" twice and the doctor cannot tell which one they are looking at.
  await expect(page.getByRole("heading", { name: "Patient directory" })).toBeVisible();
  await expect(marked).toHaveCount(1);
  await expect(marked).toHaveText("Patients");
});

test("the navigation can be left in both directions", async ({ page }) => {
  await page.goto("/?view=overview");
  await expect(currentWorkspace(page)).toHaveText("Overview");

  const entry = await tabIntoNav(page);
  const stops = await walkNav(page, entry);

  // Forward, off the end of the nav. Landing on nothing — focus dropped to the
  // document — is as broken as being held inside, because the next Tab restarts
  // the whole page.
  await page.keyboard.press("Tab");
  const after = await focusStop(page);
  expect(after.inNav, "Tab could not leave the navigation").toBe(false);
  expect(after.id, "focus fell out of the document instead of moving on").not.toBeNull();

  // Backward, all the way through and out the front.
  for (let press = 0; press < WORKSPACE_LABELS.length; press += 1) {
    await page.keyboard.press("Shift+Tab");
  }
  expect((await focusStop(page)).id).toBe(stops[0].id);
  await page.keyboard.press("Shift+Tab");
  const before = await focusStop(page);
  expect(before.inNav, "Shift+Tab could not leave the navigation").toBe(false);
});

test("Tab never gets stuck anywhere on the dashboard", async ({ page }) => {
  await page.goto("/?view=overview");
  await expect(currentWorkspace(page)).toHaveText("Overview");
  // Settled first: a control that arrives mid-walk would look like focus
  // jumping backwards.
  await page.waitForLoadState("networkidle");
  await tagFocusStops(page);

  const seen: FocusStop[] = [];
  let wrapped = false;
  for (let press = 0; press < 200; press += 1) {
    await page.keyboard.press("Tab");
    const stop = await focusStop(page);
    // Focus leaving the document for the browser's own chrome is the end of the
    // page's tab ring, not a dead end.
    if (stop.id === null) {
      wrapped = true;
      break;
    }
    if (seen.length > 0 && stop.id === seen[0].id) {
      wrapped = true;
      break;
    }
    expect(
      stop.id,
      `Tab did not move: focus stayed on "${stop.label || "(unlabelled)"}"`,
    ).not.toBe(seen[seen.length - 1]?.id);
    seen.push(stop);
  }

  expect(
    wrapped,
    `focus was still circling after 200 presses among ${new Set(seen.map((stop) => stop.id)).size} controls`,
  ).toBe(true);
  expect(
    seen.some((stop) => stop.inNav),
    "the walk never reached the navigation, so something before it holds focus",
  ).toBe(true);
});

/* ------------------------------------------------------------------ *
 * The phone, where the same navigation lives behind a modal.
 * ------------------------------------------------------------------ */

test.describe("the workspace menu on a phone", () => {
  test.use({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });

  /** The nav inside the sheet — the sidebar copy is still in the DOM, hidden. */
  const sheetNav = (page: Page) => page.getByRole("dialog").locator(NAV);

  async function openMenu(page: Page) {
    await tagFocusStops(page);
    const { found } = await tabUntil(page, (stop) => stop.label === "Open workspace menu");
    expect(found, "the menu button is not reachable by keyboard").toBe(true);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
  }

  test("opens, holds focus while open, and gives it back on Escape", async ({ page }) => {
    await page.goto("/?view=overview");
    await expect(page.getByRole("banner").or(page.locator("header")).first()).toBeVisible();
    await openMenu(page);

    // Focus has to move into the menu. Left behind it, a screen reader user
    // hears nothing change and keeps reading the page underneath.
    await expect
      .poll(async () => (await focusStop(page)).inDialog, {
        message: "focus stayed outside the menu that just opened",
      })
      .toBe(true);

    // A modal holding Tab is correct — that is what makes the page behind it
    // unreachable while it is open. The contract is that Escape always lets go.
    const { stops } = await tabUntil(page, () => false, { limit: 16 });
    expect(
      stops.filter((stop) => !stop.inDialog).map((stop) => stop.label || "(unlabelled)"),
      "Tab escaped the open menu into the page behind it",
    ).toEqual([]);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();

    // Escape without a focus handover leaves a keyboard user at the top of the
    // document, having to walk back to where they already were.
    await expect
      .poll(async () => (await focusStop(page)).label, {
        message: "focus did not return to the button that opened the menu",
      })
      .toBe("Open workspace menu");
  });

  test("opens a workspace from the keyboard and closes behind itself", async ({ page }) => {
    await page.goto("/?view=overview");
    await openMenu(page);

    const { found } = await tabUntil(page, (stop) => stop.label === "Accounts", { limit: 16 });
    expect(found, "the workspace list is not reachable inside the menu").toBe(true);
    await page.keyboard.press("Enter");

    // Both halves matter: the workspace opens, and the menu that covered it
    // gets out of the way without a second key press.
    await expect(page.getByRole("heading", { name: "Accounts", exact: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("works the same with motion turned down", async ({ page }) => {
    // The sheet's open and close states are animated. A doctor who has asked
    // the operating system for less motion must still be able to work the menu:
    // a transition that never runs must not leave it half-mounted, and the
    // close must not wait on an animation end that never arrives.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?view=accounts");
    await openMenu(page);

    await expect(sheetNav(page).locator("[aria-current]")).toHaveText("Accounts");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });
});
