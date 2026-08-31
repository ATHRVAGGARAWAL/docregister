import type { SupabaseClient } from "@supabase/supabase-js";

import type { PatientSummary } from "@/lib/patients";
import type { AccountEntry, RegisterEntry } from "@/lib/types";

/**
 * One box that searches the whole clinic: charts, visits, and the ledger.
 *
 * Three questions in one round trip, because the doctor asking them does not
 * know which one they are asking. "Sunita" is a chart, "amoxicillin" is a
 * prescription across many visits, and "cylinder refill" is an expense — and a
 * search that makes them pick the workspace first is a search that only works
 * once you already know the answer.
 *
 * Nothing new is added to the database. Each group is the workspace's own RPC
 * called with its own filters left open, so a hit here and the row the doctor
 * lands on afterwards are matched by exactly the same SQL. A fourth "search
 * everything" function would be a second definition of "matches", and the two
 * would drift.
 *
 * Deliberately free of runtime imports — no `server-only`, no date helpers — so
 * the ranking below can be unit tested directly under `node --test`. That
 * matters more than the marker: every function here is handed its Supabase
 * client, so there is no credential and no privileged default to leak into a
 * bundle. The only caller is the route, which is server-only by construction.
 *
 *
 * TENANCY
 *
 * There is no clinic filter anywhere in this file, and that is the point.
 *
 * All three RPCs are `security invoker`, so they run as the signed-in doctor
 * and every row they can read has already passed row-level security:
 * `patients_read`, `encounters_read` and `prescription_items_read` (0011) admit
 * only `clinic_id = auth_clinic_id()`, and `account_entries_read_own` (0020)
 * requires `auth_clinic_id()` *and* `doctor_id = auth.uid()`. `register_search`
 * and `account_entries_search` re-assert the owning doctor in their own bodies
 * on top of that.
 *
 * `auth.uid()` is derived from the session cookie the route's client was built
 * with, so it is not something a caller can set. `doctorId` below is read from
 * the `doctors` row by `getCurrentDoctor()` and exists only to satisfy
 * `register_search`'s assertion that its argument equals `auth.uid()` — it
 * never narrows the rows.
 *
 * Re-deriving the boundary here would not add a check, it would add a second
 * definition of one. `auth_clinic_id()` is a single function that every
 * clinic-scoped policy compares against, which is why 0023 could make a pending
 * member see nothing by changing that function alone. A clinic id filtered in
 * TypeScript would not have moved with it.
 */

export type SearchGroupKey = "patients" | "visits" | "accounts";

/**
 * Rank order for the groups, which is the "type" half of "type then recency".
 *
 * Charts first: a name is the most common thing typed into this box, and a
 * chart is the only result that leads somewhere the others cannot — every visit
 * and every linked payment is reachable from it. Visits next, because they are
 * the clinical record. Money last, because a doctor mid-consultation is not
 * looking for it.
 */
export const SEARCH_GROUP_ORDER = ["patients", "visits", "accounts"] as const;

/** Matches `q` length limits used by the workspace searches this reuses. */
export const SEARCH_QUERY_MAX_LENGTH = 120;

/** Per-group cap. Enough to recognise the right row, few enough to scan. */
export const SEARCH_GROUP_CAP = 8;

/** Ceiling on a caller-supplied cap, so one request cannot page the clinic. */
export const SEARCH_GROUP_CAP_MAX = 25;

interface SearchHitBase {
  id: string;
  /**
   * The timestamp this hit is ranked by, or null when the row honestly has
   * none. Kept at the top level rather than read out of each payload so the
   * comparator never has to know which kind of row it is holding.
   */
  occurred_at: string | null;
}

/** A chart. Shaped as the directory already returns it, so a hit opens a chart. */
export interface PatientSearchHit extends SearchHitBase {
  type: "patient";
  patient: PatientSummary;
}

/** A visit, in the shape the register timeline already renders. */
export interface VisitSearchHit extends SearchHitBase {
  type: "visit";
  occurred_at: string;
  visit: RegisterEntry;
}

