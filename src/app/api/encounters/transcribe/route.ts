import { NextResponse } from "next/server";

import { ApiError, withDoctor } from "@/lib/api/http";
import {
  RECORDING_UPLOAD_LIMIT_BYTES,
  RECORDING_UPLOAD_LIMIT_MS,
} from "@/lib/audio/limits";
import { SttError, transcribeWithFailover } from "@/lib/stt";
import { callWorkflow } from "@/lib/supabase/workflows";

/**
 * POST /api/encounters/transcribe
 *
 * multipart/form-data: audio, mimeType, durationMs, sampleRate, liveText, languages
 * -> { transcriptId, text, romanText, languageCode, degraded, durationMs }
 *
 * Step 1 of 3 in the dictation pipeline. Deliberately separate from extraction
 * so that a failed or unconvincing LLM pass can be retried without asking the
 * doctor to say it all again — the audio and the transcript are already saved.
 */

// Buffer and the multipart body both need Node, and STT round-trips can take
// tens of seconds on a clinic's mobile connection.
export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = withDoctor(async ({ doctor, supabase, request }) => {
  const form = await request.formData().catch(() => null);
  if (!form) throw new ApiError("Expected multipart/form-data.");

  const audio = form.get("audio");
  if (!(audio instanceof Blob)) throw new ApiError("No audio file was attached.");
  if (audio.size === 0) throw new ApiError("The audio file was empty.");
  if (audio.size > RECORDING_UPLOAD_LIMIT_BYTES) {
    throw new ApiError("That recording is too large to upload.", 413);
  }

  const mimeType = String(form.get("mimeType") || audio.type || "audio/webm");
  const durationMs = Number(form.get("durationMs")) || undefined;
  const sampleRate = Number(form.get("sampleRate")) || undefined;
  const liveText = String(form.get("liveText") || "") || null;
  const languages = String(form.get("languages") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (durationMs && durationMs > RECORDING_UPLOAD_LIMIT_MS) {
    throw new ApiError(
      "That recording is longer than one minute. Dictate one patient at a time.",
      413,
    );
  }

  const transcriptId = crypto.randomUUID();
  // Browsers record webm/mp4/ogg, but the route also accepts an uploaded file,
  // and naming WAV bytes ".webm" makes the stored dictation refuse to open for
  // whoever pulls it up to check what the doctor actually said.
  const extension = mimeType.includes("mp4")
    ? "m4a"
    : mimeType.includes("ogg")
      ? "ogg"
      : mimeType.includes("wav")
        ? "wav"
        : mimeType.includes("mpeg")
          ? "mp3"
          : "webm";
  // Clinic-scoped path. Storage policies key off the first path segment, so the
  // clinic id has to lead — it is what makes one clinic's audio unreachable
  // from another clinic's session.
  const audioPath = `${doctor.clinic_id}/${doctor.id}/${transcriptId}.${extension}`;

  const buffer = Buffer.from(await audio.arrayBuffer());

  // Store the audio before transcribing. If STT fails we still hold the
  // recording, and the doctor can retry instead of losing the consultation.
  const upload = await supabase.storage
    .from("dictations")
    // Storage matches `allowed_mime_types` as an exact string, and
    // MediaRecorder reports the negotiated type *with* its codec parameter
    // ("audio/webm;codecs=opus" on every Chromium browser). The parameter
    // describes the codec, not a different kind of object to store, so it is
    // dropped here — `audio_mime` below keeps the full value for playback and
    // for anyone debugging what the browser actually produced.
    .upload(audioPath, buffer, {
      contentType: mimeType.split(";")[0].trim(),
      upsert: false,
    });

  if (upload.error) {
    console.error("[transcribe] upload failed", upload.error);
    throw new ApiError("Could not save the recording.", 502);
  }

  // Bias the recogniser toward drugs this doctor actually prescribes. A full
  // Indian formulary is far too large to send; their own top-N is both small
  // and far better targeted.
  const { data: topDrugs } = await supabase.rpc("doctor_top_drugs", {
    p_doctor_id: doctor.id,
    p_limit: 40,
  });
  const vocabularyHints = (topDrugs ?? []).map(
    (row: { drug_name: string }) => row.drug_name,
  );

  let result;
  try {
    result = await transcribeWithFailover({
      audio: buffer,
      mimeType,
      sampleRate,
      durationMs,
      languageHint: languages[0] ?? doctor.dictation_langs?.[0] ?? "unknown",
      mode: "codemix",
      vocabularyHints,
    });
  } catch (error) {
    if (error instanceof SttError) {
      // `withDoctor` turns the code into the doctor-facing message and status,
      // which is deliberately vague — a provider's raw response can carry back
      // fragments of the request. What the wrapper cannot know is the shape of
      // the audio that failed, and that is usually the culprit, so it is logged
      // here and the error re-thrown untouched.
      console.error("[transcribe] stt failed", {
        code: error.code,
        message: error.message,
        bytes: buffer.length,
        mimeType,
        durationMs,
        languageHint: languages[0] ?? doctor.dictation_langs?.[0] ?? "unknown",
      });
    }
    throw error;
  }

  // Authenticated clients have no INSERT privilege on the transcript table.
  // This workflow derives clinic_id and doctor_id from auth.uid(), validates
  // the storage path, and leaves an audit row in the same transaction.
  const { data, error } = await callWorkflow<string>(supabase, "create_transcript_workflow", {
    p_id: transcriptId,
    p_audio_path: audioPath,
    p_audio_mime: mimeType,
    p_duration_ms: durationMs ?? result.durationMs ?? null,
    p_provider: result.provider,
    p_model: result.model,
    p_language_hint: languages[0] ?? doctor.dictation_langs?.[0] ?? null,
    p_language_code: result.detectedLanguage ?? null,
    p_confidence: result.confidence ?? null,
    p_degraded: result.degraded,
    // `raw_text` is the provider's output and is never overwritten by the
    // LLM. It is the evidence behind every structured field downstream.
    p_raw_text: result.text,
    p_roman_text: result.romanText ?? null,
    p_live_text: liveText,
  });

  if (error) {
    console.error("[transcribe] insert failed", error);
    throw new ApiError("Could not save the transcript.", 500);
  }

  return NextResponse.json({
    transcriptId: data ?? transcriptId,
    text: result.text,
    romanText: result.romanText ?? null,
    languageCode: result.detectedLanguage ?? null,
    provider: result.provider,
    degraded: result.degraded,
    durationMs: durationMs ?? null,
  });
}, { rateLimit: "transcribe" });
