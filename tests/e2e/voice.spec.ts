import type { Locator, Page } from "playwright/test";

import { fakeDictationWav, fakeMicrophoneArgs, MIN_DICTATION_UPLOAD_BYTES } from "./fixtures/audio";
import {
  MOCK_ENCOUNTER_ID,
  MOCK_PATIENT_NAME,
  stubDictation,
  type DictationTraffic,
} from "./fixtures/mock-mode";
import { authRequirement, expect, test } from "./fixtures/signed-in";

/**
 * The thing this app is for: speak a consultation, check it, file it.
 *
 * Every other spec here exercises a screen the doctor reaches after the work is
 * done. This one drives the work — the mic key, a real `getUserMedia` stream, a
 * real MediaRecorder blob, the capture state machine, and the review sheet that
 * stands between a recording and a permanent clinical record. The parts of that
 * chain most likely to break silently are the ones a unit test cannot reach:
 * whether the browser produced audio at all, and whether the sheet can be
 * dismissed in a way that loses a consultation the doctor has already checked.
 *
 * The two paid providers and the register write are stubbed at the network
 * boundary (`fixtures/mock-mode.ts`, which explains why). Everything in the
 * browser is the shipped code.
 */

const auth = authRequirement();
test.skip(!auth.ready, auth.reason);

test.use({
  // Per-file rather than in `playwright.config.ts`: a synthetic microphone is
  // this spec's requirement, and no other spec should silently acquire one.
  launchOptions: { args: fakeMicrophoneArgs(fakeDictationWav()) },
  permissions: ["microphone"],
});

/**
 * How long the recording is left running between the two taps.
 *
 * The key is a toggle, not a press-and-hold — one tap starts, the next stops —
 * so this is dictation time, not gesture time. Two seconds is well clear of
 * both floors that could fail a capture for a reason that is not the app's:
 * the hook's own 1KB minimum, and this suite's `MIN_DICTATION_UPLOAD_BYTES`.
 * What it actually sends is recorded there.
 */
const RECORD_MS = 2000;

const micKey = (page: Page) => page.getByRole("button", { name: "Start recording a visit" });
const stopKey = (page: Page) =>
  page.getByRole("button", { name: "Stop recording and review this visit" });
const reviewSheet = (page: Page) => page.getByRole("dialog", { name: "Review & confirm" });
const savedSheet = (page: Page) => page.getByRole("dialog", { name: "Visit saved" });

/**
 * A field in the review sheet, addressed by the name a screen reader announces.
 *
 * Not the label text. Every field in the sheet is wrapped in a `<label>` holding
 * both the caption and the control, and React renders a controlled `<textarea>`'s
 * value as a text child — so that label's text content reads
 * "DiagnosisAcute pharyngitis with low-grade fever", and changes with every
 * keystroke. The accessible name leaves the control's own value out, so it stays
 * "Diagnosis" while the doctor types: stable to assert on, and the name the field
 * genuinely has.
 */
const field = (sheet: Locator, name: string | RegExp) =>
  sheet.getByRole("textbox", { name, exact: true });

/**
 * Open the dashboard with the pipeline stubbed.
 *
 * The stubs go on before the first navigation because `page.route` only sees
 * requests made after it is registered, and the dashboard is free to talk to
 * the draft endpoints while it hydrates.
 */
async function openClinic(page: Page): Promise<DictationTraffic> {
  const traffic = await stubDictation(page);
  await page.goto("/");
  await expect(micKey(page)).toBeVisible();
  return traffic;
}

/**
 * Record a visit and stop, leaving the review sheet open.
 *
 * The wait is a fixed wall-clock one, which is the right tool exactly once: the
 * quantity being simulated *is* a duration, and the audio the rest of the suite
 * depends on only exists because time passed while the recorder ran. Nothing is
 * inferred from it — that the recording was real is asserted from the bytes
 * that reached the transcribe route, not from the clock.
 */
async function dictate(page: Page) {
  await micKey(page).click();
  // The stop control appears as soon as the tap is accepted, which is before
  // `getUserMedia` has resolved. Waiting for it before starting the clock keeps
  // the permission handshake out of the recording window.
  await expect(stopKey(page)).toBeVisible();
  await page.waitForTimeout(RECORD_MS);
  await stopRecording(page);
  await expect(reviewSheet(page)).toBeVisible();
}

/**
 * Stop, and wait for the audio to have actually left the browser.
 *
 * The upload is the first thing that can fail after the gesture, and it fails
 * quietly: `useVoiceCapture` rejects a blob under 1KB as a muted microphone and
 * never calls the route at all. Waiting on the response rather than on the
 * review sheet is what separates "the recording was empty" from "the sheet did
 * not open" in a failure message.
 */