/** A ledger line, in the shape the accounts workspace already renders. */
export interface AccountSearchHit extends SearchHitBase {
  type: "account";
  occurred_at: string;
  entry: AccountEntry;
}

export type SearchHit = PatientSearchHit | VisitSearchHit | AccountSearchHit;

export interface SearchGroup {
  key: SearchGroupKey;
  /** Capped at the request's limit, most recent first. */
  hits: SearchHit[];
  /**
   * Matches in the database, which is usually more than `hits.length`. Zero
   * means "nothing matched"; it never means "nothing was returned on this page".
   */
  totalCount: number;
  /** More matched than came back, so "8 of 214" can be said honestly. */
  truncated: boolean;
  /**
   * This group could not be searched, so its counts say nothing about it. A
   * failing ledger must not silently turn into "no payments found" while the
   * doctor is looking at a real one.
   */
  unavailable: boolean;
}

export interface SearchResults {
  /** The normalised query the results answer, not the raw one. */
  query: string;
  /** Always all three groups, in `SEARCH_GROUP_ORDER`, even when empty. */
  groups: SearchGroup[];
  /** Matches across the groups that answered. */
  totalCount: number;
  truncated: boolean;
  /** Groups that failed, so the interface can say which part is missing. */
  unavailable: SearchGroupKey[];
}

const GROUP_OF: Record<SearchHit["type"], SearchGroupKey> = {
  patient: "patients",
  visit: "visits",
  account: "accounts",
};

/**
 * Collapse whitespace and trim.
 *
 * Every RPC behind this builds an `ilike '%' || query || '%'` probe, so an
 * interior double space is a search that cannot match text stored with one.
 * Anything that is not a string is an empty search rather than an error — the
 * caller validates length; this only has to be total.
 */
export function normaliseSearchQuery(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
}

/**
 * Rank, group and cap. Pure, and the whole reason this file has no imports
 * that run.
 *
 * `totals` carries each group's true match count from its RPC's window
 * aggregate. Without it a capped group would report its own page size as the
 * total — the same "count describes the slice rather than the query" bug the
 * register and the patient directory each had to move into Postgres to fix.
 */
export function buildSearchResults(
  query: string,
  hits: readonly SearchHit[],
  options: {
    cap?: number;
    totals?: Partial<Record<SearchGroupKey, number>>;
    unavailable?: readonly SearchGroupKey[];
  } = {},
): SearchResults {
  const cap = clampCap(options.cap);
  const unavailable = SEARCH_GROUP_ORDER.filter((key) => options.unavailable?.includes(key));

  const groups = SEARCH_GROUP_ORDER.map<SearchGroup>((key) => {
    const matching = hits.filter((hit) => GROUP_OF[hit.type] === key);

    // Patients arrive already ranked and must not be re-sorted.
    //
    // `list_patients` orders by `rank desc, last_visit desc nulls last,
    // full_name` and does NOT return `rank` as a column, so the row order it
    // produces is the only carrier of relevance that reaches this function.
    // Sorting by recency here discards exactly the ranking that RPC exists to
    // compute: a doctor typing "sun" would get whichever Sunita was seen most
    // recently rather than the closest match to what they typed.
    //
    // Visits and accounts are different — those are chronological records and
    // recency IS their relevance, so the sort stays for them.
    const ranked = (key === "patients" ? matching : [...matching].sort(byRecencyThenId)).slice(
      0,
      cap,
    );
    const isUnavailable = unavailable.includes(key);
    // A group that failed has no honest count of its own, and reporting the
    // rows it did not return as zero would read as "none found".
    const totalCount = isUnavailable
      ? 0
      : Math.max(options.totals?.[key] ?? matching.length, ranked.length);

    return { key, hits: ranked, totalCount, truncated: totalCount > ranked.length, unavailable: isUnavailable };
  });

  return {
    query,
    groups,
    totalCount: groups.reduce((sum, group) => sum + group.totalCount, 0),
    truncated: groups.some((group) => group.truncated),
    unavailable,
  };
}

