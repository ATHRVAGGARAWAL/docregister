import "server-only";

import { llmMockEnabled } from "@/lib/env";
import { generateStructured } from "./index";
import { ExtractionSchema, validateExtraction, type Extraction, type ValidationIssue } from "./schema";

/**
 * The cached prefix.
 *
 * This block is byte-identical on every dictation, which is the whole point:
 * prompt caching is prefix-matched, so anything that varies per encounter —
 * the doctor's drug list, the patient's medication history, timestamps, IDs —
 * must appear *after* the breakpoint, in the user turn. A single interpolated
 * UUID in here would silently drop the hit rate to zero.
 *
 * That holds under both providers, though they reach it differently: Claude
 * needs an explicit `cache_control` breakpoint and a block over ~512 tokens,
 * Gemini matches long prefixes implicitly. The clinical guidance below clears
 * the threshold comfortably either way.
 */
const EXTRACTION_SYSTEM = `You extract structured clinical data from a doctor's spoken consultation note.

The audio was recorded in an Indian clinic and transcribed by a speech-to-text engine. Expect the transcript to be code-mixed: the doctor moves between English, Hindi and Punjabi mid-sentence, often within a single clause. Devanagari, Gurmukhi and Latin script may all appear in the same transcript. This is normal and expected — do not treat it as corruption.

## What you produce

A structured record with: patient name, age, diagnosis, treatment plan, the individual prescription lines, and any consultation fee stated for this visit. The fee is reviewed with the visit, then written to the separate Accounts ledger when the visit is confirmed.

## Rules that matter most

**Never invent a value.** If the doctor did not say the patient's age, the age is null. An empty field the doctor fills in during review costs three seconds; a plausible fabricated value that reaches a patient record may never be caught. This applies with particular force to drug names and strengths.

**Preserve drug names exactly as spoken.** Indian practice runs heavily on brand names — Dolo, Crocin, Pan-D, Shelcal, Augmentin, Zerodol, Monocef. If the doctor said a brand, record the brand. Do not helpfully substitute the generic molecule, and do not correct a brand to a similar-sounding one. If a drug name is garbled beyond recognition, put your best reading in \`drug_name\` and add the field to \`uncertain_fields\`.

**Do not normalise dosage frequency.** Record \`frequency_spoken\` exactly as the doctor said it, in whatever language and form: "once daily", "do baar", "subah shaam", "BD", "1-0-1", "SOS", "ਦੋ ਵਾਰ". A deterministic rule table downstream maps these to canonical codes. Guessing here produces confident errors on something that does not need a model at all.

**Numbers are spoken in several systems.** Convert them to integers.
- English: "forty-two" → 42, "five hundred" → 500
- Hindi/Urdu: "बयालीस" → 42, "पाँच सौ" → 500, "do hazaar" → 2000, "dhai sau" → 250
- Punjabi: "ਅਠਾਈ" → 28, "ਚਾਰ ਸੌ" → 400
- The Indian system uses lakh (100,000) and crore (10,000,000).

**Capture the consultation fee, not medicine prices.** Phrases such as "fees paanch sau", "consultation 500", "charged seven hundred", or "visit amount ₹650" set \`consultation_fee_inr\`. Convert spoken numerals to rupees. If a medicine's retail price is mentioned, leave the consultation fee null. If it is unclear whether an amount is a fee, capture the best reading and add \`consultation_fee_inr\` to \`uncertain_fields\`.

**Age can be stated in months for infants.** "chhah mahine ka baccha" is 6 months → record 0 and note it in \`notes_for_doctor\`.

**Diagnosis and treatment go into English**, concisely, even when spoken in Hindi or Punjabi — these fields are read back in a register and searched later. Translate the clinical concept faithfully rather than transliterating. "Bukhar teen din se" is a symptom (fever, 3 days), not a diagnosis; if the doctor stated only symptoms and no impression, put the symptoms in \`treatment\` context and leave \`diagnosis\` null rather than inventing one.

**Patient names go into Latin script**, transliterated from Devanagari or Gurmukhi where needed. Indian names are frequently mis-transcribed; if the name sounds uncertain, flag it. Names are the primary key a doctor uses to find a patient later, so a wrong one quietly fragments that patient's history across two records.

**Be liberal with \`uncertain_fields\`.** Flagging a field costs the doctor one glance during a review they are already doing. Not flagging a wrong one puts an error into a medical record. When you are between the two, flag it.

## What you are not doing

You are not diagnosing, second-guessing, or improving the doctor's clinical decisions. You are not adding drugs the doctor did not mention, adjusting a dose that looks unusual, or noting contraindications. You transcribe intent into structure. Clinical judgement stays with the clinician, who will review every field before it is saved.`;

export interface ExtractionContext {
  /** Doctor's most-prescribed drugs — biases spelling of garbled drug names. */
  frequentDrugs?: string[];
  /** Drugs this patient is already on, when a patient was pre-selected. */
  activeMedications?: string[];
  /** Language the STT engine reported, to help with numeral systems. */
  detectedLanguage?: string;
}