async function stopRecording(page: Page) {
  const transcribed = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/encounters/transcribe",
  );
  await stopKey(page).click();
  await transcribed;
}

test("recording a visit and stopping reaches the review sheet with real audio", async ({ page }) => {
  const traffic = await openClinic(page);

  await micKey(page).click();
  await expect(stopKey(page)).toBeVisible();
  // The idle key is gone while recording — the dock cannot offer to start a
  // second capture over the one in progress.
  await expect(micKey(page)).toBeHidden();

  await page.waitForTimeout(RECORD_MS);
  await stopRecording(page);

  // One upload, and one with something in it. A muted or absent microphone
  // yields a blob the hook rejects before this route is ever called, so an
  // empty `uploadBytes` here means the fake device never produced a stream.
  expect(traffic.uploadBytes, "the recording never reached the transcribe route").toHaveLength(1);
  expect(
    traffic.uploadBytes[0],
    `the microphone produced only ${traffic.uploadBytes[0]} bytes of audio`,
  ).toBeGreaterThan(MIN_DICTATION_UPLOAD_BYTES);

  await expect(reviewSheet(page)).toBeVisible();
  // Not a claim about the dock: at phase "review" it still renders the idle key
  // (voice-dock.tsx computes `busy` from "transcribing"|"extracting" only). What
  // is asserted here is the sheet's modality — Radix Dialog calls `hideOthers`,
  // so everything outside it leaves the accessibility tree. That is the property
  // worth pinning: a doctor tabbing through the review sheet cannot fall out of
  // it into a control that would start a second recording over the visit they
  // have not confirmed yet.
  await expect(micKey(page)).toBeHidden();
});

test("the review sheet shows what was dictated and files nothing on its own", async ({ page }) => {
  const traffic = await openClinic(page);
  await dictate(page);

  const sheet = reviewSheet(page);
  await expect(field(sheet, "Patient")).toHaveValue(MOCK_PATIENT_NAME);
  await expect(field(sheet, "Age")).toHaveValue("42");
  await expect(field(sheet, "Diagnosis")).toHaveValue(
    "Acute pharyngitis with low-grade fever",
  );
  // The rupee sign sits inside the label next to the box, so it is part of
  // this field's name rather than decoration drawn on the box.
  await expect(field(sheet, /^Amount/)).toHaveValue("500");
  await expect(field(sheet, "Drug name").first()).toHaveValue("Azithromycin");
  await expect(field(sheet, "Drug name").nth(1)).toHaveValue("Paracetamol");

  // The sheet says out loud what the assertion below checks: reaching this
  // screen is not the same as being in the register.
  await expect(sheet.getByText("Not saved yet")).toBeVisible();

  // Settled, not merely rendered: the patient lookup has answered and the
  // footer is offering to save. Asserting "no commit" before the sheet has
  // finished its own work would pass for the wrong reason.
  await expect(sheet.getByRole("button", { name: "Confirm & save" })).toBeEnabled();
  expect(traffic.commits, "the review sheet committed a visit nobody confirmed").toHaveLength(0);
});

test("confirming files the visit the doctor reviewed, not the one the model produced", async ({
  page,
  request,
}) => {
  const traffic = await openClinic(page);
  await dictate(page);

  const sheet = reviewSheet(page);
  // The correction is the point of the screen. A commit that carried 42 would
  // mean the doctor's review changed nothing.
  await field(sheet, "Age").fill("43");

  await sheet.getByRole("button", { name: "Confirm & save" }).click();
  await expect(savedSheet(page)).toBeVisible();

  expect(traffic.commits, "confirming did not file the visit exactly once").toHaveLength(1);
  const commit = traffic.commits[0];
  expect(commit.encounterId).toBe(MOCK_ENCOUNTER_ID);
  expect(commit.newPatient?.full_name).toBe(MOCK_PATIENT_NAME);
  expect(commit.newPatient?.age_years).toBe(43);
  expect(commit.consultationFeeInr).toBe(500);
  // Without this the doctor's second tap on a slow connection is a second visit.
  expect(commit.idempotencyKey, "the commit carried no idempotency key").toBeTruthy();

  // The register is read for real here — the `request` fixture shares the
  // doctor's session but not the page's routes, so this is the live clinic
  // answering. It is a check on the suite rather than on the app: if any of
  // the stubs above ever stops matching, this is what says so.
  const registerResponse = await request.get(
    `/api/register?status=committed&days=1&q=${encodeURIComponent(MOCK_PATIENT_NAME)}`,
  );

  // A 429 is "could not check", not "the visit leaked", and the difference
  // matters because this guard shares the signed-in doctor's real hourly
  // `match` budget — 240 requests, which a few full runs of this suite plus a
  // working day will exhaust between them. Failing the test on an inconclusive
  // check trains people to ignore a red suite, and this assertion exists
  // precisely so that it is believed when it does fire.
  //
  // The proper fix is a dedicated end-to-end doctor, since the bucket key is
  // per-doctor. Until that exists, say so out loud rather than failing.
  if (registerResponse.status() === 429) {
    test.info().annotations.push({
      type: "skipped-check",
      description:
        "The register guard was rate limited, so this run did not confirm the visit stayed " +
        "out of the register. The commit assertions above still hold.",
    });
    return;
  }

  expect(registerResponse.ok()).toBe(true);
  const register = (await registerResponse.json()) as { totalCount: number };
  expect(register.totalCount, "the e2e visit reached the doctor's real register").toBe(0);
});

