/* eslint-disable @typescript-eslint/no-explicit-any -- migration 0012 adds columns/RPCs before generated types are refreshed. */
import { NextResponse } from "next/server";

import { ApiError, PGRST_NO_ROWS, readBody, withDoctor } from "@/lib/api/http";
import { normalisePatientPhone, type PatientSex } from "@/lib/encounters/review";
import { callWorkflow } from "@/lib/supabase/workflows";

type Params = { id: string };

/**
 * Draft recovery API.
 *
 * This is intentionally separate from `/api/encounters/[id]`: that route is
 * the original capture/commit surface, while this one owns reopening a draft
 * from the register and its optimistic, debounced edits.
 */
export const GET = withDoctor<Params>(async ({ doctor, supabase, params }) => {
  const db = supabase as any;
  const { data: row, error } = await db
    .from("encounters")
    .select(
      "id, status, patient_id, patient_name_spoken, age_years, diagnosis, treatment, low_confidence_fields, extracted_raw, draft_version, patients(id, full_name, phone, age_years, sex), transcripts(id, raw_text, roman_text, language_code, degraded, audio_path), prescription_items(drug_name, strength, form, frequency_spoken, duration, route, instructions, position, needs_review)",
    )
    .eq("id", params.id)
    .eq("doctor_id", doctor.id)
    .in("status", ["draft", "discarded"])
    .maybeSingle();

  if (error && error.code !== PGRST_NO_ROWS) {
    console.error("[drafts/get] load failed", error);
    throw new ApiError("Could not load this draft.", 500);
  }
  if (!row) throw new ApiError("Draft not found.", 404);

  const transcript = one(row.transcripts);
  const linkedPatient = one(row.patients);
  const items = [...(row.prescription_items ?? [])].sort(
    (a: { position: number }, b: { position: number }) => a.position - b.position,
  );
  const extracted = isObject(row.extracted_raw) ? row.extracted_raw : {};
  const patientName = row.patient_name_spoken ?? stringValue(extracted.patient_name);
  const source = extracted.capture_source === "manual" ? "manual" : "voice";
  const phone = typeof extracted.phone === "string" ? normalisePatientPhone(extracted.phone) : null;
  const sex = isPatientSex(extracted.sex) ? extracted.sex : null;
  const { data: matches, error: matchError } = patientName
    ? await supabase.rpc("match_patients", { p_name: patientName, p_phone: null, p_limit: 5 })
    : { data: [], error: null };
  if (matchError) console.warn("[drafts/get] patient suggestions unavailable", matchError.code);

  return NextResponse.json({
    encounterId: row.id,
    transcriptId: transcript?.id ?? null,
    rawText: transcript?.raw_text ?? "",
    romanText: transcript?.roman_text ?? null,
    languageCode: transcript?.language_code ?? null,
    degraded: Boolean(transcript?.degraded),
    extraction: {
      patient_name: patientName,
      age_years: row.age_years ?? numberValue(extracted.age_years),
      diagnosis: row.diagnosis ?? stringValue(extracted.diagnosis),
      treatment: row.treatment ?? stringValue(extracted.treatment),
      prescription: items.map((item: any) => ({
        drug_name: item.drug_name,
        strength: item.strength ?? null,
        form: item.form ?? null,
        frequency_spoken: item.frequency_spoken ?? null,
        duration: item.duration ?? null,
        route: item.route ?? null,
        instructions: item.instructions ?? null,
      })),
      uncertain_fields: Array.isArray(row.low_confidence_fields)
        ? row.low_confidence_fields.filter((field: string) => field !== "fees_inr")
        : [],
      notes_for_doctor: stringValue(extracted.notes_for_doctor),
    },
    warnings: stringValue(extracted.notes_for_doctor) ? [stringValue(extracted.notes_for_doctor)!] : [],
    suggestedPatients: matches ?? [],
    source,
    audioAvailable: Boolean(transcript?.audio_path),
    patientIdentity: {
      phone: phone ?? linkedPatient?.phone ?? null,
      sex: sex ?? (isPatientSex(linkedPatient?.sex) ? linkedPatient?.sex : null),
    },
    provisional: !transcript?.id,
    status: row.status,
    version: Number(row.draft_version ?? 1),
  });
});

interface DraftPatch {
  expectedVersion?: number;
  patient_name_spoken?: unknown;
  age_years?: unknown;
  diagnosis?: unknown;
  treatment?: unknown;
  prescription?: unknown;
}

