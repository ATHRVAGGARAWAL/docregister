/**
 * The audit trail, in words.
 *
 * `audit_log` is written by a trigger and by `log_sensitive_access`, and the two
 * writers do not share a vocabulary: the trigger uses `tg_table_name`, so it
 * records `encounters` and `patients`, while `log_sensitive_access` takes the
 * entity as an argument and its check constraint spells them singular —
 * `encounter`, `patient`. Both forms are in the live table today. Everything
 * below therefore treats `entity` as an open set of strings rather than an enum,
 * groups the two spellings under one filter, and degrades to a humanised table
 * name for anything a later migration adds.
 *
 * Isomorphic on purpose: the route uses the parsing and detail-narrowing halves,
 * the view uses the wording half, and neither can drift from the other.
 */

import { formatCount, formatDayShort } from "@/lib/format";

/**
 * Matches `audit_action` in migration 0004, ordered as a doctor would scan them:
 * the four that change the register first, the two that only observe it last.
 */
export const AUDIT_ACTIONS = ["insert", "update", "commit", "delete", "read", "export"] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export function isAuditAction(value: unknown): value is AuditAction {
  return typeof value === "string" && (AUDIT_ACTIONS as readonly string[]).includes(value);
}

/** Filter labels for the action dropdown, in the doctor's words rather than the enum's. */
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  insert: "Created",
  update: "Changed",
  commit: "Signed off",
  delete: "Deleted",
  read: "Opened",
  export: "Exported",
};

export interface AuditEntityGroup {
  /** The value carried in the query string. */
  readonly value: string;
  readonly label: string;
  /** Every `entity` string that belongs to this group, for an `IN` filter. */
  readonly entities: readonly string[];
}

/**
 * What an owner would think of as one kind of record.
 *
 * A doctor filtering for visits means both the writes the trigger recorded
 * against `encounters` and the reads the app recorded against `encounter`, and
 * an amendment is a correction to a visit rather than a category of its own.
 */
export const AUDIT_ENTITY_GROUPS: readonly AuditEntityGroup[] = [
  { value: "visits", label: "Visits", entities: ["encounters", "encounter", "encounter_amendments"] },
  { value: "patients", label: "Patient charts", entities: ["patients", "patient"] },
  { value: "prescriptions", label: "Prescriptions", entities: ["prescription_items"] },
  { value: "dictation", label: "Dictation and audio", entities: ["transcripts", "transcript", "audio"] },
  { value: "register", label: "Register", entities: ["register"] },
  { value: "follow-ups", label: "Follow-ups", entities: ["follow_ups"] },
  { value: "accounts", label: "Accounts", entities: ["account_entries"] },
  { value: "team", label: "Clinic members", entities: ["doctors", "clinic_invites"] },
  { value: "audit", label: "This audit trail", entities: ["audit_log"] },
];

/** The `entity` values behind a filter group, or null when the group is unknown. */
export function auditEntitiesFor(group: string): readonly string[] | null {
  return AUDIT_ENTITY_GROUPS.find((candidate) => candidate.value === group)?.entities ?? null;
}

/**
 * One row, as the API hands it over.
 *
 * `changed` stays as column names: it is a `text[]` written by one trigger from
 * `tg_table_name`'s own columns, so it is a closed, non-PHI vocabulary that the
 * view can safely turn into labels. `detail` does not cross at all — it is
 * free-form jsonb, so the route narrows it to `context` first.
 */
export interface AuditEntry {
  id: number;
  at: string;
  action: AuditAction;
  entity: string;
  entityId: string | null;
  actorId: string | null;
  actorName: string | null;
  changed: readonly string[];
  context: string | null;
}

export interface AuditPage {
  entries: AuditEntry[];
  /** Pass back as `?cursor=` for the next page; null when this page is the last. */
  nextCursor: string | null;
  /**
   * How many entries match the current filters, counted on the first page only
   * — it cannot change as pages are turned, and null on later pages says
   * "unchanged", not "unknown".
   */
  total: number | null;
}

/**
 * Shown where an actor's name would be.
 *
 * `actor_id` is `auth.uid()` at write time and null means one of two things
 * this table cannot tell apart: a scheduled job running as the service role —
 * the audio-retention sweep does exactly that — or a doctor whose account was
 * removed, since the foreign key is ON DELETE SET NULL. Naming both is the only
 * honest label.
 */
