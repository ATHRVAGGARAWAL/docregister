import { NextResponse } from "next/server";

import { ApiError, readBody, withDoctor } from "@/lib/api/http";
import { normaliseDuration, normaliseFrequency, normaliseRoute } from "@/lib/llm/dosage";
import { extractEncounter } from "@/lib/llm/extract";

/**
 * POST /api/encounters/extract
 * body: { transcriptId } | { text, encounterId? }
 * -> { encounterId, extraction, warnings, suggestedPatients, provisional }
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
 */

export const runtime = "nodejs";
export const maxDuration = 60;

interface ExtractBody {
  transcriptId?: string;
  /** Live-stream text. Produces a provisional draft. */
  text?: string;
  /** Overwrite this draft rather than creating one. The reconciliation pass. */
  encounterId?: string;
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

  /* ---- Which draft row is this? ---------------------------------------- */

  let encounterId: string;

  if (typeof body.encounterId === "string" && body.encounterId.trim()) {
    // Reconciliation overwriting its own speculative draft. Verify it is still
    // a draft and still ours before touching it — RLS covers the clinic, this
    // covers the status.
    const candidate = body.encounterId.trim();
    const { data: existing } = await supabase
      .from("encounters")
      .select("id, status")
      .eq("id", candidate)
      .maybeSingle();

    if (!existing) throw new ApiError("Draft not found.", 404);
    if (existing.status !== "draft") {
      throw new ApiError("That visit has already been saved or discarded.", 409);
    }
    encounterId = candidate;
  } else if (transcriptId) {
    // Re-extracting the same transcript should not litter the register with
    // duplicate drafts.
    const { data: existing } = await supabase
      .from("encounters")
      .select("id")
      .eq("transcript_id", transcriptId)
      .eq("status", "draft")
      .maybeSingle();
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

  const encounterRow = {
    id: encounterId,
    clinic_id: doctor.clinic_id,
    doctor_id: doctor.id,
    // Null on the speculative pass. This is the column the commit route gates
    // on, so it is what makes a provisional draft unsignable rather than a
    // convention someone has to remember.
    transcript_id: transcriptId,
    status: "draft" as const,
    patient_name_spoken: extraction.patient_name,
    age_years: extraction.age_years,
    diagnosis: extraction.diagnosis,
    treatment: extraction.treatment,
    fees_inr: extraction.fees_inr,
    // The model's untouched output, kept beside the edited columns. When a
    // field is later disputed, this is what shows whether the model got it
    // wrong or the doctor changed their mind.
    extracted_raw: extraction as unknown as Record<string, unknown>,
    low_confidence_fields: [
      ...new Set([...extraction.uncertain_fields, ...issues.map((issue) => issue.field)]),
    ],
    extraction_model: outcome.model,
  };

  const { error: upsertError } = await supabase
    .from("encounters")
    .upsert(encounterRow, { onConflict: "id" });

  if (upsertError) {
    console.error("[extract] upsert failed", upsertError);
    throw new ApiError("Could not save the draft.", 500);
  }

  // Dosage shorthand is normalised deterministically, not by the model. "BD",
  // "1-0-1", "do baar" and "ਦੋ ਵਾਰ" all mean twice daily, and a rule table gets
  // that right every time; an LLM gets it right most of the time, which is the
  // wrong reliability class for a prescription.
  await supabase.from("prescription_items").delete().eq("encounter_id", encounterId);

  if (extraction.prescription.length > 0) {
    const items = extraction.prescription.map((item, index) => {
      const frequency = normaliseFrequency(item.frequency_spoken);
      return {
        encounter_id: encounterId,
        clinic_id: doctor.clinic_id,
        position: index,
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

    const { error: itemsError } = await supabase.from("prescription_items").insert(items);
    if (itemsError) {
      console.error("[extract] prescription insert failed", itemsError);
      throw new ApiError("Could not save the prescription.", 500);
    }
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
