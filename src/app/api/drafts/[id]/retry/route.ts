import { NextResponse } from "next/server";

import { ApiError, readBody, withDoctor } from "@/lib/api/http";
import { extractEncounter } from "@/lib/llm/extract";
import { normaliseDuration, normaliseFrequency, normaliseRoute } from "@/lib/llm/dosage";
import { normaliseProcedures } from "@/lib/encounters/review";
import { transcribeWithFailover, type SttProviderName } from "@/lib/stt";
import { callWorkflow } from "@/lib/supabase/workflows";

export const runtime = "nodejs";

/**
 * Longer than the 60s every other route declares, because this one is the only
 * caller that pays for transcription and extraction in the same request.
 *
 * Worst case: a stalled primary and its fallback burn 20s each
 * (`STT_TIMEOUT_MS` x2 = 40s), extraction takes its full budget
 * (`BUDGET_MS.precise.total` = 36s), and the surrounding work — two selects, the
 * audio download, `match_patients` and two workflow RPCs — adds several more.
 * That is ~80s. At 60 this route was declaring a ceiling its own worst path
 * could not fit under, so the case it exists for — a draft that failed once
 * already — was the case most likely to be killed halfway through.
 *
 * 60 is the ceiling this deployment actually has — Vercel caps a Node function
 * there on Hobby — so the work is split to fit inside it instead of a longer
 * declaration the plan would reject.
 *
 * `stage: "transcribe"` re-runs speech-to-text from the retained audio and
 * writes the transcript. `stage: "extract"` reads that transcript back and
 * rebuilds the draft from it. Neither leg carries both budgets: transcription
 * is at worst 20s + 20s of failover, extraction at worst
 * `BUDGET_MS.precise.total`, and each has the rest of the minute for its own
 * queries. Together they were ~80s against 60, so the case this route exists
 * for — a draft that already failed once — was the case most likely to be
 * killed halfway through.
 *
 * The transcript write is the seam on purpose. It is committed at the end of
 * stage one, so a stage two that never runs leaves a draft with a fresh, usable
 * transcript rather than nothing, and stage two can be retried on its own
 * without paying for transcription again.
 */
export const maxDuration = 60;

/**
 * Re-run a voice draft from its retained private recording.
 *
 * This is intentionally a separate endpoint: the original capture routes are
 * the live pipeline, while retry is an explicit recovery action from review.
 * It never accepts a caller-supplied storage path; the path comes from a
 * transcript already owned by the signed-in doctor.
 */
