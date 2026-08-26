import type { Page, Response } from "playwright/test";

import { authRequirement, expect, test } from "./fixtures/signed-in";

/**
 * Account settings: what the doctor's own record does when saving works, and —
 * mostly — what it does when saving does not.
 *
 * This form is the only place in the app that writes the name and registration
 * number printed on a patient's record, so a save that silently fails is a
 * record that goes out wrong. The shipped bug this guards was narrower and
 * worse than a plain failure: the response was parsed before it was known to be
 * JSON, so a proxy's HTML 502 rejected inside `.json()` and the doctor was told
 * "Unexpected token '<'" — a sentence that names no problem and suggests no
 * action — while the branch that would have said "this did not save" never ran.
 *
 * Every failure case here is served by an intercepted route, so those tests
 * never reach the real profile at all. The one test that does save for real
 * changes a single field and puts it back in a `finally`.
 */

const auth = authRequirement();
test.skip(!auth.ready, auth.reason);

/** The "Clinical profile" card: the three fields, the notice, and Save. */
function profileCard(page: Page) {
  return page.locator('[data-slot="card"]').filter({ hasText: "Clinical profile" });
}

/**
 * The save notice. Scoped to the profile card because the clinic-members card
 * on this same screen raises alerts of its own, and a test that accepted any of
 * them would pass on somebody else's error message.
 */
function notice(page: Page) {
  return profileCard(page).getByRole("alert");
}

function saveButton(page: Page) {
  return profileCard(page).getByRole("button", { name: "Save changes" });
}

function specialityField(page: Page) {
  return profileCard(page).getByLabel("Speciality");
}

function profileSaved(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/profile" && response.request().method() === "PATCH",
  );
}

async function openSettings(page: Page) {
  await page.goto("/?view=settings");
  await expect(page.getByRole("heading", { name: "Account & settings" })).toBeVisible();
  await expect(saveButton(page)).toBeVisible();
}

/** Answer the next save with `body`, without it ever reaching the database. */
async function stubSave(
  page: Page,
  body: { status: number; contentType: string; payload: string; delayMs?: number },
) {
  await page.route(
    (url) => url.pathname === "/api/profile",
    async (route) => {
      if (body.delayMs) await new Promise((resolve) => setTimeout(resolve, body.delayMs));
      await route.fulfill({
        status: body.status,
        contentType: body.contentType,
        body: body.payload,
      });
    },
  );
}

test("the form arrives filled in, labelled, and previewing what is typed", async ({ page }) => {
  await openSettings(page);

  // `getByLabel` only resolves through a real label association, so finding the
  // three fields this way is itself the assertion that they are labelled — a
  // screen reader announcing "edit text" three times is unusable.
  const name = profileCard(page).getByLabel("Full name");
  const registration = profileCard(page).getByLabel("Medical registration number");
  await expect(name).toBeVisible();
  await expect(specialityField(page)).toBeVisible();
  await expect(registration).toBeVisible();

  const original = await name.inputValue();
  expect(original.trim(), "the doctor's own name did not arrive in the form").not.toBe("");

  // The identity card beside the form is a preview, not a copy of the saved
  // record: it has to follow the field, or a doctor correcting a misspelling
  // sees the old spelling still sitting next to it and saves twice.
  await expect(page.getByRole("heading", { level: 2, name: original })).toBeVisible();
  await name.fill("Dr Preview Check");
  await expect(page.getByRole("heading", { level: 2, name: "Dr Preview Check" })).toBeVisible();

  // Put it back: nothing here was saved, and the next test starts from a fresh
  // page anyway, but a dirty form is a `beforeunload` waiting to happen.
  await name.fill(original);
  await expect(page.getByRole("heading", { level: 2, name: original })).toBeVisible();
});

test("a save with no name is refused before it is sent", async ({ page }) => {
  await openSettings(page);
  const name = profileCard(page).getByLabel("Full name");
  const original = await name.inputValue();

  // An unnamed doctor is a prescription signed by nobody. The route rejects it
  // too, but the doctor should never get far enough to be told.
  await name.fill("   ");
  await expect(saveButton(page)).toBeDisabled();
  await name.fill(original);
  await expect(saveButton(page)).toBeEnabled();
});

test("an HTML error page is reported as a failed save, not as a parser complaint", async ({
  page,
}) => {
  await openSettings(page);
  // What a proxy or load balancer returns when the app itself never answered.
  await stubSave(page, {
    status: 502,
    contentType: "text/html",
    payload: "<!DOCTYPE html><html><head><title>502 Bad Gateway</title></head><body>502</body></html>",
  });

  await specialityField(page).fill("Cardiology");
  await saveButton(page).click();

  await expect(notice(page)).toBeVisible();
  await expect(notice(page)).toContainText("Couldn’t save");
  await expect(notice(page)).toContainText("Could not update your profile.");

  // The whole point of the guard: none of the response's own vocabulary reaches
  // the doctor, and neither does the parser's.
  const text = await notice(page).innerText();
  expect(text).not.toMatch(/Unexpected token|JSON|<!DOCTYPE|Bad Gateway|502/i);
});

