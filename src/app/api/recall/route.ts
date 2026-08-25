import { NextResponse } from "next/server";

import { ApiError, readBody, requireString, withDoctor } from "@/lib/api/http";
import { answerFromRecords, parseRecallQuery, type EncounterRecord } from "@/lib/llm/recall";

/**
 * POST /api/recall  { question }
 * -> { answer, confidence, caveat, encounters, resolvedPatient, candidates }
 *
 * "What did I prescribe Sunita Devi last time?"
 *
 * Three steps, and the middle one is ordinary SQL:
 *
 *   1. LLM parses the question into a filter (patient, intent, window, limit).
 *   2. Postgres resolves the name to a patient and returns their visits.
 *   3. LLM summarises only those rows.
 *
 * No vector store. The retrieval unit is a patient, not a passage; a patient
 * has 5–50 encounters, all of which fit in context; the ranking a doctor wants
 * is recency, which is an ORDER BY; and the genuinely hard part — mapping a
 * spoken name to a chart — is fuzzy string matching, where embeddings are
 * actively worse ("Rajesh Kumar" and "Ramesh Kumar" are near-neighbours in
 * embedding space and different people in a waiting room). Every embedding
 * would also be a second copy of patient data to keep inside India.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * pg_trgm similarity at or above which a name is treated as the same name
 * rather than a lookalike. Below 1.0 so ordinary dictation noise — a missing
 * middle initial, "Devi" vs "Devii" — still counts as exact.
 */
const CONFIDENT_MATCH = 0.85;

/**
 * How far ahead of the runner-up the leader must be to answer without asking.
 * Surname-cohort noise trails an exact hit by ~0.6; two patients with the same
 * name are separated by ~0, which is what must still reach the doctor.
 */
const DECISIVE_GAP = 0.25;

export const POST = withDoctor(async ({ doctor, supabase, request }) => {
  const body = await readBody<{ question?: string; patientId?: string }>(request);
  const question = requireString(body.question, "question");
  if (question.length > 500) throw new ApiError("That question is too long.");

  const query = await parseRecallQuery(question);

  // --- Resolve the patient -------------------------------------------------
  let patientId = body.patientId ?? null;
  let candidates: {
    id: string;
    full_name: string;
    phone: string | null;
    similarity: number;
  }[] = [];

  if (!patientId && query.patient_name) {
    const { data: matches } = await supabase.rpc("match_patients", {
      p_name: query.patient_name,
      p_phone: null,
      p_limit: 5,
    });
    candidates = matches ?? [];

    if (candidates.length === 0) {
      return NextResponse.json({
        answer: `No patient named "${query.patient_name}" is in your register.`,
        confidence: "low",
        caveat: "Try a different spelling, or search by phone number.",
        encounters: [],
        resolvedPatient: null,
        candidates: [],
        query,
      });
    }

    // One clear match is used directly; anything genuinely ambiguous is handed
    // back so the doctor picks. Guessing between two patients is the one
    // failure mode this feature must not have.
    //
    // "Clear" cannot mean `candidates.length === 1`. Trigram search on Indian
    // names returns the whole surname cohort — "Rajesh Kumar" pulls back Rohit
    // Kumar, Anita Kumar, Manjit Kumar — so a count test would show a picker on
    // every single query and the feature would never answer anything directly.
    // What actually distinguishes the two cases is the *shape* of the scores:
    // an exact hit sits at ~1.0 with the surname cohort trailing at ~0.3, while
    // two real patients called Rajesh Kumar both sit at 1.0. So resolve only
    // when the leader is near-exact AND well clear of the runner-up; two
    // near-exact matches remain a tie and still go to the doctor.
    const [top, next] = candidates;
    const decisive =
      top.similarity >= CONFIDENT_MATCH &&
      (next === undefined || top.similarity - next.similarity >= DECISIVE_GAP);

    if (decisive) {
      patientId = top.id;
      candidates = [top];
    } else {
      return NextResponse.json({
        answer: `More than one patient matches "${query.patient_name}".`,
        confidence: "low",
        caveat: "Choose the right patient and I will pull up their history.",
        encounters: [],
        resolvedPatient: null,
        candidates,
        query,
      });
    }
  }

  // --- Fetch the rows ------------------------------------------------------
  let select = supabase
    .from("encounters")
    .select(
      `id, occurred_at, diagnosis, treatment, fees_inr, visit_number,
       patients!inner ( id, full_name ),
       prescription_items ( drug_name, strength, frequency_label, frequency_spoken, duration, instructions )`,
    )
    .eq("status", "committed")
    .order("occurred_at", { ascending: false })
    .limit(Math.min(Math.max(query.limit || 5, 1), 20));

  if (patientId) select = select.eq("patient_id", patientId);
  // Without a patient the question is about this doctor's own practice
  // ("how many fevers did I see last week"), so scope it to them rather than
  // the whole clinic.
  else select = select.eq("doctor_id", doctor.id);

  if (query.time_range_days) {
    const since = new Date(Date.now() - query.time_range_days * 86_400_000).toISOString();
    select = select.gte("occurred_at", since);
  }

  const { data: rows, error } = await select;
  if (error) {
    console.error("[recall] query failed", error);
    throw new ApiError("Could not search your register.", 500);
  }

  type Row = {
    id: string;
    occurred_at: string;
    diagnosis: string | null;
    treatment: string | null;
    fees_inr: number | null;
    visit_number: number | null;
    patients: { id: string; full_name: string } | null;
    prescription_items: {
      drug_name: string;
      strength: string | null;
      frequency_label: string | null;
      frequency_spoken: string | null;
      duration: string | null;
      instructions: string | null;
    }[];
  };

  const records: EncounterRecord[] = ((rows ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    occurred_at: row.occurred_at,
    diagnosis: row.diagnosis,
    treatment: row.treatment,
    fees_inr: row.fees_inr,
    patient_name: row.patients?.full_name ?? "Unknown",
    prescription: row.prescription_items.map((item) => ({
      drug_name: item.drug_name,
      strength: item.strength,
      // Prefer the normalised label; fall back to what was actually said.
      frequency: item.frequency_label ?? item.frequency_spoken,
      duration: item.duration,
    })),
  }));

  const answer = await answerFromRecords(question, records);

  return NextResponse.json({
    ...answer,
    encounters: records,
    resolvedPatient: patientId
      ? { id: patientId, full_name: records[0]?.patient_name ?? null }
      : null,
    candidates,
    query,
  });
}, { rateLimit: "recall" });
