import type { Page, Route } from "playwright/test";

import type { Extraction } from "@/lib/llm/schema";

/**
 * The dictation pipeline with its two paid engines replaced, and — far more
 * importantly — with its write to the patient register replaced.
 *
 * `E2E_DOCTOR_EMAIL` is a real doctor on a real clinic. `searchRegister` is
 * scoped to that doctor, and a committed encounter is not deletable by design:
 * `DELETE /api/encounters/[id]` refuses a committed visit, amendments are
 * append-only, and `account_entries.encounter_id` is `on delete set null`, so
 * even a direct row delete would leave a headless entry in the clinic's
 * ledger. There is therefore no "commit it and clean up afterwards" available
 * to this suite, and a test that files a fictional patient into a working
 * clinical register would be a defect no assertion could justify. So the
 * commit request is intercepted here: the browser issues exactly the request
 * it would issue in production, the suite reads it, and nothing reaches the
 * database.
 *
 * Everything upstream of these four routes stays real — the dock, the
 * permission prompt, `getUserMedia`, the MediaRecorder blob, the phase machine,
 * the review sheet's own state, dismissal, focus. What is stubbed is the
 * network, and the request bodies captured here are how the tests check that
 * the real code produced the right one.
 */

/**
 * The name the fictional visit is filed under.
 *
 * Deliberately not a plausible patient. Nothing in this suite can reach the
 * register (see above), but if that ever stopped being true, a row named
 * "Sunita Devi" would be indistinguishable from a real chart and would be
 * treated as one; this name identifies itself on sight. It is also what the
 * register guard searches for, and a real name would make that search
 * meaningless.
 */
export const MOCK_PATIENT_NAME = "E2E Test Patient";

/** The words the transcript route "heard". Code-mixed, as this clinic's are. */
export const MOCK_TRANSCRIPT =
  `${MOCK_PATIENT_NAME}, umar bayalis saal. Acute pharyngitis with low grade fever. ` +
  "Tablet Azithromycin 500 mg once daily for three days, aur Paracetamol 650 mg twice daily. " +
  "Consultation five hundred rupees.";

/**
 * The structured draft the review sheet renders.
 *
 * `uncertain_fields` is empty and both frequencies are ones `normaliseFrequency`
 * resolves ("once daily" -> OD, "twice daily" -> BD). That combination is what
 * makes `buildReviewChecklist` return nothing, which is what leaves Confirm
 * enabled — the sheet disables it while `pendingReviewCount > 0`. A test about
 * committing should not also be a test about the checklist.
 */
export const MOCK_EXTRACTION: Extraction = {
  patient_name: MOCK_PATIENT_NAME,
  age_years: 42,
  diagnosis: "Acute pharyngitis with low-grade fever",
  treatment: "Warm saline gargles, oral fluids, review in three days if fever persists",
  consultation_fee_inr: 500,
  // One resolvable tooth, so the procedure path is exercised without adding a
  // checklist item — this fixture's whole point is that Confirm stays enabled.
  procedures: [
    {
      procedure_name: "Scaling and polishing",
      tooth_spoken: null,
      surfaces_spoken: null,
      sitting_spoken: null,
      note: null,
    },
  ],
  tooth_findings: [
    {
      finding: "periapical",
      tooth_spoken: "36",
      surfaces_spoken: null,
      state: "existing",
      severity: null,
      note: "Irreversible pulpitis",
    },
  ],
  prescription: [
    {
      drug_name: "Azithromycin",
      strength: "500 mg",
      form: "tab",
      frequency_spoken: "once daily",
      duration: "3 days",
      instructions: "after food",
    },
    {
      drug_name: "Paracetamol",
      strength: "650 mg",
      form: "tab",
      frequency_spoken: "twice daily",
      duration: "3 days",
      instructions: null,
    },
  ],
  uncertain_fields: [],
  notes_for_doctor: null,
};

/** What the review sheet sends to the commit route, as the tests read it. */
export interface CommitRequest {
  encounterId: string;
  patientId?: string;
  newPatient?: {
    full_name?: string;
    phone?: string | null;
    age_years?: number | null;
    sex?: string | null;
  };
  idempotencyKey?: string;
  consultationFeeInr?: number | null;
}

/**
 * Every request the pipeline made, in order.
 *
 * `commits` is the one that matters. Several tests assert it is still empty,
 * and "empty" is only meaningful because these arrays are the complete record
 * of what the browser sent — a request that reached the server instead of a
 * stub would have been a request the register saw.
 */
export interface DictationTraffic {
  /** Byte length of each multipart body POSTed to the transcribe route. */
  uploadBytes: number[];
  /** Bodies POSTed to `/api/encounters/<id>/commit`. */
  commits: CommitRequest[];
  /** Bodies PATCHed to `/api/drafts/<id>`, i.e. autosaves and the pre-commit save. */
  draftSaves: Record<string, unknown>[];
  /** Encounter ids DELETEd from `/api/drafts/<id>`. */
  draftDeletes: string[];
}