export const PATCH = withDoctor<Params>(async ({ doctor, supabase, request, params }) => {
  const body = await readBody<DraftPatch>(request);
  const db = supabase as any;
  const current = await loadDraft(db, doctor.id, params.id);
  const expected = body.expectedVersion == null ? current.draft_version : Number(body.expectedVersion);
  if (!Number.isInteger(expected) || expected < 1) throw new ApiError("Draft version is invalid.");
  if (expected !== current.draft_version) {
    return NextResponse.json(
      { error: "This draft changed in another window. Reload it before saving.", code: "draft_conflict", version: current.draft_version },
      { status: 409 },
    );
  }

  const patch: Record<string, unknown> = {};
  if ("patient_name_spoken" in body) patch.patient_name_spoken = text(body.patient_name_spoken);
  if ("age_years" in body) patch.age_years = age(body.age_years);
  if ("diagnosis" in body) patch.diagnosis = text(body.diagnosis);
  if ("treatment" in body) patch.treatment = text(body.treatment);

  const { data: updated, error } = await callWorkflow<Record<string, unknown>>(supabase, "update_draft_workflow", {
    p_encounter_id: params.id,
    p_patch: patch,
    p_prescription: Array.isArray(body.prescription) ? body.prescription : null,
    p_expected_version: expected,
  });
  if (error) {
    if (error.code === "P0001" || error.code === "40001" || error.code === "409") {
      const latest = await loadDraft(db, doctor.id, params.id);
      return NextResponse.json(
        { error: "This draft changed in another window. Reload it before saving.", code: "draft_conflict", version: latest.draft_version },
        { status: 409 },
      );
    }
    throw new ApiError("Could not save your draft.", 500);
  }
  if (updated == null) {
    const latest = await loadDraft(db, doctor.id, params.id);
    return NextResponse.json(
      { error: "This draft changed in another window. Reload it before saving.", code: "draft_conflict", version: latest.draft_version },
      { status: 409 },
    );
  }

  const result = Array.isArray(updated) ? updated[0] : updated;
  return NextResponse.json({ ok: true, version: Number(result?.draft_version ?? result?.version ?? expected + 1) });
});

/** Soft-discard from the recovery UI. The existing encounter route remains intact. */
export const DELETE = withDoctor<Params>(async ({ doctor, supabase, params }) => {
  const db = supabase as any;
  const current = await loadDraft(db, doctor.id, params.id);
  if (current.status === "discarded") return NextResponse.json({ ok: true });
  const { error } = await callWorkflow<Record<string, unknown>>(supabase, "discard_draft_workflow", { p_encounter_id: params.id, p_expected_version: current.draft_version });
  if (error) throw new ApiError("Could not discard the draft.", 500);
  return NextResponse.json({ ok: true });
});

/** Restore a previously discarded draft, keeping its transcript and edits. */
export const POST = withDoctor<Params>(async ({ doctor, supabase, params }) => {
  const db = supabase as any;
  const current = await loadDraft(db, doctor.id, params.id);
  if (current.status === "draft") return NextResponse.json({ ok: true, version: current.draft_version });
  if (current.status !== "discarded") throw new ApiError("Only discarded drafts can be restored.", 409);
  const { data, error } = await callWorkflow<Record<string, unknown>>(supabase, "restore_discarded_draft_workflow", { p_encounter_id: params.id, p_expected_version: current.draft_version });
  if (error || !data) throw new ApiError("Could not restore the draft.", 500);
  return NextResponse.json({ ok: true, version: data.draft_version });
});

async function loadDraft(db: any, doctorId: string, id: string) {
  const { data, error } = await db.from("encounters").select("id, status, draft_version").eq("id", id).eq("doctor_id", doctorId).in("status", ["draft", "discarded"]).maybeSingle();
  if (error) throw new ApiError("Could not load this draft.", 500);
  if (!data) throw new ApiError("Draft not found.", 404);
  return { ...data, draft_version: Number(data.draft_version ?? 1) };
}

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}
function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function isPatientSex(value: unknown): value is PatientSex {
  return value === "female" || value === "male" || value === "intersex" || value === "not_recorded";
}
function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 2_000) : null;
}
function age(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 130) throw new ApiError("Age must be between 0 and 130.");
  return Math.floor(n);
}