export const UNATTRIBUTED_ACTOR = "An automated job or removed account";

/** Noun phrases, article included, for the entity strings the app actually writes. */
const ENTITY_NOUNS: Record<string, string> = {
  encounters: "a visit",
  encounter: "a visit",
  encounter_amendments: "a signed visit",
  patients: "a patient chart",
  patient: "a patient chart",
  prescription_items: "a prescription line",
  transcripts: "a dictation",
  transcript: "a dictation",
  audio: "a recording",
  register: "the register",
  follow_ups: "a follow-up",
  account_entries: "an account entry",
  doctors: "a colleague's account",
  clinic_invites: "an invite",
  audit_log: "this audit trail",
};

/** A table name a later migration adds, made readable without pretending to know it. */
function fallbackNoun(entity: string): string {
  return `a ${entity.replace(/_/g, " ")} record`;
}

export function auditEntityNoun(entity: string): string {
  return ENTITY_NOUNS[entity] ?? fallbackNoun(entity);
}

/** Verbs that read wrong in the general case and right for one entity. */
const PREDICATES: Record<string, (noun: string) => string> = {
  "insert:encounters": () => "started a visit",
  "insert:encounter_amendments": () => "amended a signed visit",
  "insert:transcripts": () => "recorded a dictation",
  "insert:prescription_items": () => "added a prescription line",
  "delete:prescription_items": () => "removed a prescription line",
  "insert:follow_ups": () => "scheduled a follow-up",
  "insert:account_entries": () => "recorded an account entry",
  "insert:clinic_invites": () => "invited a colleague",
  "insert:doctors": () => "joined the clinic",
  "read:register": () => "read the register",
  "read:audio": () => "played a recording",
  "read:audit_log": () => "opened this audit trail",
  "export:register": () => "exported the register",
};

function defaultPredicate(action: AuditAction, noun: string): string {
  switch (action) {
    case "insert":
      return `added ${noun}`;
    case "update":
      return `changed ${noun}`;
    case "delete":
      return `deleted ${noun}`;
    case "commit":
      return `signed ${noun} into the register`;
    case "read":
      return `opened ${noun}`;
    case "export":
      return `exported ${noun}`;
  }
}

export interface AuditSentence {
  /** The subject, already resolved to a name or to the unattributed stand-in. */
  actor: string;
  /** What they did, with the record as its object. */
  predicate: string;
  /** The fields a change touched, or null when the action names no fields. */
  fields: string | null;
}

/**
 * One row as a sentence a doctor can read without knowing the schema.
 *
 * Split into three parts rather than returned pre-joined so the view can weight
 * the actor differently from the rest; `auditSentenceText` puts it back together
 * for announcements and for anything that needs a plain string.
 */
export function describeAuditEntry(entry: AuditEntry): AuditSentence {
  const noun = auditEntityNoun(entry.entity);
  const key = `${entry.action}:${entry.entity}`;

  // A doctor editing their own profile and an owner changing someone else's
  // account are the same UPDATE on the same table, and telling them apart is
  // most of what makes this row worth reading.
  const selfEdit =
    entry.entity === "doctors" && entry.actorId !== null && entry.actorId === entry.entityId;

  const predicate = selfEdit
    ? entry.action === "insert"
      ? "joined the clinic"
      : defaultPredicate(entry.action, "their own account")
    : (PREDICATES[key]?.(noun) ?? defaultPredicate(entry.action, noun));

  return {
    actor: entry.actorName ?? UNATTRIBUTED_ACTOR,
    predicate,
    fields: describeChangedFields(entry.changed),
  };
}

/**
 * Columns whose change tells a doctor nothing.
 *
 * Bookkeeping the app writes on every save (`draft_version`, `idempotency_key`),
 * derived copies of a field that is already listed (`name_normalized`), and the
 * model's own working data (`extracted_raw`, `low_confidence_fields`) — all of
 * which appear in real rows and would otherwise crowd out the diagnosis.
 */
