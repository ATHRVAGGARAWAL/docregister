import { NextResponse } from "next/server";

import type { Json } from "@/lib/supabase/database.types";
import { ApiError, readBody, withDoctor } from "@/lib/api/http";
import { normaliseDuration, normaliseFrequency, normaliseRoute } from "@/lib/llm/dosage";
import { extractEncounter } from "@/lib/llm/extract";
import { classifyUtterance } from "@/lib/llm/intent";
import { callWorkflow } from "@/lib/supabase/workflows";

/**
 * POST /api/encounters/extract
 * body: { transcriptId } | { text, encounterId? }, plus optional treatAs
 * -> { kind: "dictation", encounterId, extraction, warnings, suggestedPatients, provisional }
 *  | { kind: "question", text, transcriptId }
 *
 * Step 2 of 3. Produces a **draft** encounter (status `draft`) plus a shortlist
 * of patients the spoken name might refer to. Nothing enters the register here:
 * `status` stays `draft` until a human commits it in step 3. That boundary is
 * the whole safety argument for letting an LLM near a medical record.
 *
 * ## Two ways in, because waiting twice was the product's worst number
 *
 * The original shape was strictly sequential: upload audio, wait 5-9s for the
 * recogniser, then send the transcript back up and wait another 8-10s for the
 * model. Thirteen to nineteen seconds of a doctor holding a phone, between
 * patients, watching a dot pulse.
 *
 * But by the time they let go of the key, the live WebSocket has usually
 * already produced most of the transcript. So the client now fires this route
 * with `text` — the live transcript — at the same moment it starts uploading
 * audio, and the two waits overlap instead of stacking.
 *
 * A draft produced that way is **provisional**: `transcript_id` is null,
 * because the text it came from is not the transcript of record and never
 * becomes it. When the recogniser finishes, the client calls back with
 * `transcriptId` and `encounterId`, and this route re-runs against the
 * authoritative text and overwrites the same row. The commit route refuses any
 * encounter still carrying a null `transcript_id`, so the fast path can only
 * ever buy the doctor a head start on *reading* — never on signing.
 *
 * ## Why the "was that even a consultation?" question is answered in here
 *
 * The dock has one microphone key, so "pull up Sunita's records" arrives by
 * exactly this route, and without a check it files a consultation for a patient
 * called Sunita. The check could equally have been a `/api/utterances/classify`
 * route in front of this one — and that is the version this deliberately is
 * not. A separate route puts a whole network round trip on a clinic's mobile
 * connection ahead of *every* dictation, forty times a day between patients, to
 * serve the rarer case. Folding it in here costs the dictation path one cheap
 * model call and no extra trip.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

interface ExtractBody {
  transcriptId?: string;
  /** Live-stream text. Produces a provisional draft. */
  text?: string;
  /** Overwrite this draft rather than creating one. The reconciliation pass. */
  encounterId?: string;
  /**
   * Skip the dictation/question check and extract regardless. Set by the
   * "Record as a visit instead" action, which exists precisely because the
   * check got it wrong — re-asking the same classifier the same thing would
   * only get the same answer back.
   */
  treatAs?: "dictation";
}

