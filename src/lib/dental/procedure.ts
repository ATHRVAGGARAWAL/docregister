/**
 * The deterministic half of procedure extraction.
 *
 * The model is asked for `sitting_spoken` verbatim, exactly as it is asked for
 * `frequency_spoken` and `tooth_spoken`, and this table converts it. "First
 * sitting" is not a judgement call, and a model asked to emit the number
 * instead will occasionally emit a confident wrong one.
 */

/** Ordinals a dentist actually says, in the three languages this app hears. */
const ORDINALS: { value: number; patterns: RegExp[] }[] = [
  { value: 1, patterns: [/\bfirst\b/, /\b1st\b/, /\bpehl[ia]\b/, /\bpehli\b/] },
  { value: 2, patterns: [/\bsecond\b/, /\b2nd\b/, /\bdoosr[ia]\b/, /\bdusr[ia]\b/] },
  { value: 3, patterns: [/\bthird\b/, /\b3rd\b/, /\bteesr[ia]\b/, /\btisr[ia]\b/] },
  { value: 4, patterns: [/\bfourth\b/, /\b4th\b/, /\bchauth[ia]\b/] },
  { value: 5, patterns: [/\bfifth\b/, /\b5th\b/] },
  { value: 6, patterns: [/\bsixth\b/, /\b6th\b/] },
];

const CARDINALS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12,
};

export interface ParsedSitting {
  sitting: number | null;
  total: number | null;
  /** Something about sittings was said and did not resolve. */
  needsReview: boolean;
}

/**
 * "first sitting", "second of three", "doosri sitting", "2 of 3".
 *
 * Returns nulls for speech that says nothing about sittings at all — which is
 * most speech — and flags only the case where a sitting was clearly mentioned
 * and could not be read. Same distinction `parseToothReference` draws: nothing
 * said is an empty field, something said that did not land is a question.
 */
export function parseSitting(spoken: string | null | undefined): ParsedSitting {
  const empty: ParsedSitting = { sitting: null, total: null, needsReview: false };
  if (!spoken) return empty;

  const text = spoken.toLowerCase().trim();
  if (text.length === 0) return empty;

  // Does this even claim to be about sittings? "sitting", "visit", "appointment",
  // "of three", or a bare "N of M".
  const mentionsSitting = /\bsitting\b|\bsittings\b|\bvisit\b|\bappointment\b|\bof\s|\/|\bbaithak\b/.test(text)
    || /\b\d+\s*(?:of|\/)\s*\d+\b/.test(text);
  if (!mentionsSitting && !ORDINALS.some(({ patterns }) => patterns.some((p) => p.test(text)))) {
    return empty;
  }

  // "2 of 3" / "2/3" — the most explicit form, so it is read first.
  const numeric = text.match(/\b(\d+)\s*(?:of|\/)\s*(\d+)\b/);
  if (numeric) {
    const sitting = Number(numeric[1]);
    const total = Number(numeric[2]);
    if (inRange(sitting) && inRange(total) && sitting <= total) {
      return { sitting, total, needsReview: false };
    }
    return { sitting: null, total: null, needsReview: true };
  }

  const ordinal = ORDINALS.find(({ patterns }) => patterns.some((p) => p.test(text)));
  let sitting = ordinal?.value ?? null;
  if (sitting === null) {
    const bare = text.match(/\bsitting\s+(\d+)\b|\b(\d+)(?:st|nd|rd|th)?\s+sitting\b/);
    if (bare) sitting = Number(bare[1] ?? bare[2]);
  }

  // "... of three" / "... out of 3"
  let total: number | null = null;
  const ofWord = text.match(/\b(?:out\s+of|of)\s+([a-z]+|\d+)\b/);
  if (ofWord) {
    const token = ofWord[1];
    total = /^\d+$/.test(token) ? Number(token) : (CARDINALS[token] ?? null);
  }

  if (sitting !== null && !inRange(sitting)) return { sitting: null, total: null, needsReview: true };
  if (total !== null && !inRange(total)) total = null;
  if (sitting !== null && total !== null && sitting > total) {
    // "third of two" is not a thing. Keep neither rather than pick one.
    return { sitting: null, total: null, needsReview: true };
  }

  if (sitting === null && total === null) return { sitting: null, total: null, needsReview: true };
  return { sitting, total, needsReview: false };
}

function inRange(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 60;
}

/**
 * Procedures that are per-tooth by definition.
 *
 * These return `tooth` even when no tooth resolved, and that is the point. The
 * database refuses `scope = 'tooth'` with a null `tooth_fdi`
 * (`encounter_procedures_scope_consistent`), so a root canal the dentist did
 * not attach to a tooth cannot be saved — it goes to the review queue and stays
 * there until they say which tooth. Falling through to `other` instead would
 * store a root canal on nothing, silently and successfully, which is the worse
 * of the two failures by a wide margin.
 */
const PER_TOOTH =
  /\broot\s*canal\b|\brct\b|\bpulp|\bfilling\b|\brestorat|\bcomposite\b|\bgic\b|\bamalgam\b|\bextract|\bcrown\b|\bcap\b|\bimplant\b|\bsealant\b|\bpost\s*and\s*core\b|\bveneer\b|\binlay\b|\bonlay\b|\bapicect/;

/**
 * Which part of the mouth a procedure applies to, when the dentist did not say.
 *
 * A resolved tooth always wins. Otherwise the name decides, and `other` is the
 * last resort — it stores no location at all, so an unrecognised procedure
 * records an absence rather than a wrong tooth.
 */
export function inferScope(procedureName: string, toothFdi: number | null): string {
  if (toothFdi !== null) return "tooth";
  const name = procedureName.toLowerCase();
  // Checked before the wider scopes: "full mouth rehabilitation" is full_mouth,
  // but a plain "crown" with no tooth is a crown that needs a tooth.
  if (/\bopg\b|\bpanoramic\b|full\s*mouth|\bscaling\b|\bpolish|\bprophyla|\bbraces\b|\baligner|\bortho|\bfluoride\b|\bnight\s*guard\b/.test(name)) {
    return "full_mouth";
  }
  if (/\bdenture\b|\barch\b/.test(name)) return "arch";
  if (/\bquadrant\b/.test(name)) return "quadrant";
  if (PER_TOOTH.test(name)) return "tooth";
  return "other";
}

/**
 * A procedure as one short line for a register row: "36 MO Composite".
 *
 * Tooth first, because that is what a dentist scans a register for — the
 * question being asked of a list of visits is almost always "when did I last
 * touch that tooth", not "when did I last do a composite".
 */
export function procedureChip(input: {
  tooth_fdi?: number | null;
  surfaces?: readonly string[] | null;
  procedure_name: string;
  sitting_number?: number | null;
  total_sittings?: number | null;
}): string {
  const parts: string[] = [];
  if (input.tooth_fdi != null) parts.push(String(input.tooth_fdi));
  if (input.surfaces && input.surfaces.length > 0) parts.push(input.surfaces.join(""));
  parts.push(input.procedure_name);
  if (input.sitting_number != null) {
    parts.push(
      input.total_sittings != null
        ? `(${input.sitting_number}/${input.total_sittings})`
        : `(${input.sitting_number})`,
    );
  }
  return parts.join(" ");
}
