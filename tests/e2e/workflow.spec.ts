import type { Page } from "playwright/test";
import { authRequirement, expect, test } from "./fixtures/signed-in";
import { clinicDay, clinicDayWindow } from "../../src/lib/workspace";
import type { RegisterEntry } from "../../src/lib/types";

const auth = authRequirement();
test.skip(!auth.ready, auth.reason);
const PATIENT = {
  id: "e2e00000-0000-4000-8000-000000000002",
  full_name: "Workflow Test Patient",
  phone: "9876543210",
  age_years: 42,
  visit_count: 3,
  last_visit: "2026-08-01T09:00:00+05:30",
};
const ENTRY: RegisterEntry = {
  id: "e2e00000-0000-4000-8000-000000000003",
  occurred_at: "2026-08-01T09:00:00+05:30",
  patient_name: PATIENT.full_name,
  patient_id: null,
  age_years: 42,
  diagnosis: "Test assessment",
  treatment: "Test care plan",
  status: "draft",
  visit_number: null,
  is_new_patient: null,
  drugs: [],
  procedures: [],
};
const draft = {
  encounterId: ENTRY.id,
  transcriptId: null,
  rawText: "",
  romanText: null,
  languageCode: null,
  extraction: {
    patient_name: PATIENT.full_name,
    age_years: 42,
    diagnosis: ENTRY.diagnosis,
    treatment: ENTRY.treatment,
    consultation_fee_inr: null,
    prescription: [],
    procedures: [],
    tooth_findings: [],
    uncertain_fields: [],
    notes_for_doctor: null,
  },
  suggestedPatients: [PATIENT],
  warnings: [],
  degraded: false,
  source: "manual",
  patientIdentity: { phone: PATIENT.phone, sex: null },
};

async function mockWorkspace(page: Page) {
  const writes: { url: string; body: Record<string, unknown> }[] = [];
  await page.route("**/api/appointments?*", (route) =>
    route.fulfill({
      json: { appointments: [], operatories: [], clinicians: [] },
    }),
  );
  await page.route("**/api/follow-ups?*", (route) =>
    route.fulfill({ json: { followUps: [] } }),
  );
  await page.route("**/api/register?*", (route) =>
    route.fulfill({
      json: {
        entries: [ENTRY],
        totalCount: 1,
        draftCount: 1,
        committedCount: 0,
        discardedCount: 0,
      },
    }),
  );
  await page.route("**/api/patients?*", (route) =>
    route.fulfill({ json: { patients: [PATIENT], totalCount: 1 } }),
  );
  await page.route("**/api/patients", (route) =>
    route.fulfill({ json: { patients: [PATIENT], totalCount: 1 } }),
  );
  await page.route("**/api/patients/match?*", (route) =>
    route.fulfill({ json: { matches: [PATIENT] } }),
  );
  await page.route(`**/api/patients/${PATIENT.id}/history`, (route) =>
    route.fulfill({
      json: {
        patient: {
          ...PATIENT,
          sex: null,
          abha_id: null,
          notes: null,
          first_seen_at: PATIENT.last_visit,
        },
        encounters: [],
        toothProcedures: [],
      },
    }),
  );
  await page.route(`**/api/patients/${PATIENT.id}/clinical`, (route) =>
    route.fulfill({ json: { alerts: [], medicalHistory: [], findings: [] } }),
  );
  await page.route(`**/api/patients/${PATIENT.id}/consents`, (route) =>
    route.fulfill({ json: { consents: [], templates: [] } }),
  );
  await page.route("**/api/procedures*", (route) =>
    route.fulfill({ json: { procedures: [] } }),
  );
  await page.route("**/api/drafts/*", (route) => {
    const request = route.request();
    if (request.method() === "GET") return route.fulfill({ json: draft });
    writes.push({
      url: request.url(),
      body: request.method() === "DELETE" ? {} : request.postDataJSON(),
    });
    return route.fulfill({
      json: {
        ok: true,
        version: Number(request.postDataJSON()?.expectedVersion ?? 1) + 1,
      },
    });
  });
  await page.route("**/api/encounters/manual", (route) => {
    writes.push({
      url: route.request().url(),
      body: route.request().postDataJSON(),
    });
    return route.fulfill({ json: draft });
  });
  await page.route("**/api/encounters/*/commit", (route) => {
    writes.push({
      url: route.request().url(),
      body: route.request().postDataJSON(),
    });
    return route.fulfill({
      json: {
        encounterId: ENTRY.id,
        patientId: PATIENT.id,
        visitNumber: 4,
        isNewPatient: false,
        alreadyCommitted: false,
        accountEntryId: null,
        accountEntryError: false,
      },
    });
  });
  return writes;
}

const nav = (page: Page) => page.locator(".clinical-sidebar");

