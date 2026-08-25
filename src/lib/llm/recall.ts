import "server-only";

import { llmMockEnabled } from "@/lib/env";
import { generateStructured } from "./index";
import {
  RecallAnswerSchema,
  RecallQuerySchema,
  type RecallAnswer,
  type RecallQuery,
} from "./schema";

/**
 * Historical context recall.
 *
 * ## Why there is no vector database here
 *
 * The obvious reflex is to embed every encounter and do semantic search. That
 * would be the wrong call for this corpus:
 *
 *  - The unit of retrieval is a *patient*, and a patient has five to fifty
 *    encounters, not five million. Once the patient is resolved, "their last
 *    three visits" is an indexed lookup on `(patient_id, occurred_at desc)`
 *    that returns in single-digit milliseconds. Ranking by cosine similarity
 *    over that set adds nothing — recency is the ranking the doctor wants.
 *  - The genuinely hard step is resolving a *spoken name* to a patient row,
 *    and that is a fuzzy string problem (handled by pg_trgm in
 *    `match_patients`), not a semantic one. Embeddings are worse at it, not
 *    better: "Rajesh Kumar" and "Ramesh Kumar" sit close together in embedding
 *    space, which is precisely the confusion we must avoid in a medical record.
 *  - Every embedding is a second copy of PHI that has to be stored, secured,
 *    and kept in India. Not adding one is a compliance simplification.
 *
 * So: LLM parses the question into a structured filter, Postgres does the
 * retrieval, LLM summarises the rows it gets back. Revisit this only if
 * free-text clinical notes grow long enough that within-note search matters —
 * at which point Postgres full-text search is still the next step before
 * pgvector.
 */

const QUERY_PARSER_SYSTEM = `You convert a doctor's spoken or typed question about their own patient records into a structured database filter.

The doctor is mid-clinic and asks in natural language, frequently code-mixed across English, Hindi and Punjabi. Typical questions:

- "What did I prescribe Rajesh last time?"
- "Simran Kaur ko pichli baar kya diya tha?"
- "Show me Anil Sharma's visits this month"
- "ਪਿਛਲੇ ਮਹੀਨੇ ਕਿੰਨੇ ਮਰੀਜ਼ ਆਏ?"
- "How much did I earn from Mrs Gupta this year?"
- "Pull up Sunita Devi's records"

Your job is only to identify: which patient (if any), what kind of information is being asked for, how far back to look, and how many past encounters are needed. You do not answer the question — a later step does that with the actual records.

Extract the patient name into Latin script, transliterating from Devanagari or Gurmukhi where necessary. Include an honorific only if it is part of how the name would be stored; strip "Mr", "Mrs", "Dr" and similar. If the question is about the practice as a whole rather than one patient, set patient_name to null.

## open_record is different from the rest

Every other intent is a question that wants a sentence back. \`open_record\` is a request to put a patient's chart on screen, and it changes what the app does rather than what it says, so the line matters:

- "pull up Sunita's records", "open Anil Sharma's chart", "show me Rajesh's file", "Simran ki file kholo", "ਸਿਮਰਨ ਦਾ ਰਿਕਾਰਡ ਦਿਖਾਓ" — the doctor wants the chart itself. That is \`open_record\`.
- "what did I prescribe Sunita?", "when did I last see Rajesh?", "Simran ko pichli baar kya diya tha?" — the doctor wants a specific fact read back to them. Those stay \`last_prescription\`, \`visit_history\`, \`diagnosis_history\` or \`fees_history\`.

The distinguishing thing is the object of the request: a whole record, file, chart or history means \`open_record\`; a particular fact out of it does not. "Show me Anil Sharma's visits this month" is asking for a list of visits, not for his chart, so it is \`visit_history\`.

\`open_record\` needs a patient. If no name was spoken, it is not a chart request — use \`general\`. Set limit to about 5 for \`open_record\`: the chart loads its own history, and those few encounters are only there to be shown as the working underneath.

Map relative time expressions to a day count: "last time" implies no time limit but a limit of 1 encounter; "this month" is 30; "pichle hafte" / "last week" is 7; "is saal" / "this year" is 365. If no time frame is implied, leave time_range_days null.

Set limit to the smallest number that can answer the question: 1 for "last time", 3-5 for "recent visits", up to 20 for a full history.`;

const ANSWER_SYSTEM = `You answer a doctor's question about their own patient records, using only the encounter records provided.

Rules:

**Use only what you are given.** If the records do not contain the answer, say so plainly. Never fill a gap with a clinically plausible guess — the doctor is likely to act on your answer.

**Answer in the language the doctor asked in.** A question in Hindi gets a Hindi answer; a code-mixed question gets a code-mixed answer. Clinical terms and drug names stay in their original form regardless of language.

**Be brief.** Two or three sentences. This is read between patients, on a phone, often one-handed. Lead with the direct answer, then the date it came from.

**Always anchor to dates.** "On 14 March you prescribed..." not "you previously prescribed...". The doctor needs to know how stale the information is.

**Report drug details exactly** as recorded — name, strength, frequency, duration. Do not convert brand to generic or restate a dose in different units.

**Flag ambiguity in the caveat field.** If two patients share the queried name, if the most recent visit is very old, or if the records are sparse, say so there rather than burying it in the answer.

Set confidence honestly: high when the records directly answer the question, medium when you are inferring across visits, low when you are working from very little.`;