export const POST = withDoctor<{ id: string }>(async ({ doctor, supabase, params, request }) => {
  const body = await readBody<{ stage?: string }>(request).catch(() => ({}) as { stage?: string });
  // Defaults to the first leg, so a caller that sends nothing gets the stage
  // that has to happen first rather than an error about a field it did not know
  // to send.
  const stage = body.stage === "extract" ? "extract" : "transcribe";

  const { data: encounter, error: encounterError } = await supabase
    .from("encounters")
    .select("id, status, transcript_id")
    .eq("id", params.id)
    .eq("doctor_id", doctor.id)
    .maybeSingle();
  if (encounterError) throw new ApiError("Could not load this draft.", 500);
  if (!encounter) throw new ApiError("Draft not found.", 404);
  if (encounter.status !== "draft") throw new ApiError("Only an open draft can be retried.", 409);
  if (!encounter.transcript_id) {
    throw new ApiError("This draft has no retained recording to retry.", 409);
  }

  // Stage two reads the transcript stage one committed, and never touches the
  // audio again. Re-transcribing here would put both budgets back in one
  // request, which is the whole thing this split exists to avoid — and it would
  // also charge a second provider call for text already on disk.
  if (stage === "extract") {
    const { data: stored, error: storedError } = await supabase
      .from("transcripts")
      .select("id, raw_text, roman_text, language_code, degraded")
      .eq("id", encounter.transcript_id)
      .eq("doctor_id", doctor.id)
      .maybeSingle();
    if (storedError) throw new ApiError("Could not load the retried transcript.", 500);
    if (!stored?.raw_text) {
      // Reachable when stage one was never run, or ran and failed after the
      // audio but before the write. Saying which step is missing is more use
      // than "something went wrong".
      throw new ApiError("Re-transcribe this draft before rebuilding it.", 409);
    }

    return await rebuildDraft({
      supabase,
      doctorId: doctor.id,
      encounterId: params.id,
      transcriptId: stored.id,
      text: stored.raw_text,
      romanText: stored.roman_text,
      languageCode: stored.language_code,
      degraded: Boolean(stored.degraded),
    });
  }

  const { data: transcript, error: transcriptError } = await supabase
    .from("transcripts")
    .select("id, audio_path, audio_mime, duration_ms, language_hint, live_text")
    .eq("id", encounter.transcript_id)
    .eq("doctor_id", doctor.id)
    .maybeSingle();
  if (transcriptError) throw new ApiError("Could not load the retained recording.", 500);
  if (!transcript?.audio_path) {
    throw new ApiError("The recording has expired or was already removed.", 409);
  }

  const download = await supabase.storage.from("dictations").download(transcript.audio_path);
  if (download.error || !download.data) {
    console.error("[draft-retry] audio download failed", download.error);
    throw new ApiError("The retained recording could not be opened.", 502);
  }

  const buffer = Buffer.from(await download.data.arrayBuffer());
  const { data: topDrugs } = await supabase.rpc("doctor_top_drugs", {
    p_doctor_id: doctor.id,
    p_limit: 40,
  });
  const result = await transcribeWithFailover({
    audio: buffer,
    mimeType: transcript.audio_mime ?? download.data.type ?? "audio/webm",
    durationMs: transcript.duration_ms ?? undefined,
    languageHint: transcript.language_hint ?? doctor.dictation_langs?.[0] ?? "unknown",
    mode: "codemix",
    vocabularyHints: (topDrugs ?? []).map((row: { drug_name: string }) => row.drug_name),
  });

  const transcriptId = crypto.randomUUID();
  const { error: transcriptWriteError } = await callWorkflow(supabase, "create_transcript_workflow", {
    p_id: transcriptId,
    p_audio_path: transcript.audio_path,
    p_audio_mime: transcript.audio_mime,
    p_duration_ms: transcript.duration_ms,
    p_provider: result.provider as SttProviderName,
    p_model: result.model,
    p_language_hint: transcript.language_hint,
    p_language_code: result.detectedLanguage ?? null,
    p_confidence: result.confidence ?? null,
    p_degraded: result.degraded,
    p_raw_text: result.text,
    p_roman_text: result.romanText ?? null,
    p_live_text: transcript.live_text,
  });
  if (transcriptWriteError) {
    console.error("[draft-retry] transcript write failed", transcriptWriteError);
    throw new ApiError("Could not save the retried transcript.", 500);
  }

  if (stage === "transcribe") {
    // The transcript is committed, so this is a complete outcome rather than
    // half of one. If the caller never asks for the second leg, the draft still
    // has a fresh transcript, and asking again costs extraction only.
    return NextResponse.json({
      stage: "transcribe",
      encounterId: params.id,
      transcriptId,
      rawText: result.text,
      romanText: result.romanText ?? null,
      languageCode: result.detectedLanguage ?? null,
      degraded: result.degraded,
    });
  }

  return await rebuildDraft({
    supabase,
    doctorId: doctor.id,
    encounterId: params.id,
    transcriptId,
    text: result.text,
    romanText: result.romanText ?? null,
    languageCode: result.detectedLanguage ?? null,
    degraded: result.degraded,
  });
});

/**
 * Turn a transcript into a rebuilt draft.
 *
 * Shared by both stages so the two paths cannot drift: whichever leg produced
 * the text, what gets written to the draft is assembled the same way.
 */