/**
 * Fixed ids, and the second reason nothing here can reach the register.
 *
 * `/api/encounters/extract` is the only thing that creates an encounter row,
 * and it is stubbed — so this id names a row that has never existed. Even if a
 * stub were removed and a commit reached the server, `commit_encounter` would
 * find no draft under it and refuse. There is no configuration of this file in
 * which a register entry gets created, which is a stronger guarantee than
 * cleaning up after one.
 *
 * Fixed rather than generated so a failure names something recognisable.
 */
export const MOCK_ENCOUNTER_ID = "e2e00000-0000-4000-8000-000000000001";
const TRANSCRIPT_ID = "e2e00000-0000-4000-8000-000000000002";
const PATIENT_ID = "e2e00000-0000-4000-8000-000000000003";

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

/** `/api/encounters/<id>/commit` -> the id, so the sheet can verify its own draft. */
function encounterIdFrom(url: string): string {
  return new URL(url).pathname.split("/").at(-2) ?? MOCK_ENCOUNTER_ID;
}

/** `/api/drafts/<id>` -> the id. */
function draftIdFrom(url: string): string {
  return new URL(url).pathname.split("/").at(-1) ?? MOCK_ENCOUNTER_ID;
}

/**
 * Install the stubs on a page and return the record of what it sent.
 *
 * Call before navigating: `page.route` only intercepts requests made after it
 * is registered, and the dashboard is capable of issuing a draft request during
 * hydration.
 */
export async function stubDictation(page: Page): Promise<DictationTraffic> {
  const traffic: DictationTraffic = {
    uploadBytes: [],
    commits: [],
    draftSaves: [],
    draftDeletes: [],
  };

  // The audio really was recorded and really was uploaded; only the provider
  // behind this route is missing. Recording the body length is what lets a test
  // prove the fake microphone produced sound rather than an empty blob — the
  // app's own 1KB floor would have failed the capture before this point, but
  // that check lives in the code under test, so the suite measures it too.
  await page.route("**/api/encounters/transcribe", async (route) => {
    traffic.uploadBytes.push(route.request().postDataBuffer()?.byteLength ?? 0);
    await json(route, {
      transcriptId: TRANSCRIPT_ID,
      text: MOCK_TRANSCRIPT,
      romanText: null,
      languageCode: "hi-IN",
      provider: "mock",
      degraded: false,
      durationMs: 2000,
    });
  });

  // `kind: "dictation"` rather than `"question"`: the classifier's other branch
  // routes to recall and never reaches a review sheet.
  await page.route("**/api/encounters/extract", (route) =>
    json(route, {
      kind: "dictation",
      encounterId: MOCK_ENCOUNTER_ID,
      extraction: MOCK_EXTRACTION,
      warnings: [],
      // Empty, so the sheet opens on "add as a new chart" rather than on a
      // list of candidates. It also means no test can select a real patient by
      // accident and put their id in a commit body.
      suggestedPatients: [],
      provisional: false,
      usage: null,
    }),
  );

  // The sheet re-runs this on mount from the spoken name. Answering with the
  // same empty list keeps it on the new-chart branch it started on.
  await page.route("**/api/patients/match*", (route) => json(route, { matches: [] }));

  await page.route("**/api/drafts/*", async (route) => {
    const request = route.request();

    if (request.method() === "PATCH") {
      traffic.draftSaves.push((request.postDataJSON() ?? {}) as Record<string, unknown>);
      // The queue reads `version` back and sends it as `expectedVersion` next
      // time, so this has to advance or the second autosave looks like a
      // conflict to the code under test.
      const sent = Number((request.postDataJSON() as { expectedVersion?: number })?.expectedVersion);
      return json(route, { ok: true, version: (Number.isInteger(sent) ? sent : 1) + 1 });
    }

    if (request.method() === "DELETE") {
      traffic.draftDeletes.push(draftIdFrom(request.url()));
      return json(route, { ok: true });
    }

    // GET (open a draft from the register) and POST (restore a discarded one)
    // are not part of this flow and are left to the real app.
    return route.fallback();
  });

  // The line this suite exists to keep on the right side of. Nothing past here.
  await page.route("**/api/encounters/*/commit", (route) => {
    const encounterId = encounterIdFrom(route.request().url());
    traffic.commits.push({
      encounterId,
      ...((route.request().postDataJSON() ?? {}) as Omit<CommitRequest, "encounterId">),
    });
    // `parseCommitOutcome` rejects a reply whose encounter is not the draft's,
    // so the id is echoed rather than fixed.
    return json(route, {
      encounterId,
      patientId: PATIENT_ID,
      visitNumber: 1,
      isNewPatient: true,
      alreadyCommitted: false,
      accountEntryId: null,
      accountEntryError: false,
    });
  });

  return traffic;
}
