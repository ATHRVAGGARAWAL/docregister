import assert from "node:assert/strict";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildSearchResults,
  normaliseSearchQuery,
  searchEverything,
  SEARCH_GROUP_ORDER,
  type SearchHit,
  type SearchResults,
} from "../../src/lib/search.ts";

/**
 * Global search is the one screen where three unrelated tables are shown as one
 * list, so the properties worth asserting are the ones that survive that: which
 * section a row lands in, what order rows come back in, and whether a count is
 * describing the query or just the page it happened to return.
 */

function patientHit(id: string, lastVisit: string | null): SearchHit {
  return {
    type: "patient",
    id,
    occurred_at: lastVisit,
    patient: {
      id,
      full_name: `Patient ${id}`,
      phone: null,
      age_years: 40,
      last_visit: lastVisit,
      visit_count: lastVisit ? 1 : 0,
    },
  };
}

function visitHit(id: string, occurredAt: string): SearchHit {
  return {
    type: "visit",
    id,
    occurred_at: occurredAt,
    visit: {
      id,
      occurred_at: occurredAt,
      patient_id: null,
      patient_name: "Sunita Devi",
      age_years: 40,
      diagnosis: "Fever",
      treatment: "Rest",
      is_new_patient: false,
      visit_number: 2,
      status: "committed",
      drugs: ["Paracetamol 500mg"],
    },
  };
}

function accountHit(id: string, occurredAt: string): SearchHit {
  return {
    type: "account",
    id,
    occurred_at: occurredAt,
    entry: {
      id,
      kind: "income",
      status: "paid",
      amount_paise: 30_000,
      currency: "INR",
      category: "Consultation",
      payment_method: "upi",
      counterparty: "Sunita Devi",
      note: null,
      patient_id: null,
      encounter_id: null,
      source: "manual",
      occurred_at: occurredAt,
      created_at: occurredAt,
      updated_at: occurredAt,
    },
  };
}

function groupIds(results: SearchResults, key: (typeof SEARCH_GROUP_ORDER)[number]): string[] {
  return results.groups.find((group) => group.key === key)?.hits.map((hit) => hit.id) ?? [];
}

test("results are grouped by type in rank order and by recency inside a group", () => {
  const results = buildSearchResults("sunita", [
    accountHit("a-old", "2026-01-02T10:00:00.000Z"),
    visitHit("v-old", "2026-03-01T09:00:00.000Z"),
    patientHit("p-old", "2026-02-01T09:00:00.000Z"),
    visitHit("v-new", "2026-08-20T09:00:00.000Z"),
    accountHit("a-new", "2026-08-01T10:00:00.000Z"),
    patientHit("p-new", "2026-08-25T09:00:00.000Z"),
  ]);

  assert.deepEqual(
    results.groups.map((group) => group.key),
    ["patients", "visits", "accounts"],
  );
  assert.deepEqual(groupIds(results, "patients"), ["p-new", "p-old"]);
  assert.deepEqual(groupIds(results, "visits"), ["v-new", "v-old"]);
  assert.deepEqual(groupIds(results, "accounts"), ["a-new", "a-old"]);
  assert.equal(results.totalCount, 6);
  assert.equal(results.truncated, false);
});

test("a chart with no committed visit is still found, but ranks last", () => {
  const results = buildSearchResults("sun", [
    patientHit("never-seen", null),
    patientHit("seen", "2026-08-25T09:00:00.000Z"),
  ]);

  assert.deepEqual(groupIds(results, "patients"), ["seen", "never-seen"]);
});

test("hits sharing a timestamp keep a stable order regardless of input order", () => {
  const at = "2026-08-25T09:00:00.000Z";
  const forward = buildSearchResults("q", [visitHit("b", at), visitHit("a", at), visitHit("c", at)]);
  const reversed = buildSearchResults("q", [visitHit("c", at), visitHit("a", at), visitHit("b", at)]);

  assert.deepEqual(groupIds(forward, "visits"), ["a", "b", "c"]);
  assert.deepEqual(groupIds(reversed, "visits"), ["a", "b", "c"]);
});