const NOISE_FIELDS = new Set([
  "id",
  "clinic_id",
  "created_at",
  "updated_at",
  "draft_version",
  "idempotency_key",
  "extracted_raw",
  "extraction_model",
  "low_confidence_fields",
  "name_normalized",
  "token_digest",
  "position",
]);

/** Column names that do not survive a mechanical de-underscoring. */
const FIELD_LABELS: Record<string, string> = {
  abha_id: "ABHA ID",
  age_years: "age",
  amount_paise: "amount",
  approved_at: "approval time",
  audio_deleted_at: "recording deletion",
  audio_expires_at: "recording expiry",
  audio_path: "recording file",
  capture_source: "capture method",
  committed_at: "sign-off time",
  completion_notes: "completion notes",
  dictation_langs: "dictation languages",
  drug_name: "drug",
  due_at: "due date",
  duration_ms: "recording length",
  edited_by_doctor: "doctor's edits",
  fees_inr: "fee",
  first_seen_at: "first visit",
  frequency_code: "frequency",
  frequency_label: "frequency",
  frequency_spoken: "frequency",
  full_name: "name",
  is_new_patient: "new-patient flag",
  language_code: "language",
  language_hint: "language hint",
  live_text: "live transcript",
  membership_status: "membership",
  needs_review: "review flag",
  occurred_at: "date and time",
  patient_name_spoken: "patient name",
  raw_text: "transcript",
  registration_no: "registration number",
  roman_text: "romanised transcript",
  visit_number: "visit number",
};

/** How many field names a row lists before it starts counting instead. */
const MAX_LISTED_FIELDS = 4;

/**
 * The columns a change touched, as a readable list.
 *
 * Unrecognised columns are de-underscored rather than dropped: a migration that
 * adds a column would otherwise make a row quietly understate what changed, and
 * an audit trail that understates is worse than one that reads awkwardly.
 */
export function describeChangedFields(changed: readonly string[]): string | null {
  const labels = changed
    .filter((column) => !NOISE_FIELDS.has(column))
    .map((column) => FIELD_LABELS[column] ?? column.replace(/_id$/, "").replace(/_/g, " "));

  const unique = [...new Set(labels)];
  if (unique.length === 0) return null;
  if (unique.length <= MAX_LISTED_FIELDS) return unique.join(", ");

  const shown = unique.slice(0, MAX_LISTED_FIELDS);
  return `${shown.join(", ")} and ${formatCount(unique.length - shown.length)} more`;
}

/**
 * The publishable part of a row's `detail`.
 *
 * Runs on the server so free-form jsonb never reaches a browser. The keys below
 * are the ones the app writes today; anything else — including a key some later
 * caller adds without reading this — is dropped rather than rendered, because
 * "never put raw jsonb in front of a doctor" has to hold for values nobody here
 * has seen.
 */