test("Today stays scoped to today after searching historical register entries", async ({
  page,
}) => {
  await mockWorkspace(page);
  await page.goto("/");
  const recent = page.getByRole("region", { name: "Recent visits" });
  const before = await recent.textContent();
  await nav(page)
    .getByRole("button", { name: "Register", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Patient register", exact: true }),
  ).toBeVisible();
  await nav(page).getByRole("button", { name: "Today", exact: true }).click();
  await expect(recent).toHaveText(before!);
  await expect(recent.getByText(PATIENT.full_name)).toHaveCount(0);
});

test("an unlinked draft opens directly for review from Today", async ({
  page,
}) => {
  await mockWorkspace(page);
  await page.goto("/");
  await page
    .getByRole("region", { name: "Needs attention" })
    .getByRole("button", { name: /Workflow Test Patient.*Review/ })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Review & confirm" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Patient", exact: true }),
  ).toHaveValue(PATIENT.full_name);
});

test("review queue keeps its year range after a reload", async ({ page }) => {
  await mockWorkspace(page);
  await page.goto("/");
  await page.getByRole("button", { name: /Awaiting review/ }).click();
  await expect(page).toHaveURL(/view=register.*days=365.*status=draft/);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "1 year", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("Back and Forward restore the workspace and register filters", async ({
  page,
}) => {
  await mockWorkspace(page);
  await page.goto("/?view=register&days=7&status=draft&q=Workflow");
  await nav(page)
    .getByRole("button", { name: "Patients", exact: true })
    .click();
  await expect(page).toHaveURL(/view=patients/);
  await nav(page).getByRole("button", { name: "Today", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Today", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Patient directory", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(
    /view=register.*days=7.*status=draft.*q=Workflow/,
  );
  await expect(
    page.getByRole("heading", { name: "Patient register", exact: true }),
  ).toBeVisible();
  await page.goForward();
  await expect(
    page.getByRole("heading", { name: "Patient directory", exact: true }),
  ).toBeVisible();
});

test("patient chart to new visit preserves the explicitly selected patient through commit", async ({
  page,
}) => {
  const writes = await mockWorkspace(page);
  await page.goto("/?view=patients");
  await page
    .locator("main")
    .getByRole("button", { name: /Workflow Test Patient/ })
    .click();
  await page.getByRole("button", { name: "Start visit", exact: true }).click();
  const visit = page.getByRole("dialog", { name: "New visit", exact: true });
  await expect(
    visit.getByText(PATIENT.full_name, { exact: true }),
  ).toBeVisible();
  await expect(visit.getByLabel("Diagnosis / assessment")).toBeVisible();
  await visit.getByLabel("Diagnosis / assessment").fill("Test assessment");
  await visit.getByLabel("Treatment / plan").fill("Test care plan");
  expect(writes).toHaveLength(0);
  await visit
    .getByRole("button", { name: "Review visit", exact: true })
    .click();
  const review = page.getByRole("dialog", { name: "Review & confirm" });
  await expect(review).toBeVisible();
  await expect(
    review.getByRole("radio", { name: /Workflow Test Patient/ }),
  ).toBeChecked();
  expect(writes.some((write) => write.url.endsWith("/commit"))).toBe(false);
  await review.getByRole("button", { name: "Confirm & save" }).click();
  await expect(page.getByRole("dialog", { name: "Visit saved" })).toBeVisible();
  const committed = writes.filter((write) => write.url.endsWith("/commit"));
  expect(committed).toHaveLength(1);
  expect(committed[0].body.patientId).toBe(PATIENT.id);
  expect(committed[0].body.newPatient).toBeUndefined();
});

test("unfinished manual notes survive a cancelled close and a failed draft request", async ({
  page,
}) => {
  await mockWorkspace(page);
  await page.route("**/api/encounters/manual", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Could not connect. Your notes are still here." },
    }),
  );
  await page.goto("/");
  await page
    .locator("main")
    .getByRole("button", { name: "New visit", exact: true })
    .click();
  await page.getByRole("button", { name: "New patient", exact: true }).click();
  await page.getByLabel("Patient name").fill("Workflow New Patient");
  await page.getByRole("button", { name: "Continue to note" }).click();
  await page.getByLabel("Diagnosis / assessment").fill("Keep this assessment");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Diagnosis / assessment")).toHaveValue(
    "Keep this assessment",
  );
  await page.getByRole("button", { name: "Review visit" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Your notes are still here",
  );
  await expect(page.getByLabel("Diagnosis / assessment")).toHaveValue(
    "Keep this assessment",
  );
});

test("unassigned appointments remain visible and a failed check-in explains how to retry", async ({
  page,
}) => {
  await mockWorkspace(page);
  const from = clinicDayWindow(clinicDay()).from;
  const appointment = {
    id: "e2e00000-0000-4000-8000-000000000004",
    patient_id: PATIENT.id,
    clinician_id: null,
    operatory_id: null,
    starts_at: from,
    ends_at: new Date(Date.parse(from) + 1800000).toISOString(),
    status: "confirmed",
    appointment_type: "Consultation",
    patient: PATIENT,
    clinician: null,
    operatory: null,
  };
  await page.route("**/api/appointments?*", (route) =>
    route.fulfill({
      json: {
        appointments: [appointment],
        operatories: [{ id: "chair-1", name: "Chair 1", colour: "#0046b8" }],
        clinicians: [],
      },
    }),
  );
  await page.route("**/api/appointments/*", (route) =>
    route.fulfill({
      status: 409,
      json: { error: "This appointment changed. Refresh and try again." },
    }),
  );
  await page.goto("/?view=schedule");
  await expect(
    page.getByRole("heading", { name: "Unassigned", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Check in patient" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "This appointment changed",
  );
  await expect(
    page.getByRole("button", { name: "Check in patient" }),
  ).toBeEnabled();
  await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();
});

test("a failed Today request is shown as unavailable and can be retried", async ({
  page,
}) => {
  await mockWorkspace(page);
  let unavailable = true;
  await page.route("**/api/appointments?*", (route) =>
    route.fulfill(
      unavailable
        ? { status: 503, json: { error: "Unavailable" } }
        : { json: { appointments: [], operatories: [], clinicians: [] } },
    ),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /Appointments today/ }),
  ).toContainText("Unavailable");
  const schedule = page.getByRole("region", { name: "Today’s appointments" });
  unavailable = false;
  await schedule.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(schedule.getByText("Your schedule is clear")).toBeVisible();
});

test("patient search starts a visit without re-entering demographics", async ({ page }) => {
  const writes = await mockWorkspace(page);
  await page.goto("/");
  await page.locator("main").getByRole("button", { name: "New visit", exact: true }).click();
  await page.getByLabel("Find a patient").fill("Workflow");
  await page.getByRole("dialog", { name: "New visit" }).getByRole("button", { name: /Workflow Test Patient/ }).click();
  await page.getByRole("button", { name: "Continue to note" }).click();
  await expect(page.getByLabel("Diagnosis / assessment")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "New visit" })).toContainText("Existing patient · 42 years");
  expect(writes).toHaveLength(0);
});