test("an unparseable timestamp is ranked as absent instead of poisoning the order", () => {
  const results = buildSearchResults("q", [
    visitHit("broken", "not a date"),
    visitHit("real", "2026-08-25T09:00:00.000Z"),
  ]);

  assert.deepEqual(groupIds(results, "visits"), ["real", "broken"]);
});

test("a capped group reports the query's total, not the page it returned", () => {
  const hits = Array.from({ length: 5 }, (_, index) =>
    visitHit(`v-${index}`, `2026-08-2${index}T09:00:00.000Z`),
  );
  const results = buildSearchResults("fever", hits, { cap: 2, totals: { visits: 214 } });
  const visits = results.groups.find((group) => group.key === "visits");

  assert.equal(visits?.hits.length, 2);
  assert.deepEqual(groupIds(results, "visits"), ["v-4", "v-3"]);
  assert.equal(visits?.totalCount, 214);
  assert.equal(visits?.truncated, true);
  assert.equal(results.truncated, true);
});

test("an empty search still answers with every group, and answers zero", () => {
  const results = buildSearchResults("", []);

  assert.deepEqual(
    results.groups.map((group) => group.key),
    [...SEARCH_GROUP_ORDER],
  );
  assert.deepEqual(
    results.groups.map((group) => [group.hits.length, group.totalCount, group.truncated, group.unavailable]),
    [
      [0, 0, false, false],
      [0, 0, false, false],
      [0, 0, false, false],
    ],
  );
  assert.equal(results.query, "");
  assert.equal(results.totalCount, 0);
  assert.equal(results.truncated, false);
  assert.deepEqual(results.unavailable, []);
});

test("the query is collapsed before it becomes a substring probe", () => {
  assert.equal(normaliseSearchQuery("  sunita   devi \n"), "sunita devi");
  assert.equal(normaliseSearchQuery("   "), "");
  assert.equal(normaliseSearchQuery(undefined), "");
  assert.equal(normaliseSearchQuery(42), "");
});

test("an empty query is answered without querying the database", async () => {
  const client = {
    rpc() {
      throw new Error("an empty search reached the database");
    },
  } as unknown as SupabaseClient;

  const results = await searchEverything(client, "doctor-1", { query: "   " });

  assert.equal(results.totalCount, 0);
  assert.equal(results.groups.length, SEARCH_GROUP_ORDER.length);
});

test("a group that fails is flagged rather than reported as no matches", async () => {
  const client = {
    rpc(name: string) {
      if (name === "account_entries_search") {
        return Promise.resolve({ data: null, error: { code: "42883", message: "no such function" } });
      }
      if (name === "list_patients") {
        return Promise.resolve({
          data: [
            {
              id: "p-1",
              full_name: "Sunita Devi",
              phone: "+91 98765 43210",
              age_years: 41,
              last_visit: "2026-08-25T09:00:00.000Z",
              // PostgREST hands back `bigint` as a string once it is large
              // enough to be unsafe as a JSON number.
              visit_count: "7",
              total_count: "3",
            },
          ],
          error: null,
        });
      }
      return Promise.resolve({ data: [], error: null });
    },
  } as unknown as SupabaseClient;

  const errors: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void errors.push(args);
  let results: SearchResults;
  try {
    results = await searchEverything(client, "doctor-1", { query: "sunita" });
  } finally {
    console.error = original;
  }

  const accounts = results.groups.find((group) => group.key === "accounts");
  assert.equal(accounts?.unavailable, true);
  assert.deepEqual(results.unavailable, ["accounts"]);

  const patients = results.groups.find((group) => group.key === "patients");
  assert.equal(patients?.unavailable, false);
  assert.equal(patients?.totalCount, 3);
  assert.equal(patients?.truncated, true);
  assert.deepEqual(groupIds(results, "patients"), ["p-1"]);

  const top = patients?.hits[0];
  assert.equal(top?.type, "patient");
  assert.equal(top?.type === "patient" ? top.patient.visit_count : null, 7);

  // The failure is logged by code only; a Postgres message can quote the
  // doctor's search terms back, and here those are patient data.
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.includes("no such function"), false);
});