/**
 * Recency descending, then id, within a group.
 *
 * The id tiebreak is not cosmetic: several visits can share a timestamp to the
 * second, and `Array.prototype.sort` only promises stability with respect to
 * the input order — which here is Postgres row order across three independent
 * queries. Without it the same query can reorder itself between keystrokes.
 *
 * A missing timestamp sorts last. A chart with no committed visit is a real
 * chart and must still be findable, but it cannot claim to be the most recent
 * thing on the list.
 */
function byRecencyThenId(a: SearchHit, b: SearchHit): number {
  const left = timeOf(a);
  const right = timeOf(b);
  if (left !== right) return right - left;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function timeOf(hit: SearchHit): number {
  if (!hit.occurred_at) return Number.NEGATIVE_INFINITY;
  const ms = Date.parse(hit.occurred_at);
  // An unparseable timestamp is treated as absent rather than as NaN, which
  // would poison the comparator and leave the order undefined.
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
}

function clampCap(value: unknown): number {
  return Math.min(Math.max(Math.floor(Number(value)) || SEARCH_GROUP_CAP, 1), SEARCH_GROUP_CAP_MAX);
}

/**
 * The search window is the whole record.
 *
 * The register and the ledger both take an explicit window because their
 * workspaces page by date. A search box has no date control, and a doctor
 * typing a drug name wants every time they prescribed it — so the bounds are
 * set wide enough to be equivalent to no filter rather than to a default that
 * would quietly hide last year's visits. Postgres `timestamptz` spans 4713 BC
 * to 294276 AD, so both ends are ordinary values rather than sentinels.
 */
const SEARCH_FROM = "0001-01-01T00:00:00Z";
const SEARCH_TO = "9999-12-31T23:59:59Z";

interface RpcResult<T> {
  data: T | null;
  error: { code: string; message: string } | null;
}

/**
 * Structural view of `supabase.rpc`, for the same reason `callWorkflow` has
 * one: several of these functions are newer than the checked-in generated
 * types, and hand-editing generated types is how they stop being regenerable.
 * `callWorkflow` itself is `server-only`, which this file cannot be.
 */
type SearchRpc = <T>(name: string, args: Record<string, unknown>) => PromiseLike<RpcResult<T>>;

interface PatientRow {
  id: string;
  full_name: string;
  phone: string | null;
  age_years: number | null;
  last_visit: string | null;
  visit_count: number | string;
  total_count: number | string;
}

interface VisitRow {
  id: string;
  occurred_at: string;
  patient_id: string | null;
  patient_name: string;
  age_years: number | null;
  diagnosis: string | null;
  treatment: string | null;
  is_new_patient: boolean | null;
  visit_number: number | null;
  status: RegisterEntry["status"];
  drugs: string[] | null;
  total_count: number | string;
}

interface AccountRow extends Omit<AccountEntry, "amount_paise"> {
  amount_paise: number | string;
  total_count: number | string;
}

/**
 * Search patients, visits and account entries in one call.
 *
 * The three queries are independent, so they are issued together and each one
 * is allowed to fail on its own. A doctor searching for a chart should still
 * get the chart when the ledger function is missing a migration; the group that
 * failed comes back flagged rather than empty.
 */
export async function searchEverything(
  supabase: SupabaseClient,
  doctorId: string,
  options: { query?: string; limit?: number } = {},
): Promise<SearchResults> {
  const query = normaliseSearchQuery(options.query);
  const cap = clampCap(options.limit);

  // An empty box has an answer — nothing — and it is not worth three queries
  // whose `ilike '%%'` would match the entire clinic.
  if (!query) return buildSearchResults(query, [], { cap });

  const rpc = supabase.rpc.bind(supabase) as unknown as SearchRpc;
  const [patients, visits, accounts] = await Promise.all([
    rpc<PatientRow[]>("list_patients", {
      p_search: query,
      p_limit: cap,
      p_offset: 0,
    }),
    rpc<VisitRow[]>("register_search", {
      p_doctor_id: doctorId,
      p_from: SEARCH_FROM,
      p_query: query,
      // Null rather than a status: `register_search` reads that as "committed
      // and draft", which is the register a doctor recognises. A discarded
      // draft was explicitly thrown away and only its own view should offer it.
      p_status: null,
      p_limit: cap,
      p_offset: 0,
    }),
    rpc<AccountRow[]>("account_entries_search", {
      p_from: SEARCH_FROM,
      p_to: SEARCH_TO,
      p_kind: null,
      p_status: null,
      p_query: query,
      p_limit: cap,
      p_offset: 0,
    }),
  ]);

  const hits: SearchHit[] = [];
  const totals: Partial<Record<SearchGroupKey, number>> = {};
  const unavailable: SearchGroupKey[] = [];

  const patientRows = rowsOf("patients", patients);
  if (patientRows) {
    totals.patients = countOf(patientRows[0]?.total_count, patientRows.length);
    hits.push(...patientRows.map(toPatientHit));
  } else {
    unavailable.push("patients");
  }

  const visitRows = rowsOf("visits", visits);
  if (visitRows) {
    totals.visits = countOf(visitRows[0]?.total_count, visitRows.length);
    hits.push(...visitRows.map(toVisitHit));
  } else {
    unavailable.push("visits");
  }

  const accountRows = rowsOf("accounts", accounts);
  if (accountRows) {
    totals.accounts = countOf(accountRows[0]?.total_count, accountRows.length);
    hits.push(...accountRows.map(toAccountHit));
  } else {
    unavailable.push("accounts");
  }

  return buildSearchResults(query, hits, { cap, totals, unavailable });
}

/**
 * The rows, or null when the group failed.
 *
 * The code is logged, never the message: a Postgres error message quotes the
 * value it choked on, and here that value is a doctor's search over patient
 * data.
 */
function rowsOf<Row>(group: SearchGroupKey, result: RpcResult<Row[]>): Row[] | null {
  if (result.error) {
    console.error("[search]", group, "failed", result.error.code);
    return null;
  }
  return result.data ?? [];
}

/**
 * `bigint` arrives from PostgREST as a string once it is too large to be a safe
 * JSON number, so a window aggregate is coerced rather than trusted.
 */
function countOf(value: number | string | null | undefined, fallback: number): number {
  const total = Number(value);
  return Number.isFinite(total) ? total : fallback;
}

function toPatientHit(row: PatientRow): PatientSearchHit {
  return {
    type: "patient",
    id: row.id,
    // A chart's recency is its last *committed* visit, which is what
    // `list_patients` reports. A chart whose only encounter is an unreviewed
    // draft has honestly never been visited, and ranks accordingly.
    occurred_at: row.last_visit,
    patient: {
      id: row.id,
      full_name: row.full_name,
      phone: row.phone,
      age_years: row.age_years,
      last_visit: row.last_visit,
      visit_count: countOf(row.visit_count, 0),
    },
  };
}

function toVisitHit(row: VisitRow): VisitSearchHit {
  return {
    type: "visit",
    id: row.id,
    occurred_at: row.occurred_at,
    visit: {
      id: row.id,
      occurred_at: row.occurred_at,
      patient_id: row.patient_id,
      patient_name: row.patient_name,
      age_years: row.age_years,
      diagnosis: row.diagnosis,
      treatment: row.treatment,
      is_new_patient: row.is_new_patient,
      visit_number: row.visit_number,
      status: row.status,
      drugs: row.drugs ?? [],
      // Global search runs its own SQL and does not join procedures. An empty
      // list here is honest — the command palette shows a visit's identity and
      // diagnosis, and the register is where the per-tooth work is read.
      procedures: [],
    },
  };
}

/**
 * Field by field rather than by spread: the ledger row carries a window
 * aggregate the payload has no business repeating, and a column added to
 * `account_entries` later should have to be named here before it reaches a
 * browser.
 */
function toAccountHit(row: AccountRow): AccountSearchHit {
  return {
    type: "account",
    id: row.id,
    occurred_at: row.occurred_at,
    entry: {
      id: row.id,
      kind: row.kind,
      status: row.status,
      amount_paise: countOf(row.amount_paise, 0),
      currency: row.currency,
      category: row.category,
      payment_method: row.payment_method,
      counterparty: row.counterparty,
      note: row.note,
      patient_id: row.patient_id,
      encounter_id: row.encounter_id,
      source: row.source,
      occurred_at: row.occurred_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
  };
}