test("visible search can start a visit using the keyboard", async ({ page }) => {
  await mockWorkspace(page);
  await page.goto("/");
  await page.getByRole("button", { name: /Search patients, visits, tools/ }).click();
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  await palette.getByRole("combobox").fill("New visit");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "New visit", exact: true })).toBeVisible();
  await expect(page.getByLabel("Find a patient")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test.describe("small-screen visit entry", () => {
  test.use({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true });
  test("the form and its actions fit a short phone viewport", async ({ page }) => {
    await mockWorkspace(page);
    await page.goto("/");
    await page.locator(".clinical-mobile-header").getByRole("button", { name: "New visit" }).click();
    await page.getByRole("button", { name: "New patient", exact: true }).click();
    await page.getByLabel("Patient name").fill("Small Screen Test");
    await page.getByRole("button", { name: "Continue to note" }).click();
    const dialog = page.getByRole("dialog", { name: "New visit" });
    const footer = await dialog.getByRole("button", { name: "Review visit" }).boundingBox();
    expect(footer).not.toBeNull();
    expect(footer!.height).toBeGreaterThanOrEqual(44);
    expect(footer!.y + footer!.height).toBeLessThanOrEqual(640);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    await dialog.locator("summary").filter({ hasText: "Prescription" }).click();
    await expect(dialog.getByRole("button", { name: "Add medicine" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Review visit" })).toBeVisible();
  });
});

test("changing a selected patient's name cannot commit to the old chart while matching is pending", async ({ page }) => {
  const writes = await mockWorkspace(page);
  let releaseLookup!: () => void;
  const lookupGate = new Promise<void>((resolve) => { releaseLookup = resolve; });
  await page.route("**/api/patients/match?*", async (route) => {
    await lookupGate;
    await route.fulfill({ json: { matches: [] } });
  });
  await page.goto("/?view=patients");
  await page.locator("main").getByRole("button", { name: /Workflow Test Patient/ }).click();
  await page.getByRole("button", { name: "Start visit", exact: true }).click();
  await page.getByRole("button", { name: "Review visit", exact: true }).click();
  const review = page.getByRole("dialog", { name: "Review & confirm" });
  await expect(review.getByRole("radio", { name: /Workflow Test Patient/ })).toBeChecked();
  await review.getByRole("textbox", { name: "Patient", exact: true }).fill("A different patient");
  await review.getByRole("button", { name: "Confirm & save" }).click();
  await expect(review.getByRole("alert")).toContainText("Choose the patient");
  expect(writes.some((write) => write.url.endsWith("/commit"))).toBe(false);
  releaseLookup();
});
