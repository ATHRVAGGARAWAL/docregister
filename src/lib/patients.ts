import "server-only";

import { shiftDays, startOfDayInIndia, todayInIndia } from "@/lib/analytics";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The clinic's patient directory.
 *
 * Everything that decides *which* charts come back — the substring probe, the
 * trigram fallback, the phone match, the ordering — lives in `list_patients`
 * (0010) rather than here, for the same reason the register's search moved into
 * Postgres: a page fetched first and filtered afterwards can only ever search
 * the page, and its count describes the slice rather than the query.
 */

/** One row of the directory. Deliberately the shape `PatientHistorySheet`
 *  already accepts, so a row opens a chart without being re-shaped first. */
export interface PatientSummary {
  id: string;
  full_name: string;
  phone: string | null;
  age_years: number | null;
  /** Most recent *committed* visit, or null for a chart with none yet. */
  last_visit: string | null;
  visit_count: number;
}

export interface PatientDirectoryResult {
  patients: PatientSummary[];
  /** Charts matching the search, not the number returned. */
  totalCount: number;
}

interface ListPatientsRow {
  id: string;
  full_name: string;
  phone: string | null;
  age_years: number | null;
  last_visit: string | null;
  visit_count: number | string;
  total_count: number | string;
}

/**
 * The floor for a "seen in the last N days" filter, as an IST day boundary.
 *
 * Days, not hours: "today" has to mean the clinic's calendar day, so a visit at
 * 09:00 is still in range at 18:00. `startOfDayInIndia` is the same helper the
 * register and the accounts ledger already use, so the three surfaces cannot
 * disagree about where a day starts.
 */
function sinceFor(days: number | undefined): string | null {
  if (!days || !Number.isFinite(days) || days < 1) return null;
  const clamped = Math.min(Math.floor(days), 3650);
  return startOfDayInIndia(shiftDays(todayInIndia(), -(clamped - 1)));
}

export async function loadPatients(
  supabase: SupabaseClient,
  options: { search?: string; limit?: number; offset?: number; days?: number } = {},
): Promise<PatientDirectoryResult> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);

  const { data, error } = await supabase.rpc("list_patients", {
    // An empty box means "everyone", so an empty string has to reach the
    // function as null rather than as a search nothing can match.
    p_search: options.search?.trim() || null,
    p_limit: limit,
    p_offset: Math.max(options.offset ?? 0, 0),
    // Filtered in Postgres, not here. The list is paginated server-side, so a
    // filter applied after the fetch would narrow this page and then report
    // `total_count` for the unfiltered query — "showing 3 of 214".
    p_since: sinceFor(options.days),
  });

  if (error) {
    // The code, not the message: a Postgres error message can quote the row it
    // choked on, and every row here is a patient.
    console.error("[patients] list failed", error.code);
    throw error;
  }

  const rows = (data ?? []) as ListPatientsRow[];
  return {
    patients: rows.map((row) => ({
      id: row.id,
      full_name: row.full_name,
      phone: row.phone,
      last_visit: row.last_visit,
      age_years: row.age_years,
      // `bigint` arrives as a string over PostgREST once it is large enough to
      // be unsafe as a JSON number, so it is coerced rather than trusted.
      visit_count: Number(row.visit_count ?? 0),
    })),
    // Zero rows is a real answer — nobody matched — and the count that goes
    // with it is zero, not the previous page's total.
    totalCount: Number(rows[0]?.total_count ?? 0),
  };
}