export function describeAuditDetail(detail: unknown): string | null {
  if (detail === null || typeof detail !== "object" || Array.isArray(detail)) return null;
  const record = detail as Record<string, unknown>;
  const parts: string[] = [];

  // `Object.hasOwn` before the lookup, because a plain object literal inherits
  // from `Object.prototype`: `record.surface === "constructor"` otherwise
  // resolves to the Object constructor, `if (surface)` is true for a function,
  // and the audit row renders `function Object() { [native code] }` at a doctor.
  // `record` comes from a jsonb column, so its keys are whatever was written
  // there rather than a fixed set.
  const surfaceKey = asShortText(record.surface) ?? "";
  const surface = Object.hasOwn(SURFACE_PHRASES, surfaceKey)
    ? SURFACE_PHRASES[surfaceKey]
    : undefined;
  if (surface) parts.push(surface);

  const format = asShortText(record.format);
  if (format && /^[a-z0-9]{1,8}$/i.test(format)) parts.push(format.toUpperCase());

  const from = asIsoDay(record.from);
  const to = asIsoDay(record.to);
  if (from && to) parts.push(`${formatDayShort(from)} to ${formatDayShort(to)}`);

  const rows = asCount(record.row_count);
  if (rows !== null) parts.push(`${formatCount(rows)} row${rows === 1 ? "" : "s"}`);

  const encounters = asCount(record.encounter_count);
  if (encounters !== null) {
    parts.push(`${formatCount(encounters)} visit${encounters === 1 ? "" : "s"} read`);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Where a logged read came from. The export surface is deliberately absent: its
 * predicate already says the register was exported, and repeating it adds a
 * clause without adding a fact.
 */
const SURFACE_PHRASES: Record<string, string> = {
  visit_details: "from the visit screen",
  patient_history: "from the patient chart",
  recall: "through the assistant",
};

function asShortText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 64 ? value : null;
}

function asIsoDay(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function asCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export interface AuditCursor {
  at: string;
  id: number;
}

/**
 * Keyset pagination, because this list grows while it is being read.
 *
 * Two writers guarantee it: the trigger fires on every save anywhere in the
 * clinic, and opening this screen logs itself. Under `OFFSET` each of those
 * rows pushes the page boundary down and the doctor sees a row twice — so the
 * cursor names the last row instead, and a page means the same thing however
 * long they take to ask for the next one.
 *
 * `at` alone is not a key: `now()` is the transaction's start time, so one
 * statement touching five rows writes five entries sharing a timestamp to the
 * microsecond. `id` breaks those ties.
 */
export function encodeAuditCursor(entry: AuditCursor): string {
  return `${entry.id}@${entry.at}`;
}

/**
 * PostgREST filters are a string grammar, not bound parameters: a comma or a
 * bracket reaching `.or()` re-writes the query around it. `at` goes back into
 * exactly such a filter, so it is matched against the shape PostgREST emits for
 * a timestamptz rather than merely parsed as a date — `Date.parse` accepts
 * plenty of strings that also contain a comma.
 */
const CURSOR_PATTERN = /^(\d{1,19})@(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2}))$/;

export function parseAuditCursor(raw: string | null | undefined): AuditCursor | null {
  if (!raw) return null;
  const match = CURSOR_PATTERN.exec(raw);
  if (!match) return null;

  const id = Number(match[1]);
  if (!Number.isSafeInteger(id) || id <= 0) return null;

  return { id, at: match[2] };
}

const IST_STAMP = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

const IST_DAY = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Kolkata",
});

const IST_DAY_YEAR = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

const IST_YEAR = new Intl.DateTimeFormat("en-IN", { year: "numeric", timeZone: "Asia/Kolkata" });

/**
 * Narrow rather than long: the phone this is read on is 393px wide, and the row
 * has to fit a name, a verb and a record beside the time. `numeric: "auto"` is
 * what turns "1 day ago" into "yesterday", which is both shorter and how a
 * doctor would say it.
 */
const RELATIVE = new Intl.RelativeTimeFormat("en-IN", { numeric: "auto", style: "narrow" });

/**
 * The unambiguous form: fixed to IST because the clinic is, and labelled as such
 * so a row read on a phone that has travelled cannot be misread by an hour.
 */
export function formatAuditTimestamp(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "Unknown time";
  return `${IST_STAMP.format(time)} IST`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "4 minutes ago" for the recent past, a date once "ago" stops being useful.
 *
 * `now` is a parameter rather than a call to `Date.now()` so a list can render
 * every row against one instant, and so the caller decides how often the words
 * are re-computed — a label left to age in place turns into a false statement.
 */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "Unknown time";

  const elapsed = now - time;

  // A row written seconds ago by a server whose clock leads the browser's would
  // otherwise read "in 1 minute", which is not a thing that can have happened.
  if (elapsed < 45_000) return "just now";
  if (elapsed < HOUR) return RELATIVE.format(-Math.round(elapsed / MINUTE), "minute");
  if (elapsed < DAY) return RELATIVE.format(-Math.round(elapsed / HOUR), "hour");
  if (elapsed < 7 * DAY) return RELATIVE.format(-Math.round(elapsed / DAY), "day");

  return IST_YEAR.format(time) === IST_YEAR.format(now)
    ? IST_DAY.format(time)
    : IST_DAY_YEAR.format(time);
}

/**
 * A short handle for the record a row is about, so an owner can see that six
 * entries concern one chart. The full UUID is not shown: it is the identifier a
 * doctor would paste somewhere, and the first block is enough to group by eye.
 */
export function auditRecordRef(entityId: string | null): string | null {
  return entityId ? entityId.slice(0, 8) : null;
}