export const POST = withDoctor(async ({ doctor, supabase, request }) => {
  const body = await readBody<ExtractBody>(request);

  /* ---- Where is the text coming from? ---------------------------------- */

  let sourceText: string;
  let languageCode: string | null = null;
  let transcriptId: string | null = null;

  if (typeof body.transcriptId === "string" && body.transcriptId.trim()) {
    transcriptId = body.transcriptId.trim();

    const { data: transcript, error: transcriptError } = await supabase
      .from("transcripts")
      .select("id, raw_text, roman_text, language_code")
      .eq("id", transcriptId)
      .single();

    // RLS already scopes this to the caller's clinic, so a miss means either a
    // bad id or another clinic's row — both are "not found" from here.
    if (transcriptError || !transcript) throw new ApiError("Transcript not found.", 404);
    if (!transcript.raw_text?.trim()) {
      throw new ApiError("That transcript is empty — nothing to extract.", 422);
    }

    sourceText = transcript.raw_text;
    languageCode = transcript.language_code ?? null;
  } else if (typeof body.text === "string" && body.text.trim().length >= 12) {
    // The floor is deliberate. A two-word live transcript is what a dropped
    // socket looks like, and speculating on it spends a model call to produce a
    // draft that reconciliation will throw away anyway.
    sourceText = body.text.trim();
  } else {
    throw new ApiError("Provide either `transcriptId` or a non-trivial `text`.");
  }

  /* ---- Was that a consultation at all? --------------------------------- */

  // Everything after this point writes a draft, so the fork happens before it:
  // a question never reaches the register, and nothing has to be cleaned up
  // when one is recognised.
  //
  // The caller can say it has already decided. Naming an `encounterId` is that
  // decision made implicitly — a draft it wants overwritten exists, so this
  // utterance was a consultation the last time round.
  const decided = body.treatAs === "dictation" || Boolean(body.encounterId?.trim());

  if (!decided && (await classifyUtterance(sourceText)) === "question") {
    return NextResponse.json({
      kind: "question" as const,
      text: sourceText,
      // What makes this reversible. The transcript row was written by
      // `/api/encounters/transcribe` before any of this ran and is the
      // transcript of record, so a consultation misread as a question has not
      // been lost — re-posting this id with `treatAs: "dictation"` runs the
      // extraction that was skipped, against the same words. Null on the
      // speculative live-text pass, which has no transcript row yet.
      transcriptId,
    });
  }

  /* ---- Which draft row is this? ---------------------------------------- */

  let encounterId: string;

  if (typeof body.encounterId === "string" && body.encounterId.trim()) {
    // Reconciliation overwriting its own speculative draft. Verify it is still
    // a draft and still ours before touching it — RLS covers the clinic, this
    // covers the status.
    const candidate = body.encounterId.trim();
    const { data: existing, error: lookupError } = await supabase
      .from("encounters")
      .select("id, status")
      .eq("id", candidate)
      .maybeSingle();

    // A dropped connection, a statement timeout and an RLS-denied read all
    // return `data: null`. Reporting any of them as "Draft not found." tells a
    // doctor their consultation is gone and sends them to dictate it again,
    // when it is sitting in the table untouched.
    if (lookupError) {
      console.error("[extract] draft lookup failed", lookupError.code);
      throw new ApiError("Could not open that draft. Try again.", 500);
    }
    if (!existing) throw new ApiError("Draft not found.", 404);
    if (existing.status !== "draft") {
      throw new ApiError("That visit has already been saved or discarded.", 409);
    }
    encounterId = candidate;
  } else if (transcriptId) {
    // Re-extracting the same transcript should not litter the register with
    // duplicate drafts.
    const { data: existing, error: reuseError } = await supabase
      .from("encounters")
      .select("id")
      .eq("transcript_id", transcriptId)
      .eq("status", "draft")
      .maybeSingle();

    // Falling through to a fresh uuid on an *error* would fork a second
    // encounter for a transcript that already has one, and the doctor would
    // meet that as a unique-index violation rather than as anything they can
    // act on. A failed lookup is a failure, not an absence.
    if (reuseError) {
      console.error("[extract] draft reuse lookup failed", reuseError.code);
      throw new ApiError("Could not prepare that visit. Try again.", 500);
    }
    encounterId = existing?.id ?? crypto.randomUUID();
  } else {
    encounterId = crypto.randomUUID();
  }

  /* ---- Extract ---------------------------------------------------------- */

  const { data: topDrugs } = await supabase.rpc("doctor_top_drugs", {
    p_doctor_id: doctor.id,
    p_limit: 40,
  });

  const outcome = await extractEncounter(sourceText, {
    detectedLanguage: languageCode ?? undefined,
    frequentDrugs: (topDrugs ?? []).map((row: { drug_name: string }) => row.drug_name),
  });

  const { extraction, issues } = outcome;

  // Dosage shorthand is normalised deterministically, not by the model. "BD",
  // "1-0-1", "do baar" and "ਦੋ ਵਾਰ" all mean twice daily, and a rule table gets
  // that right every time; an LLM gets it right most of the time, which is the
  // wrong reliability class for a prescription.
  const items = extraction.prescription.map((item) => {
    const frequency = normaliseFrequency(item.frequency_spoken);
    return {
      drug_name: item.drug_name,
      strength: item.strength,
      form: item.form,
      frequency_spoken: item.frequency_spoken,
      frequency_code: frequency.code,
      frequency_label: frequency.label,
      needs_review: frequency.needsReview,
      route: normaliseRoute(item.instructions ?? item.form),
      duration: normaliseDuration(item.duration),
      instructions: item.instructions,
    };
  });

  // Encounter fields and prescription rows are replaced in one transaction.
  // The function derives tenant/doctor identity from auth.uid() and refuses to
  // overwrite another doctor's row, even inside the same clinic.
  const { error: saveError } = await callWorkflow<unknown>(supabase, "save_clinical_draft", {
    p_encounter_id: encounterId,
    p_transcript_id: transcriptId,
    p_patient_name_spoken: extraction.patient_name,
    p_age_years: extraction.age_years,
    p_diagnosis: extraction.diagnosis,
    p_treatment: extraction.treatment,
    p_extracted_raw: extraction as unknown as Json,
    p_low_confidence_fields: [
      ...new Set([...extraction.uncertain_fields, ...issues.map((issue) => issue.field)]),
    ],
    p_extraction_model: outcome.model,
    p_extraction_confidence: null,
    p_prescription: items,
  });

  if (saveError) {
    console.error("[extract] workflow failed", saveError);
    if (saveError.code === "P0002") throw new ApiError("Draft not found.", 404);
    if (saveError.code === "40001") {
      throw new ApiError("A newer transcript has already been saved for this draft.", 409);
    }
    throw new ApiError("Could not save the draft and prescription.", 500);
  }

  // Offer candidate patients rather than auto-linking. Two patients called
  // "Sunita Devi" in one clinic is ordinary, and silently merging their charts
  // is the kind of error nobody notices until it matters.
  let suggestedPatients: unknown[] = [];
  if (extraction.patient_name) {
    const { data: matches } = await supabase.rpc("match_patients", {
      p_name: extraction.patient_name,
      p_phone: null,
      p_limit: 5,
    });
    suggestedPatients = matches ?? [];
  }

  return NextResponse.json({
    kind: "dictation" as const,
    encounterId,
    extraction,
    warnings: [
      ...issues.map((issue) => issue.message),
      ...(extraction.notes_for_doctor ? [extraction.notes_for_doctor] : []),
    ],
    suggestedPatients,
    /** True while this draft came from the live stream and cannot be committed. */
    provisional: transcriptId === null,
    usage: outcome.usage,
  });
}, { rateLimit: "extract" });