test("a rejected save repeats the server's reason and keeps the edit on screen", async ({
  page,
}) => {
  await openSettings(page);
  await stubSave(page, {
    status: 400,
    contentType: "application/json",
    payload: JSON.stringify({ error: "`speciality` must be 100 characters or fewer." }),
  });

  await specialityField(page).fill("Paediatric cardiology");
  await saveButton(page).click();

  // The server's own sentence, because it is the only thing that says which
  // field to fix. A generic "could not save" here would send the doctor back
  // through three fields guessing.
  await expect(notice(page)).toContainText("`speciality` must be 100 characters or fewer.");

  // A failed save must not quietly reset the form. Retyping an edit the app
  // threw away is how a doctor ends up saving the old value by accident.
  await expect(specialityField(page)).toHaveValue("Paediatric cardiology");
  await expect(saveButton(page), "a failed save has to be retryable").toBeEnabled();
});

test("a save that never reaches the server still ends in a visible failure", async ({ page }) => {
  await openSettings(page);
  await page.route((url) => url.pathname === "/api/profile", (route) => route.abort("failed"));

  await specialityField(page).fill("Dermatology");
  await saveButton(page).click();

  // Silence is the dangerous outcome here: a doctor who sees nothing happen
  // assumes the save went through. The notice is a live region, so it is
  // announced rather than only drawn.
  await expect(notice(page)).toBeVisible();
  await expect(notice(page)).toContainText("Couldn’t save");
  await expect(saveButton(page)).toBeEnabled();
});

test("the save button reports that it is working and refuses a second press", async ({ page }) => {
  await openSettings(page);
  await stubSave(page, {
    status: 500,
    contentType: "application/json",
    payload: JSON.stringify({ error: "Could not update your profile." }),
    delayMs: 1_500,
  });

  await specialityField(page).fill("Endocrinology");
  await saveButton(page).click();

  // A live PATCH is not idempotent from the doctor's side — two presses on a
  // slow connection is two writes, and the second one races the first.
  await expect(saveButton(page)).toBeDisabled();
  await expect(notice(page)).toBeVisible();
  await expect(saveButton(page)).toBeEnabled();
});

test("leaving settings mid-edit asks before throwing the edit away", async ({ page }) => {
  await openSettings(page);
  const original = await specialityField(page).inputValue();
  await specialityField(page).fill(`${original} unsaved`.trim());

  // Switching workspace is a client-side transition, so the browser never sees
  // it and nothing warns by default. A doctor editing their registration number
  // between patients is precisely the person who gets interrupted.
  const asked: string[] = [];
  page.on("dialog", (dialog) => {
    asked.push(dialog.message());
    void dialog.dismiss();
  });

  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Register" })
    .click();

  await expect
    .poll(() => asked)
    .toEqual(["You have unsaved changes to your profile. Leave without saving?"]);

  // Dismissed means stay, and staying has to mean the edit is still there.
  await expect(page.getByRole("heading", { name: "Account & settings" })).toBeVisible();
  await expect(specialityField(page)).toHaveValue(`${original} unsaved`.trim());

  await specialityField(page).fill(original);
});

test("dictation languages report their own state, and the last one cannot be turned off", async ({
  page,
}) => {
  await openSettings(page);
  const voice = page.locator('[data-slot="card"]').filter({ hasText: "Dictation languages" });
  const toggles = voice.getByRole("switch");
  await expect(toggles).toHaveCount(3);

  const checked: number[] = [];
  for (let index = 0; index < 3; index += 1) {
    if ((await toggles.nth(index).getAttribute("aria-checked")) === "true") checked.push(index);
  }
  expect(checked.length, "the doctor has no dictation language at all").toBeGreaterThan(0);

  // Turn off everything but the first, purely in local state — nothing is saved
  // by this test, so the doctor's stored languages are never touched.
  for (const index of checked.slice(1)) {
    await toggles.nth(index).click();
    await expect(toggles.nth(index)).toHaveAttribute("aria-checked", "false");
  }

  // Dictation with no language is a recorder that cannot transcribe. The server
  // rejects it, but that message was unreachable while this control silently
  // did nothing, so the button now says why it will not move.
  const last = toggles.nth(checked[0]);
  await expect(last).toHaveAttribute("aria-checked", "true");
  await expect(last).toBeDisabled();
  await expect(last).toHaveAttribute("title", "Dictation needs at least one language.");
  await expect(notice(page), "toggling a switch must not save anything").toHaveCount(0);

  for (const index of checked.slice(1)) {
    await toggles.nth(index).click();
    await expect(toggles.nth(index)).toHaveAttribute("aria-checked", "true");
  }
  await expect(last).toBeEnabled();
});

test("an edit survives a round trip through the real server", async ({ page }) => {
  await openSettings(page);
  const original = await specialityField(page).inputValue();
  // Short enough for the route's 100-character limit whatever the doctor's own
  // speciality is, and obvious in the record if this ever fails to clean up.
  const probe = "E2E round trip probe";

  try {
    await specialityField(page).fill(probe);
    const saved = profileSaved(page);
    await saveButton(page).click();
    expect((await saved).status()).toBe(200);
    await expect(notice(page)).toContainText("Profile and dictation preferences updated.");

    // Reloaded rather than trusted: the success notice is drawn from the
    // response the browser holds, so it would look identical if the write had
    // never landed. Only a fresh server render proves it did.
    await openSettings(page);
    await expect(specialityField(page)).toHaveValue(probe);
  } finally {
    // Restores the doctor's real record whether the assertions above passed or
    // failed, and asserts the restore so a silent half-cleanup cannot happen.
    await openSettings(page);
    await specialityField(page).fill(original);
    const restored = profileSaved(page);
    await saveButton(page).click();
    expect((await restored).status()).toBe(200);
    await openSettings(page);
    await expect(specialityField(page)).toHaveValue(original);
  }
});
