# Copy audit

Every user-facing string in `src/` measured against one question: **after
reading this, does the doctor know what happened and what to do next?**

A string fails if it is vague, blames the doctor for something the software did,
leaks an implementation detail, promises something the app cannot keep, or
contradicts a sibling string describing the same fact.

This is an audit, not a patch. No component was edited — each surface is owned
by someone else. `src/lib/copy.ts` ships alongside it and holds only the strings
that are duplicated verbatim today; see [§12](#12-srclibcopyts).

---

## How this was gathered

Every string literal in `src/` reachable by a doctor: `ApiError` and `jsonError`
messages (which reach the browser verbatim — see below), `setError`/`setFailure`
fallbacks, `AlertTitle`/`AlertDescription`, button labels, `placeholder`,
`aria-label`, `sr-only` text, `window.confirm`, empty-state titles and
descriptions, and the `EmptyState` defaults.

**Server messages are doctor-facing.** This is the single most important fact
for reading the rest of this document. Every client fetch helper in the app —
`getJson` and `messageFor` in `dashboard.tsx`, `readJson` in
`use-voice-capture.ts`, `readBody` in `clinic-members.tsx` and
`patient-history-sheet.tsx`, the inline `payload.error ?? …` reads in
`review-sheet.tsx`, `accounts-workspace.tsx` and `follow-up-workspace.tsx` —
lifts `body.error` straight into an `Alert`. A backtick-wrapped parameter name
thrown in `src/app/api/` is rendered on a phone in a consulting room.

---

## Severity

| Class | Meaning |
| --- | --- |
| **P1** | The doctor cannot act on it, or it is actively false. Fix before anything cosmetic. |
| **P2** | Understandable but wrong: misattributes fault, leaks jargon, or contradicts a sibling. |
| **P3** | Consistency and voice. Worth doing in one pass, not worth a hotfix. |

---

## 1. Generic non-answers — P1

The brief asked specifically for these. The codebase has already written down
why they are unacceptable, at `src/components/error/error-screen.tsx:17-21`:

> What failed, in the doctor's words. No default — a generic title is how an
> error screen stops carrying information, and every caller knows more than
> "Something went wrong".

That standard is enforced on the full-page boundary and nowhere else. Three
strings violate it, and two of them sit on the voice path, which is the one
path in this app where the doctor has already spoken and cannot cheaply repeat
themselves.

| # | Current | Where | Defect | Proposed |
| --- | --- | --- | --- | --- |
| C1 | `Something went wrong.` | `src/hooks/use-voice-capture.ts:458` | **The worst string in the repo.** It fires after transcription *succeeded* and extraction failed. The doctor is told nothing, and is not told the one thing that matters: their words are already saved and the recording does not need repeating. A doctor who reads this re-dictates the consultation. | `The transcript was saved, but the visit could not be structured. Open the draft and retry — you do not need to dictate again.` |
| C2 | `Something went wrong on our end. Please try again.` | `src/lib/api/http.ts:131` | The catch-all for every unclassified 500. "Our end" is the only real content, and "please try again" is a guess — this branch is reached by conditions that retrying will not clear. Acceptable *only* as a last resort, and then it should say what is safe. | `That did not save. Nothing was changed — try again, and if it keeps failing, note the time and report it.` |
| C3 | `That did not work. Try again.` | `src/components/clinic/clinic-members.tsx:78,81` | Used as the fallback for both approving and declining a clinic member. "That" refers to two different irreversible-feeling actions and names neither. It also does not say whether the member's status changed. | Split by action: `The member was not approved. Their request is still waiting.` / `The request was not declined. It is still waiting.` |
| C4 | `` `Request failed (${response.status})` `` | `src/hooks/use-voice-capture.ts:723`, `src/components/dashboard/dashboard.tsx:966` | An HTTP status code rendered to a doctor. Duplicated in two independent fetch helpers, so fixing one leaves the other. It is reached whenever a response body is not JSON — exactly the case where the doctor has the least information. | `The server did not answer properly. Check your connection and try again.` |
| C5 | `The recording could not be finalised.` | `src/hooks/use-voice-capture.ts:541` | "Finalised" is the app's word, not a doctor's, and the sentence does not say whether any audio survived or whether re-dictation is needed. | `That recording could not be closed off, so there is nothing to transcribe. Record the visit again.` |
| C6 | `Could not start recording on this device.` | `src/hooks/use-voice-capture.ts:372` | The default arm of a four-way branch that already handles `MicUnavailableError`, `NotAllowedError` and `NotFoundError` well. What falls through is `NotReadableError` — the microphone is held by another app or tab — which is the single most common mic failure in real use and the one with the clearest remedy. It lands on the sentence with no remedy at all. | Add the case: `Another app is using the microphone. Close it, or the other browser tab, and try again.` Keep the current sentence as the true default. |
| C7 | `Something went wrong on our end. Please try again.` reused as an assumed-safe default | callers of `messageFor` in `src/components/dashboard/dashboard.tsx` | Every helper that falls back to a generic sentence multiplies C2. The fallback should name the operation the caller was performing, which the caller always knows. | Require a caller-supplied sentence, exactly as `ErrorScreen` already requires `title` and `description`. |

---

## 2. Internal jargon on a doctor's screen — P1/P2

These reach the browser through `ApiError`. They read like a stack trace.

| # | Current | Where | Defect | Proposed |
| --- | --- | --- | --- | --- |
| C8 | `` `status` must be `draft`, `committed`, or `discarded`. `` | `src/app/api/register/route.ts:23` | Three internal enum values and a query-parameter name, backticked, on a clinical register. A doctor has no concept named `committed`. | `That register filter is not one we recognise. Reload the page.` |
| C9 | `` `status` must be `open`, `completed`, `cancelled`, or `all`. `` | `src/app/api/follow-ups/route.ts:43` | Same defect, and inconsistent with C8's own list style. | `That follow-up filter is not one we recognise. Reload the page.` |
| C10 | `` `from` must be on or before `to`. `` | `src/app/api/register/export/route.ts:66` | Names two query parameters the doctor never sees. The UI control is a date range. | `The start date is after the end date. Choose a start date first.` |
| C11 | `` `from` must not be after `to`. `` | `src/app/api/analytics/daily/route.ts:39` | The same constraint as C10, phrased differently, in the same product. One of the two is redundant regardless of wording. | Same sentence as C10. |
| C12 | `` `from` and `to` must be YYYY-MM-DD dates. `` | `src/app/api/register/export/route.ts` | Parameter names plus a format string. `YYYY-MM-DD` is a developer's notation. | `Those dates could not be read. Pick them again from the date control.` |
| C13 | `` Provide either `transcriptId` or a non-trivial `text`. `` | `src/app/api/encounters/extract/route.ts:104` | Two internal field names and "non-trivial", which is not a word about anything the doctor did. | `There is nothing to work from yet. Record or type the visit first.` |
| C14 | `` `csv` `` in `` Only `csv` export is supported. `` | `src/app/api/register/export/route.ts:61` | Unreachable through the UI, which offers only CSV. If it is unreachable it should not be doctor-shaped at all. | `That export format is not available. Use the export button on the register.` |
| C15 | `` `field` is required. `` (template) | `src/lib/api/http.ts:245` | `requireString` interpolates the raw property name — `p_encounter_id`, `draft_version` — into a sentence a doctor reads. The message is generated from the schema, so no call site can make it readable. | Take a doctor-facing label: `requireString(value, { field: "phone", label: "A phone number" })` producing `A phone number is required.` |
| C16 | `Expected a JSON body.` | `src/lib/api/http.ts:239` | Describes a wire format. | `That request could not be read. Reload the page and try again.` |
| C17 | `Expected multipart/form-data.` | `src/app/api/encounters/transcribe/route.ts:29` | A MIME type. | `The recording did not upload properly. Try again.` |
| C18 | `A text field was invalid.` / `A text field exceeds 2000 characters.` | `src/app/api/encounters/manual/route.ts:155,158` | "A text field" names no field. The doctor is looking at a form with six of them and cannot tell which to shorten. | Thread the label through: `The diagnosis is too long. Keep it under 2000 characters.` |
| C19 | `Sex value is invalid.` | `src/app/api/encounters/manual/route.ts:179` | "Value" is a programmer's noun; the control is a fixed select, so this is unreachable by an honest client. | `That is not one of the options for sex. Choose one from the list.` |
| C20 | `Draft version is invalid.` / `Follow-up id is invalid.` / `Account entry id is invalid.` | `src/app/api/drafts/[id]/route.ts:106`, `src/app/api/follow-ups/[id]/complete/route.ts:20`, `src/app/api/accounts/[id]/route.ts:15` | Three sentences about identifiers and version counters. All are unreachable through the UI, and all three are worded differently for the same class of fault. | One sentence: `That link is no longer valid. Reload the page and try again.` |
| C21 | Raw `JSON.stringify(amendment.before_values)` in a `<pre>` | `src/components/dashboard/visit-detail-sheet.tsx:207` | Not a copy defect — a copy *absence*. The correction trail, the part of this app with the strongest medico-legal weight, renders as two blobs of JSON behind a "Before / after values" disclosure. Keys are database column names. | Render as labelled rows: `Diagnosis — was "Viral fever", now "Dengue fever"`. Keep the summary but call it `What changed`. |
| C22 | Raw provider text via `readable()` | `src/app/login/page.tsx:57-61` | `readable()` returns `error.message` from Supabase Auth unchanged whenever the failure is not a retryable fetch error. `Invalid login credentials`, `Email not confirmed` and `For security purposes, you can only request this after 47 seconds` all reach the login screen as the vendor wrote them. The house rule is that doctor-facing errors never carry a raw provider string. | Map the codes: `That email or password was not recognised.` / `This address has not been confirmed yet. Check your inbox.` / `Too many attempts. Wait a minute and try again.` — default to the existing `NETWORK_ERROR`. |

---

## 3. Claims that are not true — P1

A comment that is not true is a defect. A sentence on a doctor's screen that is
not true is worse.

| # | Current | Where | Defect | Proposed |
| --- | --- | --- | --- | --- |
| C23 | `You have hit this hour's limit for that action. It resets shortly.` | `src/lib/api/http.ts:168` | The same function sets `Retry-After: 3600` two lines later, and the comment there says "the honest worst case is the full hour". The sentence says "shortly" and the header says an hour. The code already knows the copy is wrong. | `You have used this hour's limit for that action. It resets within the hour.` |
| C24 | `Audio kept temporarily for retry.` | `src/components/voice/review-sheet.tsx:571` | "Temporarily" is unfalsifiable. The window is a measured 30 days (`supabase/migrations/0004_audit_and_limits.sql`, `audio_expires_at default now() + interval '30 days'`; documented in `docs/operations.md`). A doctor deciding whether they can check a disputed extraction next week is given nothing to decide with. | `The recording is kept for 30 days so a transcript can be checked or retried.` |
| C25 | `Audio is retained temporarily if the transcription needs another pass.` | `src/components/voice/review-sheet.tsx:572` | The desktop half of the same pair. Adds "if", which implies conditional retention; retention is unconditional. | Same sentence as C24, and delete the mobile/desktop split — a fact does not change with viewport width. |
| C26 | `Transcribed by the backup engine — accuracy on mixed-language speech is lower than usual.` | `src/components/voice/review-sheet.tsx:556-557` | Half right: it does state that accuracy is lower, which most degraded-mode banners fail to do. Two faults remain. "Backup engine" is infrastructure vocabulary — the doctor has no model of a primary and a backup. And it ends on a statement with no instruction, inside a warning box whose whole purpose is to change what the doctor does next. | `A second recogniser transcribed this one, and it is less accurate on mixed-language speech. Read every line back before you confirm.` |
| C27 | `The recording has expired or was already removed.` | `src/app/api/drafts/[id]/retry/route.ts:67` | "Or" makes the sentence unfalsifiable, and neither branch tells the doctor what remains. The transcript text always survives — that is the point of the retention policy. | `That recording is past its 30-day window and has been deleted. The transcript text is still on the visit.` |
| C28 | `Signed clinical record, source transcript, and an immutable correction trail.` | `src/components/dashboard/visit-detail-sheet.tsx:128` | "Signed" and "immutable" are strong assertions. Nothing signs an encounter — the only signatures in the schema are HMACs on clinic invite tokens (`supabase/migrations/0011_security_workflows.sql:190`) — and "immutable" is a property enforced by a trigger on the amendments table, not a promise this sheet can keep on its own. Overclaiming in a medico-legal surface is the most expensive kind of copy defect. | `The confirmed record, the transcript it came from, and every correction since.` |
| C29 | `Your visits are safe on the server — this is a problem reaching them.` | `src/components/empty/register-empty.tsx:127` | Well-intentioned and *usually* true, but this is the `error` state for any load failure, including one where the server returned a 500 because the query itself is broken. The UI cannot know the visits are safe. | `This is a problem loading the register, not a problem with your visits. Check your connection and try again.` |

---

## 4. Siblings that disagree — P2

Same fact, same product, different sentences. Each row is a place where a doctor
who sees both cannot tell whether they are looking at one problem or two.

### 4a. Age

Five sentences for one field.

| Current | Where |
| --- | --- |
| `Age must be between 0 and 130.` | `src/app/api/encounters/[id]/route.ts:190`, `src/app/api/drafts/[id]/route.ts:220` |
| `Age must be a whole number between 0 and 130.` | `src/app/api/patients/[id]/route.ts:80` |
| `Age must be a number between 0 and 130, or left blank.` | `src/components/voice/manual-visit-flow.tsx:102` |
| `Age must be a number, or left blank.` | `src/components/voice/review-sheet.tsx:345` |
| `` `Age must be a whole number between 0 and 130.` `` (built from `${label}`/`${minimum}`/`${maximum}`) | `src/app/api/encounters/manual/route.ts:171` |

**Proposed, everywhere:** `Enter an age in whole years between 0 and 130, or leave it blank.`
It is the only one of the five that states all three rules the validators
actually enforce (integer, range, optional).

### 4b. Searching for a patient

One endpoint, `/api/patients/match`, reported five ways.

| Current | Where |
| --- | --- |
| `Could not search the patient list. Try again.` | `src/app/api/patients/match/route.ts:40` |
| `Could not search patient charts.` | `src/components/voice/review-sheet.tsx:215` |
| `Could not search patients.` | `src/components/follow-ups/follow-up-workspace.tsx:212,219` |
| `Could not search patients. Try again.` | `src/components/command/use-patient-search.ts:86,133` |
| `Could not load the patient list` | `src/components/patients/patient-directory.tsx:135` |

**Proposed, everywhere:** `Could not search the patient list. Try again.`
(the server's own wording — it offers the next step, and the four client
fallbacks exist only because the server message might not arrive).

### 4c. Consultation amount

| Current | Where |
| --- | --- |
| `Enter the consultation amount with up to two decimal places.` | `src/app/api/encounters/[id]/commit/route.ts:186`, `src/app/api/drafts/[id]/route.ts:203`, `src/components/voice/review-sheet.tsx:1212` |
| `Enter a valid amount with up to two decimal places.` | `src/app/api/accounts/route.ts:137` |
| `Enter an amount greater than zero.` | `src/app/api/accounts/route.ts:141` |

The first three agree. The accounts ledger, which is a different field, uses a
fourth wording; that is defensible, but "a valid amount" should say what makes
it invalid. **Proposed for accounts:** `Enter an amount in rupees, with up to two decimal places.`

### 4d. Draft conflict

| Current | Where |
| --- | --- |
| `This draft changed in another window. Reload it before saving.` | `src/app/api/drafts/[id]/route.ts:109,140,149` |
| `This draft changed elsewhere. Reload it and try again.` | `src/app/api/encounters/[id]/route.ts:138` |
| `This draft changed elsewhere — reload before saving` | `src/components/voice/review-sheet.tsx:806` |
| `… may have been saved or changed in another window — reload the register and try again.` | `src/components/dashboard/register-bulk-bar.tsx:521` |

Four phrasings of one optimistic-concurrency outcome. "Elsewhere" is weaker
than "in another window": the doctor's actionable model is *another tab or
another device*, and "elsewhere" invites the reading "the server lost it".

**Proposed, everywhere:** `This draft changed in another window. Reload it before saving.`

### 4e. Follow-ups and visits — server/client fallback pairs

| Server | Client fallback | Where |
| --- | --- | --- |
| `Could not schedule this follow-up.` | `Could not schedule follow-up.` | `src/app/api/follow-ups/route.ts` / `src/components/follow-ups/follow-up-workspace.tsx:311,327` |
| `Could not complete this follow-up.` | `Could not complete follow-up.` | `src/app/api/follow-ups/[id]/complete/route.ts` / `follow-up-workspace.tsx:349,362` |
| `Could not save this visit to the register.` | `Could not save the visit.` | `src/app/api/encounters/[id]/commit/route.ts:93,97` / `src/components/voice/review-sheet.tsx:405,415` |

In each pair the client fallback is a slightly degraded copy of the server
sentence, differing only by an article. There is no reason for the divergence
and it doubles the surface to keep correct. Adopt the server wording in both
places (see [§12](#12-srclibcopyts)).

### 4f. The same statistic, two names

| Current | Where | Defect |
| --- | --- | --- |
| `Distinct diagnoses` | `src/components/patients/patient-history-sheet.tsx:213` | The same number is labelled twice in the same sheet, once with a statistician's adjective and once with a clinician's phrase. `Distinct` is the wrong register for a chart summary. |
| `Diagnoses on file` | `src/components/patients/patient-history-sheet.tsx:351` | |

**Proposed, both:** `Diagnoses on file`.

### 4g. Search placeholders

| Current | Where |
| --- | --- |
| `Search by name, or the last digits of a phone number` | `src/components/patients/patient-directory.tsx:123` |
| `Search by name or phone` | `src/components/follow-ups/follow-up-workspace.tsx:648` |
| `Search patient, diagnosis, treatment or medicine` | register search |
| `Search category, person, method, or note` | accounts search |
| `Search patients, visits or actions…` | command palette |

Three of the five drop the ellipsis; two use a serial comma, three do not. The
first two search the *same* index and describe it differently. **Proposed:**
one pattern, `Search <what is matched>` with no trailing ellipsis, and the
patient search standardised on the directory's fuller wording — the "last
digits" hint is the single most useful thing on that line.

---

## 5. Fault in the wrong place — P2

| # | Current | Where | Defect | Proposed |
| --- | --- | --- | --- | --- |
| C30 | `Couldn't update accounts` over a failed **load** | `src/components/accounts/accounts-workspace.tsx:162` (title) with `Could not load accounts.` at `:103` (body) | The title and the body describe different operations. A doctor reading "couldn't update" after merely opening the ledger will reasonably think they have lost an entry they wrote. | Title the alert from the operation that failed. For the load path: `Couldn't load the ledger` — matching `src/components/empty/accounts-empty.tsx:91`, which already says exactly that. |
| C31 | `Could not verify your session.` returned for a **rate-limiter database error** | `src/lib/api/http.ts:163` (503) — identical to `:86` (401) | Two unrelated facts share one sentence. At `:86` the session genuinely could not be read; at `:163` the session is fine and Postgres is unhappy. The doctor is told to doubt their login when signing out and back in will not help. | Keep `:86`. Change `:163` to `The service is temporarily unavailable. Try again in a moment.` **Do not** centralise these two into one constant — see [§12](#12-srclibcopyts). |
| C32 | `The assistant is not configured. Check the server API key.` | `src/lib/api/http.ts:186` | Instructs a doctor to check a server API key. They cannot, and telling them to try invites a support call that a clear sentence would have pre-empted. | `The assistant is unavailable. This needs an administrator — the visit is not affected.` (Keep the precise cause in the server log, which already happens at `:112`.) |
| C33 | `Transcription is not configured. Check the server API key.` | `src/lib/api/http.ts:218` | Same defect, same reasoning. | `Transcription is unavailable. This needs an administrator — your recording is not lost.` |
| C34 | `The assistant would not process that dictation. Try again.` | `src/lib/api/http.ts:190` | Reached when a provider safety filter rejects clinical text. "Would not" reads as a refusal aimed at what the doctor said. The code comment directly above it says "Nothing the doctor did wrong" — the string does not agree with its own comment. | `The assistant could not process that dictation. Nothing is wrong with what you said — try again.` |
| C35 | `That dictation was too long for the assistant to finish.` | `src/lib/api/http.ts:192` | States the constraint but not the remedy, and not what survived. | `That dictation was too long to structure. The transcript is saved — dictate one patient at a time.` |
| C36 | `No speech was detected in that recording.` | `src/lib/api/http.ts:212` | Correct and neutral, but stops one sentence early; the comment above it already knows the two likely causes. | `No speech was detected in that recording. Check that the microphone was not muted, and record again.` |
| C37 | `This device produced an audio format we cannot transcribe.` | `src/lib/api/http.ts:214` | Blames the device and offers no exit. The doctor is standing in a consulting room holding that device. | `This browser recorded in a format we cannot transcribe. Try a different browser, or type the visit instead.` |
| C38 | `There are no drafts waiting for review.` | `src/components/dashboard/dashboard.tsx:294` | Presented through `setDraftError` — the error channel — for a state that is not an error. Styled as a failure, announced as one. | Keep the sentence; route it to the neutral status channel, not `draftError`. |

---

## 6. Copy that is written but never rendered — P2

| # | What | Where | Defect |
| --- | --- | --- | --- |
| C39 | `unavailableNote()` — four precise sentences, one per reason the live transcript stopped | `src/hooks/use-voice-capture.ts:75-86` | Dead. The hook narrows its own state to a boolean at `:626` (`liveTextUnavailable: liveTranscript.status === "unavailable"`), and `voice-dock.tsx:229` renders a single generic line for all four cases. All four sentences say the recording is still running — the one fact a doctor needs mid-consultation — and the `rate-limited` arm even names the retry path. The plumbing throws every word of it away. **Proposed:** pass `liveTranscript.note` through to the dock and render it; the generic sentence at `voice-dock.tsx:231` becomes the fallback when `note` is null. |
| C40 | The entire prescription output sheet | `src/components/outputs/prescription-sheet.tsx` | Dead code — no file imports it (confirmed by grep for `outputs/prescription-sheet`). Its copy has been carried through reviews for nothing. **Proposed:** delete the file, or the audit repeats on strings no doctor will read. Out of scope here; flagged for whoever owns that directory. |
| C41 | `filteredCopy()` forked as `emptyStateCopy()` | `src/components/empty/register-empty.tsx:53-103` and `src/components/dashboard/register-workspace.tsx:315-334` | Not just a duplicate — a **lossy** one. The fork collapses the search, status and date branches into a single `No visits match these filters`, so it never echoes the search term back and never says which control is hiding the visit. Both render the register, so the same doctor gets materially better or worse copy depending on which path drew the screen. The two also already differ: the fork keys its longer-range hint off `LONGEST_RANGE_DAYS` directly, the variant off a `longestRangeDays` prop. **Proposed:** delete `emptyStateCopy` and render `RegisterEmpty`. |

---

## 7. Screen-reader text that disagrees with the screen — P2

Accessibility copy is copy. When the two channels disagree, the doctor using a
screen reader is working from a different app.

| # | Visible | Announced | Where | Defect |
| --- | --- | --- | --- | --- |
| C42 | `Tap stop to finish` | `Recording. Tap stop when finished.` | `src/components/voice/voice-dock.tsx:205` / `:138` | Same instruction, two grammars. Harmless in isolation; it is the pattern that matters, because it shows the two channels are being written independently. **Proposed:** the visible label is the short form of the announced one — `Tap stop to finish` / `Recording. Tap stop to finish.` |
| C43 | `Ask patient history` (`sr-only`) | `Ask about a patient's history` (`aria-label`) | `src/components/voice/voice-dock.tsx:305` / `:296` | Two accessible names for one control, on one element. A screen reader reads one; the other is dead weight and a maintenance trap. **Proposed:** keep `Ask about a patient's history`, drop the `sr-only` span. |
| C44 | `Autosave failed — your edits remain on screen` | announced `aria-live="polite"` | `src/components/voice/review-sheet.tsx:805` | The copy is good — it names the failure *and* what survived. The politeness is wrong: a doctor who does not notice this and closes the sheet loses the edits. **Proposed:** keep the words, raise to `assertive` / `role="alert"`. |
| C45 | `Unknown author` | — | `src/components/dashboard/visit-detail-sheet.tsx:205` | On a correction trail, "unknown author" is a strong claim: it reads as *we do not know who changed this record*. The real cause is a deleted or unjoined doctor row. **Proposed:** `Author no longer in this clinic`. |

---

## 8. Absent-value vocabulary — P3

The app has two words and one symbol for "we do not have this".

| Token | Where |
| --- | --- |
| `Not recorded` | `patient-history-sheet.tsx:346,347,348,349,476`, `timeline-entry.tsx:262,308`, `lib/encounters/review.ts:20` |
| `Not stated` | `review-sheet.tsx:740` (placeholder) |
| `—` | `lib/format.ts:73,78,83`, `lib/llm/dosage.ts:152`, `accounts-workspace.tsx:275`, `volume-chart.tsx:30` |
| `Date not recorded` | `timeline-entry.tsx:131,236`, `patient-timeline.tsx:150`, `accounts-workspace.tsx:531` |
| `Age not recorded` / `Diagnosis not recorded` / `Dose details not recorded` | `lib/outputs/`, `timeline-entry.tsx` |

**Proposed rule:** `Not recorded` in prose and in labelled detail rows; `—` only
inside dense numeric or tabular contexts where a sentence would not fit. Retire
`Not stated` — it is a single outlier against eight uses of `Not recorded`,
and the two are not distinguishable to a reader. The `<X> not recorded`
compounds are correct and should stay: in a list, a bare `Not recorded` loses
its subject.

---

## 9. Confirmations and destructive actions — P2

| # | Current | Where | Defect | Proposed |
| --- | --- | --- | --- | --- |
| C46 | `Discard this visit? What you have entered will be lost.` | `src/components/voice/review-sheet.tsx:1236` | Delivered by `window.confirm`, whose buttons say "OK" and "Cancel". "OK" is the destructive choice and is not labelled as such. The sentence is fine; the container defeats it. | An in-app dialog with named actions: `Discard this visit?` / `The transcript and everything you have entered will be deleted.` / **Discard** / **Keep editing**. |
| C47 | `Committed visits cannot be discarded.` | `src/app/api/encounters/[id]/route.ts:167,180` | `Committed` is the database's word. The doctor's word is *confirmed*, which is what the review sheet's own button says. | `A visit that has been confirmed cannot be discarded. Record a correction instead.` |
| C48 | `Visit corrections are append-only.` | `src/app/api/encounters/[id]/amendments/route.ts:55` | "Append-only" is a storage property. | `A correction cannot be edited or removed once saved. Add another correction instead.` |
| C49 | `That visit is already being saved. Give it a moment.` | `src/app/api/encounters/[id]/commit/route.ts:91` | Good — states the fact and the action. Listed as the standard the rest of this file should meet. | No change. |

---

## 10. Copy that is already right — do not churn

Named so a fixer does not "improve" it into something worse.

- `src/components/empty/*.tsx` — the strongest copy in the repo. `register-empty.tsx`
  distinguishes "your filters hide it" from "it is not there", which is a
  clinical distinction, and `longerRangeExists` refuses to suggest a longer date
  range to someone already on the widest one. That is copy taking responsibility
  for whether its own advice is actionable.
- `src/app/api/[...unmatched]/route.ts` — `No such endpoint.` plus a documented
  rationale for why an HTML 404 must never reach a client helper.
- `src/lib/api/http.ts:196-199` — the timeout branch, with a comment explaining
  why it must not share wording with the default branch. The reasoning is
  correct; §2 and §5 above are the cases where the same care was not applied.
- `src/components/voice/review-sheet.tsx:543` — `Transcription and extraction are
  suggestions. You remain the final reviewer.` This is the sentence that makes
  the human-confirmation boundary visible. Do not soften it.
- `src/components/dashboard/register-bulk-bar.tsx:516-525` — partial-failure copy
  that reports how many succeeded and how many did not, with correct
  singular/plural. Only the conflict wording (§4d) needs aligning.

---

## 11. Test coupling

Four tests assert on strings this audit proposes changing. Whoever adopts a
replacement updates the assertion in the same commit.

| String | Asserted at | Proposal |
| --- | --- | --- |
| `Could not load the patient list` | `tests/e2e/patients.spec.ts:166` | §4b |
| `Could not load accounts.` | `tests/e2e/accounts.spec.ts:291,298` | §5 C30 (title only; the body string is unchanged) |
| `Could not verify your session.` | `tests/unit/api-contract.test.ts:250` | §5 C31 — the 401 keeps this string; check which path the test drives |
| `Could not save your changes.` | `tests/unit/api-contract.test.ts:296` | Unchanged by this audit |

---

## 12. `src/lib/copy.ts`

Not an i18n layer, and deliberately small. It holds only strings that exist
**verbatim in two or more places today**, where a single definition removes a
real drift risk. Everything else in this audit is a one-site fix and belongs at
its call site.

The module is in two parts:

- **Part A — adopting the constant changes nothing on screen.** The string is
  today's string; the audit found no fault with it. Pure refactor.
- **Part B — adopting the constant changes visible text.** The string is this
  audit's proposed replacement. Each carries the superseded text in a comment
  so the diff is reviewable.

### What it exports

**Part A — adopting these changes nothing on screen.**

| Export | Sites today |
| --- | --- |
| `RECORD_A_VISIT` | 4 |
| `CLEAR_SEARCH` | 4 |
| `CLEAR_FILTERS` | 3 |
| `RESET_FILTERS` | 2 |
| `PATIENT_SEARCH_HINT` | 3 |
| `NOT_RECORDED` | 8 |
| `DATE_NOT_RECORDED` | 4 |
| `PATIENT_NAME_REQUIRED` | 3 |
| `CONSULTATION_AMOUNT_FORMAT` | 3 |
| `CONSULTATION_AMOUNT_RANGE` | 3 |
| `DRAFT_CONFLICT_MESSAGE` | 3 |
| `RECALL_PLACEHOLDER` | 2 |
| `SAVE_CHANGES_FAILED` | 2 |
| `LOAD_ACCOUNTS_FAILED` | 3 |
| `LOAD_FOLLOW_UPS_FAILED` | 4 |

**Part B — adopting these changes visible text.**

| Export | Supersedes | Audit |
| --- | --- | --- |
| `AGE_RANGE` | 5 sentences for one field | §4a |
| `PATIENT_SEARCH_FAILED` | 4 client variants of the server's own sentence | §4b |
| `FOLLOW_UP_SCHEDULE_FAILED` | `Could not schedule follow-up.` | §4e |
| `FOLLOW_UP_COMPLETE_FAILED` | `Could not complete follow-up.` | §4e |
| `COMMIT_FAILED` | `Could not save the visit.` | §4e |

Deliberately **not** in the module:

- `Could not verify your session.` — the two occurrences (`http.ts:86`, `:163`)
  state different facts and must diverge, not converge (C31).
- `Something went wrong on our end. Please try again.` and `Request failed (…)`
  — a shared constant would make the generic fallback easier to reach, which is
  the opposite of what §1 asks for. Every call site knows more and should say
  more.
- Empty-state titles and descriptions — they are already centralised, in the
  `src/components/empty/*` variants that exist for exactly that purpose.
- `Not recorded` is included; `—` is not. A one-character token used inside
  formatters is not copy, and importing a module to produce it would be worse
  than the duplication.
