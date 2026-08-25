/**
 * Deterministic dosage normaliser.
 *
 * Indian dosage shorthand is a post-processing problem, not a transcription
 * problem. No STT engine reliably emits "BD", "TDS", "SOS" or "1-0-1" from
 * spoken Indian-accented audio, and asking the LLM to normalise it invites a
 * confident wrong answer on something that is trivially rule-based.
 *
 * So the model is asked for `frequency_spoken` verbatim, and this table turns
 * it into a canonical code. Anything unrecognised is passed through untouched
 * and flagged, rather than guessed at.
 */

export type FrequencyCode =
  | "OD"
  | "BD"
  | "TDS"
  | "QID"
  | "HS"
  | "SOS"
  | "STAT"
  | "WEEKLY"
  | "ALT_DAY";

/** Canonical code -> what it means, for the review UI tooltip. */
export const FREQUENCY_LABELS: Record<FrequencyCode, string> = {
  OD: "Once a day",
  BD: "Twice a day",
  TDS: "Three times a day",
  QID: "Four times a day",
  HS: "At bedtime",
  SOS: "As needed",
  STAT: "Immediately, once",
  WEEKLY: "Once a week",
  ALT_DAY: "Every other day",
};

/**
 * Spoken forms across English, Hindi and Punjabi, plus the written shorthand a
 * doctor might dictate directly. Matched against a normalised lowercase form.
 */
const FREQUENCY_PATTERNS: { code: FrequencyCode; patterns: RegExp[] }[] = [
  {
    code: "OD",
    patterns: [
      /\bo\.?d\.?\b/,
      /\bonce\s+(a\s+)?(daily|day)\b/,
      /\bone\s+time\s+(a\s+)?day\b/,
      /\bdin\s+(mein|me)\s+(ek|1)\s+baar\b/,
      /\bek\s+baar\b/,
      /\bਇੱਕ\s*ਵਾਰ\b/,
      /\bएक\s*बार\b/,
      /\b1-0-0\b/,
      /\b0-0-1\b/,
    ],
  },
  {
    code: "BD",
    patterns: [
      /\bb\.?[di]\.?d?\.?\b/,
      /\btwice\s+(a\s+)?(daily|day)\b/,
      /\btwo\s+times\s+(a\s+)?day\b/,
      /\bdo\s+baar\b/,
      /\bsubah\s+shaam\b/,
      /\bsavere\s+shaam\b/,
      /\bਦੋ\s*ਵਾਰ\b/,
      /\bदो\s*बार\b/,
      /\bसुबह\s*शाम\b/,
      /\b1-0-1\b/,
    ],
  },
  {
    code: "TDS",
    patterns: [
      /\bt\.?[di]\.?[ds]\.?\b/,
      /\bthrice\b/,
      /\bthree\s+times\b/,
      /\bteen\s+baar\b/,
      /\bਤਿੰਨ\s*ਵਾਰ\b/,
      /\bतीन\s*बार\b/,
      /\b1-1-1\b/,
    ],
  },
  {
    code: "QID",
    patterns: [/\bq\.?i\.?d\.?\b/, /\bfour\s+times\b/, /\bchaar\s+baar\b/, /\bचार\s*बार\b/],
  },
  {
    code: "HS",
    patterns: [
      /\bh\.?s\.?\b/,
      /\bat\s+(bed\s?time|night)\b/,
      /\braat\s+(ko|mein)\b/,
      /\bਰਾਤ\s*ਨੂੰ\b/,
      /\bरात\s*को\b/,
      /\bsone\s+se\s+pehle\b/,
    ],
  },
  {
    code: "SOS",
    patterns: [
      /\bs\.?o\.?s\.?\b/,
      /\bp\.?r\.?n\.?\b/,
      /\bas\s+(and\s+when\s+)?(needed|required)\b/,
      /\bif\s+(needed|required|pain|fever)\b/,
      /\bzaroorat\s+(pe|par|ho\s+to)\b/,
      /\bਲੋੜ\s*ਪੈਣ\b/,
      /\bज़रूरत\s*पड़ने\b/,
    ],
  },
  {
    code: "STAT",
    patterns: [/\bstat\b/, /\bimmediately\b/, /\babhi\b/, /\bturant\b/, /\bਤੁਰੰਤ\b/],
  },
  {
    code: "WEEKLY",
    patterns: [/\bonce\s+a\s+week\b/, /\bweekly\b/, /\bhafte\s+mein\s+(ek|1)\b/, /\bਹਫ਼ਤੇ\b/],
  },
  {
    code: "ALT_DAY",
    patterns: [
      /\bevery\s+other\s+day\b/,
      /\balternate\s+day/,
      /\bek\s+din\s+chhod\s?kar\b/,
      /\bਇੱਕ\s*ਦਿਨ\s*ਛੱਡ/,
    ],
  },
];

export interface NormalisedFrequency {
  /** Canonical code, or null when nothing matched. */
  code: FrequencyCode | null;
  /** Human label for display. Falls back to the spoken text. */
  label: string;
  /** True when we could not confidently map it — the review UI highlights it. */
  needsReview: boolean;
}

export function normaliseFrequency(spoken: string | null): NormalisedFrequency {
  if (!spoken || !spoken.trim()) {
    return { code: null, label: "—", needsReview: false };
  }

  const haystack = spoken.toLowerCase().replace(/\s+/g, " ").trim();

  for (const { code, patterns } of FREQUENCY_PATTERNS) {
    if (patterns.some((p) => p.test(haystack))) {
      return { code, label: FREQUENCY_LABELS[code], needsReview: false };
    }
  }

  // Unrecognised: keep exactly what was said and ask the doctor. Never guess.
  return { code: null, label: spoken, needsReview: true };
}

/** Route, when the doctor states one. Oral is assumed and left null. */
export function normaliseRoute(text: string | null): string | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/\b(iv|intravenous)\b/.test(t)) return "IV";
  if (/\b(im|intramuscular)\b/.test(t)) return "IM";
  if (/\b(sc|subcutaneous)\b/.test(t)) return "SC";
  if (/\b(topical|lagana|ointment|cream)\b/.test(t)) return "topical";
  if (/\b(inhaler|nebuli[sz])/.test(t)) return "inhalation";
  if (/\b(po|oral|khana|mouth)\b/.test(t)) return "PO";
  return null;
}

/**
 * Duration in a consistent form. Handles Hindi/Punjabi day and week words,
 * which STT often leaves in the source language.
 */
export function normaliseDuration(text: string | null): string | null {
  if (!text) return null;
  const t = text.toLowerCase().trim();

  const spokenNumbers: Record<string, number> = {
    ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5,
    chhah: 6, chhe: 6, saat: 7, aath: 8, nau: 9, das: 10,
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
    eight: 8, nine: 9, ten: 10, fourteen: 14, fifteen: 15,
  };

  const match = t.match(/^([a-z]+|\d+)\s*(din|dino|days?|hafte?|weeks?|mahine?|months?)/);
  if (!match) return text;

  const [, rawCount, rawUnit] = match;
  const count = /^\d+$/.test(rawCount) ? Number(rawCount) : spokenNumbers[rawCount];
  if (!count) return text;

  const unit = /din|day/.test(rawUnit)
    ? "day"
    : /haft|week/.test(rawUnit)
      ? "week"
      : "month";

  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}
