import "server-only";

import { llmMockEnabled } from "@/lib/env";
import { generateStructured } from "./index";
import { UtteranceKindSchema, type UtteranceKind } from "./schema";

/**
 * Is this a consultation or a question?
 *
 * The dock has one key, so everything a doctor says arrives through the same
 * pipe: "Rajesh Kumar, forty-two, acute pharyngitis, Azithromycin 500" and
 * "what did I prescribe Rajesh last time?" are the same request as far as the
 * transcript route can tell. Without this step the second one files a
 * consultation for a patient called Rajesh.
 *
 * ## Why the cheap tier is the right call here
 *
 * This is the one model call that sits in front of the extraction the doctor is
 * waiting on, so it is priced accordingly: a single enum out of two, from a
 * transcript that is at most thirty seconds of speech. It is also the rare kind
 * of mistake that is visible and reversible in both directions (see below),
 * which is the test `types.ts` sets for `fast`.
 *
 * ## Which way to fall when it is genuinely unclear
 *
 * Towards `dictation`, always, and the asymmetry is worth being explicit about
 * because it is not obvious:
 *
 *  - A question read as a consultation lands on the review sheet, where the
 *    doctor discards it with one tap. Nothing was committed; nothing was lost.
 *  - A consultation read as a question makes the visit the doctor just spoke
 *    appear to vanish. It has not — `/api/encounters/transcribe` has already
 *    written the transcript row, and the recall result carries a "Record as a
 *    visit instead" action back to extraction — but a doctor mid-clinic will
 *    reasonably assume it is gone and dictate the whole thing again.
 *
 * So the second failure costs a re-dictation and a moment of believing the app
 * eats consultations. The first costs a tap.
 */

const CLASSIFIER_SYSTEM = `You are given the transcript of something a doctor just said into their clinic app. Decide which of exactly two things it was.

**dictation** — the doctor is recording a consultation that has just happened, so that it goes into their register. It typically carries some combination of a patient's name, an age, a complaint, a clinical impression, drugs with strengths and frequencies, advice, follow-up, and a consultation fee. This is what the microphone is for and it is the large majority of what it hears.

**question** — the doctor is asking the app for something that is already in their register: what they prescribed a patient last time, when they last saw someone, how many patients they saw last week, how much they earned this month. This also covers a request to put a patient's chart on screen — "pull up Sunita's records", "Sunita ki file kholo", "open Anil Sharma's chart" — which is phrased as an instruction rather than a question but is still a request for records that already exist, not a new one being recorded.

Two things make this harder than it looks.

**The doctor speaks code-mixed English, Hindi and Punjabi**, and a request is very often a plain imperative with no question word anywhere in it. "Sunita ke records dikhao" is a request for records. "Sunita ko Dolo 650 diya, teen din" is a consultation. The grammar does not separate them; what is being talked about does.

**Dictation is full of interrogatives that are not addressed to you.** A doctor dictating will restate what they asked the patient — "bukhar kab se hai, teen din se", "koi allergy? nahin" — and will use present-tense phrasing throughout. That is a consultation being recorded, not a question being asked. The test is whether the answer would have to be looked up in past records: if the doctor is telling you what happened just now, it is dictation, however many question marks it contains.

If you cannot tell, answer dictation. A question mistaken for a consultation is discarded on the review sheet in one tap and nothing is recorded. A consultation mistaken for a question looks to the doctor as though the visit they just spoke has been thrown away, and they will speak it all again.`;

/**
 * Classify one utterance. Never throws.
 *
 * A provider blip must not cost a doctor the consultation they have just
 * finished speaking, and the recoverable direction is known — so a classifier
 * that cannot answer is treated as having said `dictation`, which puts the
 * utterance on the review sheet where a human decides.
 */
export async function classifyUtterance(transcript: string): Promise<UtteranceKind> {
  if (llmMockEnabled()) return mockKind(transcript);

  try {
    const { value } = await generateStructured({
      system: CLASSIFIER_SYSTEM,
      user: `Transcript:\n\n${transcript}`,
      schema: UtteranceKindSchema,
      schemaName: "utterance_kind",
      tier: "fast",
      // Far more than one enum needs, because reasoning tokens come out of the
      // same budget on both providers and a truncated answer here is a failed
      // dictation rather than a slightly worse one.
      maxOutputTokens: 1024,
    });
    return value.kind;
  } catch (error) {
    console.warn("[intent] classification failed — treating as dictation", error);
    return "dictation";
  }
}

/**
 * Openers that mean the doctor is asking rather than recording.
 *
 * Matched only against the first few words, because these are opening moves:
 * "kitne" halfway through a sentence is usually counting tablets. Absent from
 * the list on purpose: "do" and "does", because "do" is Hindi for two and this
 * corpus is full of "do baar" and "do hafte".
 */
const QUESTION_OPENERS =
  /(?:^|\s)(?:what|when|which|who|whose|how|why|where|did|show|pull|bring|open|find|search|tell|list|kya|kab|kaun|kitna|kitne|kitni|dikhao|dikha|batao|nikalo|kholo|क्या|कब|कौन|कितना|कितने|दिखाओ|बताओ|खोलो|ਕੀ|ਕਦੋਂ|ਕੌਣ|ਕਿੰਨੇ|ਦਿਖਾਓ|ਖੋਲ੍ਹੋ)(?:\s|['’]|$)/;

/**
 * Offline classification, so `LLM_MOCK=1` demonstrates both paths with no keys
 * and no network. A leading-word test is enough for that job and is not trying
 * to be the real classifier: the sample dictations in `stt/mock.ts` open on a
 * patient's name in three scripts, and every question a demo asks opens on one
 * of the words above.
 */
function mockKind(transcript: string): UtteranceKind {
  const opening = transcript.trim().toLowerCase().split(/\s+/).slice(0, 4).join(" ");
  return QUESTION_OPENERS.test(opening) ? "question" : "dictation";
}