export interface EncounterRecord {
  id: string;
  occurred_at: string;
  diagnosis: string | null;
  treatment: string | null;
  fees_inr: number | null;
  patient_name: string;
  prescription: {
    drug_name: string;
    strength: string | null;
    frequency: string | null;
    duration: string | null;
  }[];
}

/**
 * A chart request, as the offline demo asks one.
 *
 * The discriminator is the noun, not the verb. "Pull up Sunita Devi's records",
 * "Simran ki file kholo" and "Sunita ke records dikhao" all name the whole
 * record; "Show me Anil Sharma's visits this month" names a list of visits and
 * must stay a question, because answering it by throwing a chart on screen
 * instead of a sentence is the wrong behaviour to demonstrate. So this asks for
 * a name followed by a word meaning the record entire, with the English
 * possessive or a Hindi postposition in between.
 *
 * Case-sensitive for the same reason the prescription pattern below is: the
 * name is found by its capitalisation, and an /i flag would happily return a
 * patient called Pull.
 */
const MOCK_CHART_REQUEST =
  /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)(?:['’]s)?\s+(?:ki\s+|ka\s+|ke\s+)?(?:records?|chart|file|history)\b/;

/** Step 1 — free text to a structured filter. */
export async function parseRecallQuery(question: string): Promise<RecallQuery> {
  if (llmMockEnabled()) {
    // Tested before the prescription pattern because the two overlap: "show me
    // Rajesh's file" would otherwise fall through to a last_prescription lookup
    // and answer with a sentence, which is the behaviour `open_record` exists
    // to replace.
    const chartName = question.match(MOCK_CHART_REQUEST)?.[1];
    if (chartName) {
      return {
        patient_name: chartName,
        intent: "open_record",
        // The chart loads its own history once it is open; these few encounters
        // are only the working shown underneath the answer in the panel behind.
        time_range_days: null,
        limit: 5,
      };
    }

    // Deliberately not case-insensitive as a whole: the name is found by its
    // capitalisation, so an /i flag would make `[A-Z][a-z]+` match "last time"
    // and hand back a patient called Last. Only the verb phrase varies in case
    // — "What did I prescribe …" is how the question is actually typed.
    const name = question.match(
      /(?:did\s+[Ii]\s+(?:prescribe|give)|prescribed\s+(?:to|for)|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
    )?.[1];
    return {
      patient_name: name ?? null,
      intent: "last_prescription",
      time_range_days: null,
      limit: 1,
    };
  }

  const { value } = await generateStructured({
    system: QUERY_PARSER_SYSTEM,
    user: question,
    schema: RecallQuerySchema,
    schemaName: "recall_query",
    // The only call in the app that runs on the cheap tier. It produces a
    // database filter, not a clinical statement, and a bad filter announces
    // itself immediately as an obviously wrong search — the doctor sees no
    // results or the wrong patient and rephrases. Nothing is recorded either
    // way, so there is no quiet failure mode to protect against.
    tier: "fast",
    maxOutputTokens: 2048,
  });
  return value;
}

/** Step 2 — summarise the rows Postgres returned. */
export async function answerFromRecords(
  question: string,
  records: EncounterRecord[],
): Promise<RecallAnswer> {
  if (records.length === 0) {
    return {
      answer: "I could not find any matching visits in your register.",
      referenced_encounter_ids: [],
      confidence: "low",
      caveat: "No encounters matched. Check the spelling of the patient's name.",
    };
  }

  if (llmMockEnabled()) {
    const latest = records[0];
    const drugs = latest.prescription
      .map((p) => [p.drug_name, p.strength, p.frequency].filter(Boolean).join(" "))
      .join(", ");
    return {
      answer: `On ${new Date(latest.occurred_at).toLocaleDateString("en-IN")}, you saw ${latest.patient_name} for ${latest.diagnosis ?? "an unspecified complaint"} and prescribed ${drugs || "no medication"}.`,
      referenced_encounter_ids: [latest.id],
      confidence: "high",
      caveat: null,
    };
  }

  const { value } = await generateStructured({
    system: ANSWER_SYSTEM,
    user: `Question: ${question}\n\nEncounter records (most recent first):\n${JSON.stringify(records, null, 2)}`,
    schema: RecallAnswerSchema,
    schemaName: "recall_answer",
    // Precise, even though this only summarises rows the database already
    // returned. The doctor reads this answer as fact and prescribes from it;
    // a drug name or a dose restated wrongly here is indistinguishable from
    // the record itself being wrong.
    tier: "precise",
    maxOutputTokens: 4096,
  });
  return value;
}
