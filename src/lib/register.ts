import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { shiftDays, startOfDayInIndia, todayInIndia } from "@/lib/analytics";
import type { RegisterEntry } from "@/lib/types";

/**
 * The day's register for one doctor: committed visits plus any drafts still
 * waiting to be confirmed.
 *
 * Drafts are included deliberately. A draft is a consultation that happened —
 * the doctor dictated it — and hiding it until confirmation is how a visit gets
 * forgotten between one patient and the next. It appears in the timeline marked
 * "Needs review" and is excluded from every total, which is the honest way to
 * show something that is real but not yet signed.
 */

export async function loadTodayRegister(
  supabase: SupabaseClient,
  doctorId: string,
): Promise<RegisterEntry[]> {
  return loadRegister(supabase, doctorId, { days: 1 });
}

export async function loadRegister(
  supabase: SupabaseClient,
  doctorId: string,
  options: { days?: number; limit?: number } = {},
): Promise<RegisterEntry[]> {
  const days = Math.min(Math.max(options.days ?? 30, 1), 365);
  const limit = Math.min(Math.max(options.limit ?? 300, 1), 500);
  const from = shiftDays(todayInIndia(), -(days - 1));

  const { data, error } = await supabase
    .from("encounters")
    .select(
      `id, occurred_at, patient_id, patient_name_spoken, age_years, diagnosis,
       treatment, fees_inr, is_new_patient, visit_number, status,
       patients ( full_name ),
       prescription_items ( drug_name, strength, frequency_label, position )`,
    )
    .eq("doctor_id", doctorId)
    .gte("occurred_at", startOfDayInIndia(from))
    .in("status", ["committed", "draft"])
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[register] load failed", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    occurred_at: row.occurred_at,
    // The linked chart name wins over the transcribed one: once a doctor has
    // confirmed which patient this is, their spelling is the record.
    patient_name: embedded(row.patients)?.full_name ?? row.patient_name_spoken ?? "Unnamed",
    patient_id: row.patient_id,
    age_years: row.age_years,
    diagnosis: row.diagnosis,
    treatment: row.treatment,
    fees_inr: row.fees_inr === null ? null : Number(row.fees_inr),
    is_new_patient: row.is_new_patient,
    visit_number: row.visit_number,
    status: row.status,
    // Defensive spread of a *copy* of a possibly-absent embed. PostgREST returns
    // an embedded relation as an object, an array, or nothing depending on how
    // it infers the FK, and `[...undefined]` is a TypeError — which the old
    // `as unknown as` cast promised would never happen.
    drugs: [...(row.prescription_items ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((item) =>
        [item.drug_name, item.strength, item.frequency_label]
          .filter((part) => part && part !== "—")
          .join(" "),
      ),
  }));
}

/** What the register workspace needs: the page, and honest totals for the query. */
export interface RegisterSearchResult {
  entries: RegisterEntry[];
  /** Visits matching the filters, not the number returned. */
  totalCount: number;
  /** Fees across every match, not just this page. */
  totalFees: number;
}

interface RegisterSearchRow {
  id: string;
  occurred_at: string;
  patient_id: string | null;
  patient_name: string;
  age_years: number | null;
  diagnosis: string | null;
  treatment: string | null;
  fees_inr: number | string | null;
  is_new_patient: boolean | null;
  visit_number: number | null;
  status: RegisterEntry["status"];
  drugs: string[] | null;
  total_count: number | string;
  total_fees: number | string | null;
}

/**
 * Search the register in Postgres.
 *
 * The route used to load a capped page and filter it in JavaScript, which meant
 * a search never looked past the newest 300 encounters and the totals described
 * the page rather than the query. `register_search` (0009) does both in one
 * statement, so the counts are window aggregates over everything that matched.
 */
export async function searchRegister(
  supabase: SupabaseClient,
  doctorId: string,
  options: { days?: number; query?: string; status?: string | null; limit?: number; offset?: number } = {},
): Promise<RegisterSearchResult> {
  const days = Math.min(Math.max(options.days ?? 30, 1), 365);
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 500);
  const from = shiftDays(todayInIndia(), -(days - 1));

  const { data, error } = await supabase.rpc("register_search", {
    p_doctor_id: doctorId,
    p_from: startOfDayInIndia(from),
    p_query: options.query?.trim() || null,
    p_status: options.status ?? null,
    p_limit: limit,
    p_offset: Math.max(options.offset ?? 0, 0),
  });

  if (error) {
    console.error("[register] search failed", error.code);
    throw error;
  }

  const rows = (data ?? []) as RegisterSearchRow[];
  return {
    entries: rows.map((row) => ({
      id: row.id,
      occurred_at: row.occurred_at,
      patient_id: row.patient_id,
      patient_name: row.patient_name,
      age_years: row.age_years,
      diagnosis: row.diagnosis,
      treatment: row.treatment,
      // `numeric` arrives as a string over PostgREST.
      fees_inr: row.fees_inr === null ? null : Number(row.fees_inr),
      is_new_patient: row.is_new_patient,
      visit_number: row.visit_number,
      status: row.status,
      drugs: row.drugs ?? [],
    })),
    totalCount: Number(rows[0]?.total_count ?? 0),
    totalFees: Number(rows[0]?.total_fees ?? 0),
  };
}

/**
 * Normalise a PostgREST embedded to-one relation.
 *
 * It comes back as an object when the foreign key is inferred as to-one and as
 * a single-element array when it is not, and which one you get depends on
 * schema metadata rather than on anything at the call site. The old code
 * assumed "object" behind an `as unknown as` cast, so the array case would have
 * silently rendered every patient as "Unnamed" with no error anywhere.
 */
function embedded<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
