/**
 * Strings that exist verbatim in more than one place.
 *
 * Not an i18n layer and not a home for all copy: a sentence with one call site
 * belongs at that call site, where the surrounding code says what it means. The
 * only strings here are ones the audit found duplicated across files, where two
 * copies will drift and the drift is invisible until a doctor sees two
 * different sentences for one fact.
 *
 * `docs/copy-audit.md` is the reasoning behind each entry, and the list of
 * strings deliberately left out — notably the generic 500 fallback and the
 * `Could not verify your session.` pair, where sharing a constant would make
 * the wrong string easier to reach.
 *
 * Nothing imports this yet. Each surface is adopted by whoever owns it.
 */

/* -------------------------------------------------------------------------
 * Part A — today's exact strings.
 *
 * Adopting these changes nothing a doctor sees. Every one already appears
 * character-for-character at the call sites named.
 * ---------------------------------------------------------------------- */

/**
 * The action a doctor is offered from an empty register, an empty patient list
 * and an empty recall panel, because in all three the useful next move is the
 * next consultation rather than the missing one.
 */
export const RECORD_A_VISIT = "Record a visit";

/** The clear-search affordance, including the icon button's accessible name. */
export const CLEAR_SEARCH = "Clear search";

/** Used when more than a search term is narrowing a list. */
export const CLEAR_FILTERS = "Clear filters";

/**
 * Distinct from CLEAR_FILTERS on purpose: "reset" is offered when the controls
 * have a meaningful default to return to — a date window is always set to
 * something, so it can be reset but never cleared.
 */
export const RESET_FILTERS = "Reset filters";

/**
 * Why a name search missed. Names arrive through dictation and are spelt as
 * they sounded, so "a different spelling" is the likeliest fix and the phone
 * digits are the reliable fallback.
 */
export const PATIENT_SEARCH_HINT =
  "Try fewer letters, a different spelling, or the last digits of a phone number.";

/**
 * A field the chart has no value for.
 *
 * "Not recorded" rather than a dash or a blank: on a patient chart, "nobody
 * wrote this down" and "this is empty because the row failed to load" have to
 * look different, and only the first one is a sentence.
 */
export const NOT_RECORDED = "Not recorded";

/**
 * Kept separate from NOT_RECORDED because it appears in timelines and ledgers
 * where the entries are dates and a bare "Not recorded" has lost its subject.
 */
export const DATE_NOT_RECORDED = "Date not recorded";

/**
 * The one field a visit cannot be saved without, enforced in the manual-entry
 * route and re-checked in both forms that reach it.
 */
export const PATIENT_NAME_REQUIRED = "A patient name is required.";

/** Rejects an amount with more precision than paise. */
export const CONSULTATION_AMOUNT_FORMAT =
  "Enter the consultation amount with up to two decimal places.";

/** The range the commit and draft routes both enforce. */
export const CONSULTATION_AMOUNT_RANGE =
  "Consultation amount must be between ₹0.01 and ₹10,00,000.";

/**
 * The optimistic-concurrency outcome.
 *
 * "In another window" rather than "elsewhere": the doctor's actionable model is
 * a second tab or the phone in their pocket. "Elsewhere" reads as though the
 * server misplaced the draft, which sends them looking for a loss that has not
 * happened.
 */
export const DRAFT_CONFLICT_MESSAGE =
  "This draft changed in another window. Reload it before saving.";

/**
 * The example question in the recall box.
 *
 * A placeholder is the only teaching this feature gets, so the two boxes that
 * offer recall have to demonstrate the same shape of question.
 */
export const RECALL_PLACEHOLDER = "What did I prescribe Sunita last time?";

/** The draft-save failure, from both the PATCH and the conflict-recovery path. */
export const SAVE_CHANGES_FAILED = "Could not save your changes.";

/** The accounts list failed to load — not an entry the doctor was writing. */
export const LOAD_ACCOUNTS_FAILED = "Could not load accounts.";

/** The follow-up list failed to load, in the workspace and in the due banner. */
export const LOAD_FOLLOW_UPS_FAILED = "Could not load follow-ups.";

/* -------------------------------------------------------------------------
 * Part B — corrections.
 *
 * These replace text a doctor can see today. Each entry names what it
 * supersedes so the change is reviewable, and `docs/copy-audit.md` carries the
 * argument. Adopting one is a copy change, not a refactor: read the audit's
 * test-coupling section first.
 * ---------------------------------------------------------------------- */

/**
 * Every age validator in the app, client and server.
 *
 * Supersedes five sentences for one field — two in the encounter routes, one in
 * the patient route, and two more in the forms. Only this wording states all
 * three rules the validators actually enforce: whole years, the range, and that
 * blank is allowed.
 */
export const AGE_RANGE = "Enter an age in whole years between 0 and 130, or leave it blank.";

/**
 * `/api/patients/match` failed.
 *
 * Supersedes four client-side variants of the server's own sentence. The
 * fallbacks exist for the case where the server's message never arrives, so
 * they should not be quieter than it — this one names the list and offers the
 * next step, and the shortest of the four did neither.
 */
export const PATIENT_SEARCH_FAILED = "Could not search the patient list. Try again.";

/** Supersedes the workspace's shorter "Could not schedule follow-up." */
export const FOLLOW_UP_SCHEDULE_FAILED = "Could not schedule this follow-up.";

/** Supersedes the workspace's shorter "Could not complete follow-up." */
export const FOLLOW_UP_COMPLETE_FAILED = "Could not complete this follow-up.";

/**
 * Supersedes the review sheet's "Could not save the visit."
 *
 * Naming the register matters here: this is the one write in the app that moves
 * a draft into the medical record, and a doctor who cannot tell whether that
 * step happened will go looking for the visit.
 */
export const COMMIT_FAILED = "Could not save this visit to the register.";