test("discarding a reviewed visit removes the draft and files nothing", async ({ page }) => {
  const traffic = await openClinic(page);
  await dictate(page);

  await reviewSheet(page).getByRole("button", { name: "Discard" }).click();

  await expect(reviewSheet(page)).toBeHidden();
  expect(traffic.draftDeletes).toEqual([MOCK_ENCOUNTER_ID]);
  expect(traffic.commits, "discarding filed the visit anyway").toHaveLength(0);
});

test("Escape on an edited visit asks before throwing it away", async ({ page }) => {
  const traffic = await openClinic(page);
  await dictate(page);

  const prompts: string[] = [];
  let answer: "accept" | "dismiss" = "dismiss";
  page.on("dialog", async (dialog) => {
    prompts.push(dialog.message());
    if (answer === "accept") await dialog.accept();
    else await dialog.dismiss();
  });

  const sheet = reviewSheet(page);
  // A correction the doctor has made by hand. Escape may discard an untouched
  // extraction without asking; this is the state where it must not.
  await field(sheet, "Diagnosis").fill("Acute tonsillitis");

  await page.keyboard.press("Escape");

  expect(prompts, "Escape closed an edited visit without asking").toHaveLength(1);
  expect(prompts[0]).toContain("Discard this visit?");

  // Answering "no" has to leave the doctor exactly where they were, with the
  // edit intact — a sheet that closes anyway loses the consultation.
  await expect(sheet).toBeVisible();
  await expect(field(sheet, "Diagnosis")).toHaveValue("Acute tonsillitis");
  expect(traffic.draftDeletes).toHaveLength(0);
  expect(traffic.commits).toHaveLength(0);

  // And answering "yes" is the discard the doctor asked for, not a commit.
  answer = "accept";
  const askedBefore = prompts.length;
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  // That it asked is the property under test; how many times is not pinned.
  // Accepting currently raises two prompts rather than one — `onEscapeKeyDown`
  // asks, and the close it then allows fires `onOpenChange(false)`, whose
  // handler asks a second time before calling `onDiscard`. That is a wart in
  // the safe direction, and pinning the count here would turn fixing it into a
  // failing test.
  expect(prompts.length, "accepting closed the sheet without asking").toBeGreaterThan(askedBefore);
  expect(new Set(prompts.slice(askedBefore)), "asked something other than the discard question").toEqual(
    new Set([prompts[0]]),
  );

  // Discarded exactly once, and filed not at all.
  expect(traffic.draftDeletes).toEqual([MOCK_ENCOUNTER_ID]);
  expect(traffic.commits).toHaveLength(0);
});

test("a tap outside the review sheet does not dismiss it", async ({ page }) => {
  const traffic = await openClinic(page);
  await dictate(page);

  // A phone in a coat pocket and a doctor reaching past the screen produce this
  // gesture by accident, and there is no undo behind it — the draft is deleted.
  // So unlike Escape it does not even ask; it does nothing.
  const dismissed: string[] = [];
  page.on("dialog", async (dialog) => {
    dismissed.push(dialog.message());
    await dialog.dismiss();
  });

  await page.mouse.click(8, 8);

  await expect(reviewSheet(page)).toBeVisible();
  expect(dismissed, "an outside tap asked about discarding a visit nobody was closing").toHaveLength(0);
  expect(traffic.draftDeletes).toHaveLength(0);
  expect(traffic.commits).toHaveLength(0);
});
