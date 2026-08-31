import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { shiftDays, startOfDayInIndia, todayInIndia } from "@/lib/analytics";
import { procedureChip } from "@/lib/dental/procedure";
import type { RegisterEntry } from "@/lib/types";

/**
 * The day's register for one doctor: committed visits plus any drafts still
 * waiting to be confirmed.
 *
 * Drafts are included deliberately. A draft is a consultation that happened —
 * the doctor dictated it — and hiding it until confirmation is how a visit gets
 * forgotten between one patient and the next. It appears in the timeline marked
 * "Needs review", which is the honest way to show something that is real but
 * not yet signed.
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
       treatment, is_new_patient, visit_number, status,
       patients!encounters_patient_id_fkey ( full_name ),
       prescription_items!prescription_items_encounter_id_fkey ( drug_name, strength, frequency_label, position ),
       encounter_procedures!encounter_procedures_encounter_id_fkey ( procedure_name, tooth_fdi, surfaces, sitting_number, total_sittings, position )`,
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
    is_new_patient: row.is_new_patient,
    visit_number: row.visit_number,
    status: row.status,
    // Defensive spread of a *copy* of a possibly-absent embed. PostgREST returns
    // an embedded relation as an object, an array, or nothing depending on how
    // it infers the FK, and `[...undefined]` is a TypeError — which the old
    // `as unknown as` cast promised would never happen.
    procedures: [...(row.encounter_procedures ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((item) => procedureChip(item)),
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
  committedCount: number;
  draftCount: number;
  discardedCount: number;
  limit: number;
  offset: number;
}

interface RegisterSearchRow {
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
  procedures: string[] | null;
  total_count: number | string;
  committed_count?: number | string;
  draft_count?: number | string;
  discarded_count?: number | string;
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
  const offset = Math.max(options.offset ?? 0, 0);
  const from = shiftDays(todayInIndia(), -(days - 1));

  // The generated Supabase types predate migration 0012. Keep the runtime
  // call typed at this boundary so the checked-in generated schema is not
  // edited by hand (and can still be regenerated from the project).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- register_search is extended by migration 0012; generated types are intentionally not hand-edited.
  const db = supabase as any;
  const [{ data, error }, { data: totals, error: totalsError }] = await Promise.all([
    db.rpc("register_search", {
      p_doctor_id: doctorId,
      p_from: startOfDayInIndia(from),
      p_query: options.query?.trim() || null,
      p_status: options.status ?? null,
      p_limit: limit,
      p_offset: offset,
    }),
    db.rpc("register_totals", {
      p_doctor_id: doctorId,
      p_from: startOfDayInIndia(from),
      p_query: options.query?.trim() || null,
    }),
  ]);

  if (error) {
    console.error("[register] search failed", error.code);
    throw error;
  }

  if (totalsError) console.warn("[register] totals unavailable", totalsError.code);

  const rows = (data ?? []) as RegisterSearchRow[];
  const summary = (totals?.[0] ?? rows[0]) as RegisterSearchRow | undefined;
  const selectedCount = options.status === "committed"
    ? summary?.committed_count
    : options.status === "draft"
      ? summary?.draft_count
      : options.status === "discarded"
        ? summary?.discarded_count
        : summary?.total_count;
  return {
    entries: rows.map((row) => ({
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
      procedures: row.procedures ?? [],
    })),
    // An empty page can still have matches before its offset. Fall back to the
    // independently queried total for the selected status instead of claiming
    // there are zero results.
    totalCount: Number(rows[0]?.total_count ?? selectedCount ?? 0),
    committedCount: Number(summary?.committed_count ?? 0),
    draftCount: Number(summary?.draft_count ?? 0),
    discardedCount: Number(summary?.discarded_count ?? 0),
    limit,
    offset,
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
