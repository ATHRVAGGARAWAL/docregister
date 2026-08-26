import { NextResponse } from "next/server";

import { ApiError, withDoctor } from "@/lib/api/http";
import { extractEncounter } from "@/lib/llm/extract";
import { normaliseDuration, normaliseFrequency, normaliseRoute } from "@/lib/llm/dosage";
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
 * Left at 60 deliberately, and that is a compromise rather than a fix. Vercel
 * caps a Node function at 60s on Hobby and allows more only on a paid plan, and
 * this app is deployed there and live — a declaration the plan rejects fails the
 * deploy, which is worse for a clinical register than the rare mid-retry kill it
 * would prevent.
 *
 * So the overflow is written down rather than papered over. Closing it properly
 * is one of: raise this to ~120 once the plan allows it, split retry into two
 * requests (transcribe, then extract) so neither leg carries both budgets, or
 * thread a deadline through both legs so extraction takes what transcription
 * left. The third is the best of the three and the largest.
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
export const POST = withDoctor<{ id: string }>(async ({ doctor, supabase, params }) => {
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

  const outcome = await extractEncounter(result.text, {
    frequentDrugs: (topDrugs ?? []).map((row: { drug_name: string }) => row.drug_name),
    detectedLanguage: result.detectedLanguage,
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
  const { error: saveError } = await callWorkflow(supabase, "save_clinical_draft", {
    p_encounter_id: params.id,
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
    encounterId: params.id,
    transcriptId,
    rawText: result.text,
    romanText: result.romanText ?? null,
    languageCode: result.detectedLanguage ?? null,
    degraded: result.degraded,
    extraction,
    warnings: [
      ...outcome.issues.map((issue) => issue.message),
      ...(extraction.notes_for_doctor ? [extraction.notes_for_doctor] : []),
    ],
    suggestedPatients: matches ?? [],
  });
});