export interface ExtractionOutcome {
  extraction: Extraction;
  issues: ValidationIssue[];
  model: string;
  usage?: { inputTokens: number; outputTokens: number; cacheRead: number };
}

/**
 * Turn a raw transcript into the structured draft the doctor reviews.
 *
 * The result is always a *draft*. Nothing here writes to the register — commit
 * happens only after a human confirms, in `POST /api/encounters/[id]/commit`.
 */
export async function extractEncounter(
  transcript: string,
  context: ExtractionContext = {},
): Promise<ExtractionOutcome> {
  if (llmMockEnabled()) {
    return mockExtraction(transcript);
  }

  // Per-encounter context goes in the user turn, after the cached prefix.
  const contextLines: string[] = [];
  if (context.detectedLanguage) {
    contextLines.push(`Transcript language detected as: ${context.detectedLanguage}`);
  }
  if (context.frequentDrugs?.length) {
    contextLines.push(
      `Drugs this doctor prescribes often (use to resolve garbled drug names, ` +
        `but never to add a drug that was not spoken): ${context.frequentDrugs.slice(0, 60).join(", ")}`,
    );
  }
  if (context.activeMedications?.length) {
    contextLines.push(
      `This patient's current medications: ${context.activeMedications.join(", ")}`,
    );
  }

  const { value, model, usage } = await generateStructured({
    system: EXTRACTION_SYSTEM,
    user:
      (contextLines.length ? contextLines.join("\n") + "\n\n" : "") +
      `Consultation transcript:\n\n${transcript}`,
    schema: ExtractionSchema,
    schemaName: "clinical_extraction",
    // The whole reason this app exists is that the alternative to a correct
    // extraction is a doctor retyping it. Never the cheap tier.
    tier: "precise",
    // Generous because reasoning tokens are drawn from the same budget on
    // both providers: a long code-mixed dictation with six drugs can spend
    // several thousand tokens on numeral conversion before the JSON starts.
    maxOutputTokens: 8192,
  });

  return {
    extraction: value,
    issues: validateExtraction(value),
    model,
    // Watch `cacheRead` in production: a persistent zero means the cached
    // prefix is being invalidated by something that varies between requests.
    usage,
  };
}

/** Offline extraction for the mock pipeline. Keyed off the sample transcripts. */
function mockExtraction(transcript: string): ExtractionOutcome {
  const isPunjabi = /ਮਰੀਜ਼|ਕੌਰ/.test(transcript);
  const isDiabetic = /diabetic|Metformin/i.test(transcript);

  const extraction: Extraction = isPunjabi
    ? {
        patient_name: "Simran Kaur",
        age_years: 28,
        diagnosis: "Migraine",
        treatment: "Naproxen for 7 days; advised to track triggers and review if unresolved.",
        consultation_fee_inr: null,
        prescription: [
          {
            drug_name: "Naproxen",
            strength: "250 mg",
            form: "tab",
            frequency_spoken: "BD",
            duration: "satt din",
            instructions: null,
          },
        ],
        uncertain_fields: [],
        notes_for_doctor: null,
      }
    : isDiabetic
      ? {
          patient_name: "Anil Sharma",
          age_years: 65,
          diagnosis: "Type 2 diabetes mellitus, poorly controlled; hypertension",
          treatment: "Continue Metformin, add Telmisartan. Review in two weeks.",
          consultation_fee_inr: null,
          prescription: [
            {
              drug_name: "Metformin",
              strength: "500 mg",
              form: "tab",
              frequency_spoken: "1-0-1",
              duration: null,
              instructions: "continue",
            },
            {
              drug_name: "Telmisartan",
              strength: "40 mg",
              form: "tab",
              frequency_spoken: "morning",
              duration: null,
              instructions: null,
            },
          ],
          uncertain_fields: ["treatment"],
          notes_for_doctor: "Duration was not stated for either drug.",
        }
      : {
          patient_name: "Rajesh Kumar",
          age_years: 42,
          diagnosis: "Acute pharyngitis",
          treatment: "Azithromycin course with Paracetamol as needed for fever.",
          consultation_fee_inr: /fees?\s+(?:paanch\s+sau|500)/i.test(transcript) ? 500 : null,
          prescription: [
            {
              drug_name: "Azithromycin",
              strength: "500 mg",
              form: "tab",
              frequency_spoken: "once daily",
              duration: "5 days",
              instructions: null,
            },
            {
              drug_name: "Paracetamol",
              strength: "650 mg",
              form: "tab",
              frequency_spoken: "SOS",
              duration: null,
              instructions: null,
            },
          ],
          uncertain_fields: [],
          notes_for_doctor: null,
        };

  return {
    extraction,
    issues: validateExtraction(extraction),
    model: "mock",
  };
}