async function rebuildDraft({
  supabase,
  doctorId,
  encounterId,
  transcriptId,
  text,
  romanText,
  languageCode,
  degraded,
}: {
  supabase: Parameters<Parameters<typeof withDoctor>[0]>[0]["supabase"];
  doctorId: string;
  encounterId: string;
  transcriptId: string;
  text: string;
  romanText: string | null;
  languageCode: string | null;
  degraded: boolean;
}) {
  const { data: topDrugs } = await supabase.rpc("doctor_top_drugs", {
    p_doctor_id: doctorId,
    p_limit: 40,
  });
  const frequent = (topDrugs ?? []).map((row: { drug_name: string }) => row.drug_name);

  const outcome = await extractEncounter(text, {
    frequentDrugs: frequent,
    // `undefined` rather than `null`: the extractor treats a missing hint as
    // "detect it", and a stored transcript with no language code is exactly that.
    detectedLanguage: languageCode ?? undefined,
  });
  const extraction = outcome.extraction;
  const items = extraction.prescription.map((item, index) => {
    const frequency = normaliseFrequency(item.frequency_spoken);
    return {
      position: index,
      drug_name: item.drug_name,
      strength: item.strength,
      form: item.form,
      frequency_spoken: item.frequency_spoken,
      frequency_code: frequency.code,
      frequency_label: frequency.label,
      needs_review: frequency.needsReview,
      duration: normaliseDuration(item.duration),
      route: normaliseRoute(item.instructions ?? item.form),
      instructions: item.instructions,
    };
  });

  // Procedures are resolved by the same deterministic pass everywhere — see
  // `normaliseProcedures`. The model gives verbatim speech; the rule table in
  // `src/lib/dental/tooth.ts` turns it into an FDI number, and a tooth it
  // cannot read stays null and reaches the dentist as a review item rather than
  // being guessed at.
  const procedureRows = normaliseProcedures(extraction.procedures ?? []).map((item) => ({
    procedure_name: item.procedure_name,
    catalogue_id: item.catalogue_id ?? null,
    scope: item.scope ?? "tooth",
    tooth_fdi: item.tooth_fdi ?? null,
    surfaces: item.surfaces ?? [],
    sitting_number: item.sitting_number ?? null,
    total_sittings: item.total_sittings ?? null,
    notes: item.note,
    // A row whose tooth did not resolve cannot satisfy the scope-consistency
    // constraint, so it is stored as `other` and flagged. The dentist's
    // correction in review is what turns it into a tooth procedure.
    needs_review: item.scope === "tooth" && item.tooth_fdi === null,
  })).map((row) => (row.needs_review ? { ...row, scope: "other", surfaces: [] } : row));

  const { error: saveError } = await callWorkflow(supabase, "save_dental_draft", {
    p_encounter_id: encounterId,
    p_transcript_id: transcriptId,
    p_patient_name_spoken: extraction.patient_name,
    p_age_years: extraction.age_years,
    p_diagnosis: extraction.diagnosis,
    p_treatment: extraction.treatment,
    p_extracted_raw: extraction,
    p_low_confidence_fields: [
      ...new Set([...extraction.uncertain_fields, ...outcome.issues.map((issue) => issue.field)]),
    ],
    p_extraction_model: outcome.model,
    p_extraction_confidence: null,
    p_prescription: items,
    p_procedures: procedureRows,
  });
  if (saveError) {
    console.error("[draft-retry] draft write failed", saveError);
    throw new ApiError("Could not update the draft from the retried transcript.", 500);
  }

  const { data: matches } = extraction.patient_name
    ? await supabase.rpc("match_patients", {
        p_name: extraction.patient_name,
        p_limit: 8,
      })
    : { data: [] };

  return NextResponse.json({
    stage: "extract",
    encounterId: encounterId,
    transcriptId,
    rawText: text,
    romanText: romanText,
    languageCode: languageCode ?? null,
    degraded: degraded,
    extraction,
    warnings: [
      ...outcome.issues.map((issue) => issue.message),
      ...(extraction.notes_for_doctor ? [extraction.notes_for_doctor] : []),
    ],
    suggestedPatients: matches ?? [],
  });
}
