/**
 * FDI tooth notation, and the deterministic parser that reaches it.
 *
 * Two separate jobs live here, and the split matters.
 *
 * The first is the notation itself — what 36 means, which quadrant it is in,
 * whether it is a molar. That is arithmetic and there is exactly one right
 * answer.
 *
 * The second is turning what a dentist *said* into that number, and it follows
 * the rule `src/lib/llm/dosage.ts` already sets for dosage frequency: the model
 * is asked for the spoken form verbatim and a rule table converts it, because
 * a tooth number is not a judgement call and asking a model to make one invites
 * a confident wrong answer. Anything this table does not recognise is passed
 * through flagged rather than guessed at — a wrong tooth is a wrong tooth
 * extracted.
 */

/* -------------------------------------------------------------------------
 * The notation
 * ---------------------------------------------------------------------- */

/**
 * FDI two-digit notation: the first digit is the quadrant, the second the
 * position from the midline.
 *
 * Quadrants are numbered clockwise from the viewer's point of view, starting
 * upper-right, and they are the *patient's* right and left — not the viewer's.
 * That distinction is the one clinical error this module exists to prevent, so
 * it is repeated wherever a side is named.
 */
export type Quadrant = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type Dentition = "permanent" | "primary";

export type ToothClass = "incisor" | "canine" | "premolar" | "molar";

export type Arch = "upper" | "lower";

/** The patient's own side, never the viewer's. */
export type Side = "right" | "left";

/**
 * Is this a tooth that exists?
 *
 * Expressed as arithmetic rather than a list because FDI is not contiguous:
 * 19, 20, 29, 30, 39, 40 and 49 are all inside `11..48` and none of them is a
 * tooth. A range check would accept every one.
 *
 * Permanent quadrants 1–4 hold positions 1–8. Primary quadrants 5–8 hold
 * positions 1–5, because a child has no premolars — the two teeth in the
 * premolar's place are the first and second primary molars.
 */
export function isFdiTooth(value: number): boolean {
  if (!Number.isInteger(value)) return false;
  const quadrant = Math.floor(value / 10);
  const position = value % 10;
  if (quadrant >= 1 && quadrant <= 4) return position >= 1 && position <= 8;
  if (quadrant >= 5 && quadrant <= 8) return position >= 1 && position <= 5;
  return false;
}

export function quadrantOf(fdi: number): Quadrant {
  return Math.floor(fdi / 10) as Quadrant;
}

/** Position from the midline: 1 is the central incisor, counting distally. */
export function positionOf(fdi: number): number {
  return fdi % 10;
}

export function dentitionOf(fdi: number): Dentition {
  return quadrantOf(fdi) <= 4 ? "permanent" : "primary";
}

export function archOf(fdi: number): Arch {
  const quadrant = quadrantOf(fdi);
  // 1,2 upper permanent · 3,4 lower permanent · 5,6 upper primary · 7,8 lower primary
  return quadrant === 1 || quadrant === 2 || quadrant === 5 || quadrant === 6
    ? "upper"
    : "lower";
}

/** The patient's side. Quadrants 1, 4, 5 and 8 are the patient's right. */
export function sideOf(fdi: number): Side {
  const quadrant = quadrantOf(fdi);
  return quadrant === 1 || quadrant === 4 || quadrant === 5 || quadrant === 8
    ? "right"
    : "left";
}

/**
 * What kind of tooth this is.
 *
 * The primary branch is not a simplification of the permanent one. In the
 * primary dentition positions 4 and 5 are the first and second *molars*; there
 * is no such thing as a primary premolar, and labelling one would be wrong on
 * a chart a dentist reads at speed.
 */
export function toothClass(fdi: number): ToothClass {
  const position = positionOf(fdi);
  if (dentitionOf(fdi) === "primary") {
    if (position <= 2) return "incisor";
    if (position === 3) return "canine";
    return "molar";
  }
  if (position <= 2) return "incisor";
  if (position === 3) return "canine";
  if (position <= 5) return "premolar";
  return "molar";
}

const PERMANENT_POSITION_NAMES = [
  "central incisor",
  "lateral incisor",
  "canine",
  "first premolar",
  "second premolar",
  "first molar",
  "second molar",
  "third molar",
] as const;

const PRIMARY_POSITION_NAMES = [
  "central incisor",
  "lateral incisor",
  "canine",
  "first molar",
  "second molar",
] as const;

/**
 * The tooth in words, e.g. "lower left first molar".
 *
 * This is what makes the chart answer its own question. A highlighted shape
 * tells a dentist a tooth is selected; only the name tells them it is the tooth
 * they meant, which is the entire point of showing it back to them.
 */
export function toothName(fdi: number): string {
  if (!isFdiTooth(fdi)) return `tooth ${fdi}`;
  const names =
    dentitionOf(fdi) === "primary" ? PRIMARY_POSITION_NAMES : PERMANENT_POSITION_NAMES;
  const position = names[positionOf(fdi) - 1];
  const primary = dentitionOf(fdi) === "primary" ? "primary " : "";
  return `${archOf(fdi)} ${sideOf(fdi)} ${primary}${position}`;
}

/** Sentence-case form for a label: "Lower left first molar". */
export function toothLabel(fdi: number): string {
  const name = toothName(fdi);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Every tooth of a dentition, ordered upper-right → upper-left → lower-left → lower-right. */
export function allTeeth(dentition: Dentition): number[] {
  const quadrants: Quadrant[] = dentition === "permanent" ? [1, 2, 3, 4] : [5, 6, 7, 8];
  const count = dentition === "permanent" ? 8 : 5;
  const teeth: number[] = [];
  for (const quadrant of quadrants) {
    for (let position = 1; position <= count; position += 1) {
      teeth.push(quadrant * 10 + position);
    }
  }
  return teeth;
}

/**
 * Chart order: left-to-right across the screen, upper arch then lower.
 *
 * A chart is drawn as though looking into the patient's mouth, so the patient's
 * right (quadrants 1 and 4) is on the *left* of the screen and runs from the
 * back tooth inward to the midline. Reversing quadrants 1 and 4 here is what
 * puts them in that order.
 */
export function chartOrder(dentition: Dentition): number[] {
  const upperRight = dentition === "permanent" ? 1 : 5;
  const upperLeft = dentition === "permanent" ? 2 : 6;
  const lowerLeft = dentition === "permanent" ? 3 : 7;
  const lowerRight = dentition === "permanent" ? 4 : 8;
  const count = dentition === "permanent" ? 8 : 5;

  const run = (quadrant: number, reverse: boolean) => {
    const teeth = Array.from({ length: count }, (_, i) => quadrant * 10 + i + 1);
    return reverse ? teeth.reverse() : teeth;
  };

  return [
    ...run(upperRight, true),
    ...run(upperLeft, false),
    ...run(lowerRight, true),
    ...run(lowerLeft, false),
  ];
}

/* -------------------------------------------------------------------------
 * Surfaces
 * ---------------------------------------------------------------------- */

/**
 * Crown surfaces, in fixed clinical order.
 *
 * The order is not cosmetic. These arrays are stored and end up inside
 * amendment snapshots, where two lists of the same surfaces in a different
 * order would compare unequal and make a no-op edit look like a change.
 */
export const SURFACE_ORDER = ["M", "O", "I", "D", "B", "F", "L", "P"] as const;

export type ToothSurface = (typeof SURFACE_ORDER)[number];

export const SURFACE_NAMES: Record<ToothSurface, string> = {
  M: "mesial",
  O: "occlusal",
  I: "incisal",
  D: "distal",
  B: "buccal",
  F: "facial",
  L: "lingual",
  P: "palatal",
};

const SURFACE_WORDS: { surface: ToothSurface; patterns: RegExp[] }[] = [
  { surface: "M", patterns: [/\bmesial\b/, /\bmesio/] },
  { surface: "O", patterns: [/\bocclusal\b/, /\bocclus/] },
  { surface: "I", patterns: [/\bincisal\b/] },
  { surface: "D", patterns: [/\bdistal\b/, /\bdisto/] },
  { surface: "B", patterns: [/\bbuccal\b/, /\bbucco/] },
  { surface: "F", patterns: [/\bfacial\b/, /\blabial\b/] },
  { surface: "L", patterns: [/\blingual\b/, /\blinguo/] },
  { surface: "P", patterns: [/\bpalatal\b/, /\bpalatine\b/] },
];

/** Canonical, deduped and sorted into `SURFACE_ORDER`. */
export function sortSurfaces(surfaces: readonly string[]): ToothSurface[] {
  const seen = new Set<ToothSurface>();
  for (const raw of surfaces) {
    const code = raw.trim().toUpperCase();
    if ((SURFACE_ORDER as readonly string[]).includes(code)) seen.add(code as ToothSurface);
  }
  return SURFACE_ORDER.filter((surface) => seen.has(surface));
}

/**
 * Surfaces out of speech.
 *
 * Handles both how they are written ("MO", "MOD") and how they are said
 * ("mesial occlusal"). The letter form is only read when the whole token is
 * letters from the surface alphabet, so "OD" as an abbreviation is caught but
 * the "od" inside a word is not.
 */
export function parseSurfaces(spoken: string | null | undefined): ToothSurface[] {
  if (!spoken) return [];
  const text = spoken.toLowerCase();

  const found: ToothSurface[] = [];
  for (const { surface, patterns } of SURFACE_WORDS) {
    if (patterns.some((pattern) => pattern.test(text))) found.push(surface);
  }
  if (found.length > 0) return sortSurfaces(found);

  // Abbreviated form: a bare run of surface letters, e.g. "MOD", "mo".
  for (const token of text.split(/[^a-z]+/)) {
    if (token.length === 0 || token.length > SURFACE_ORDER.length) continue;
    const letters = token.toUpperCase().split("");
    if (letters.every((letter) => (SURFACE_ORDER as readonly string[]).includes(letter))) {
      found.push(...(letters as ToothSurface[]));
    }
  }
  return sortSurfaces(found);
}

/* -------------------------------------------------------------------------
 * Parsing a spoken tooth reference
 * ---------------------------------------------------------------------- */

export interface ParsedTooth {
  /** The FDI number, or null when nothing in the table matched. */
  fdi: number | null;
  /** True when the dentist has to look at this before it is trusted. */
  needsReview: boolean;
}

/**
 * Devanagari and Gurmukhi digits, mapped to ASCII.
 *
 * Digits rather than number words, deliberately. A dentist dictating in Hindi
 * says the tooth as a two-digit number far more often than as a compound
 * numeral, the digit mapping is exact, and the romanised word forms vary by
 * dialect ("chhattis" / "chatis" / "chhatis") in a way that would put guesswork
 * into the one field where a wrong answer is a wrong tooth. Unrecognised speech
 * is flagged for the dentist instead — the same trade `dosage.ts` makes.
 */
const NATIVE_DIGITS: Record<string, string> = {
  "०": "0", "१": "1", "२": "2", "३": "3", "४": "4",
  "५": "5", "६": "6", "७": "7", "८": "8", "९": "9",
  "੦": "0", "੧": "1", "੨": "2", "੩": "3", "੪": "4",
  "੫": "5", "੬": "6", "੭": "7", "੮": "8", "੯": "9",
};

/**
 * Latinise the digits without touching anything else.
 *
 * No `\b` anywhere in this module's native-script handling, and that is on
 * purpose. JavaScript's word boundary is defined over ASCII `[A-Za-z0-9_]`, so
 * a pattern like `\b३` can never match — there is no ASCII word
 * character for the boundary to sit against. `dosage.ts` carries the same note
 * because every Devanagari and Gurmukhi pattern in it was written with `\b`
 * and was silently unreachable, in an app built for the doctors who speak those
 * languages. Mapping character-by-character avoids the trap entirely.
 */
function latiniseDigits(text: string): string {
  let out = "";
  for (const character of text) out += NATIVE_DIGITS[character] ?? character;
  return out;
}

/**
 * Find every valid FDI number written inside a longer clinical note.
 *
 * Diagnosis and treatment fields often contain the tooth reference in prose
 * rather than in a structured procedure row (for example, "RCT on tooth 32").
 * Keep this deliberately narrower than `parseToothReference`: free text can
 * contain several teeth, so we scan every isolated two-digit number, retain
 * only numbers that are real FDI teeth, and preserve first-mentioned order.
 */
export function extractFdiTeeth(text: string | null | undefined): number[] {
  if (!text) return [];

  const teeth: number[] = [];
  const seen = new Set<number>();
  const matches = latiniseDigits(text).matchAll(/(?<!\d)(\d{2})(?!\d)/g);

  for (const match of matches) {
    const tooth = Number(match[1]);
    if (!isFdiTooth(tooth) || seen.has(tooth)) continue;
    seen.add(tooth);
    teeth.push(tooth);
  }

  return teeth;
}

const ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4,
  five: 5, six: 6, seven: 7, eight: 8, nine: 9,
};

const TEENS: Record<string, number> = {
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80,
};

const QUADRANT_WORDS: { patterns: RegExp[]; arch: Arch; side: Side }[] = [
  { patterns: [/\bupper\s+right\b/, /\bright\s+upper\b/, /\bmaxillary\s+right\b/], arch: "upper", side: "right" },
  { patterns: [/\bupper\s+left\b/, /\bleft\s+upper\b/, /\bmaxillary\s+left\b/], arch: "upper", side: "left" },
  { patterns: [/\blower\s+right\b/, /\bright\s+lower\b/, /\bmandibular\s+right\b/], arch: "lower", side: "right" },
  { patterns: [/\blower\s+left\b/, /\bleft\s+lower\b/, /\bmandibular\s+left\b/], arch: "lower", side: "left" },
];

interface PositionWord {
  patterns: RegExp[];
  position: number;
}

const PERMANENT_POSITION_WORDS: PositionWord[] = [
  { patterns: [/\bcentral\s+incisor\b/, /\bcentral\b/], position: 1 },
  { patterns: [/\blateral\s+incisor\b/, /\blateral\b/], position: 2 },
  { patterns: [/\bcanine\b/, /\bcuspid\b/, /\beye\s+tooth\b/], position: 3 },
  { patterns: [/\bfirst\s+premolar\b/, /\bfirst\s+bicuspid\b/], position: 4 },
  { patterns: [/\bsecond\s+premolar\b/, /\bsecond\s+bicuspid\b/], position: 5 },
  { patterns: [/\bfirst\s+molar\b/], position: 6 },
  { patterns: [/\bsecond\s+molar\b/], position: 7 },
  { patterns: [/\bthird\s+molar\b/, /\bwisdom\s+tooth\b/, /\bwisdom\b/], position: 8 },
];

/**
 * The same words, renumbered for a child.
 *
 * Not a subset of the permanent table — a remapping. A primary "first molar" is
 * position 4, where an adult's first molar is position 6, because the primary
 * dentition has no premolars and its two molars sit in the place the premolars
 * will eventually take. Reusing the permanent numbering would resolve "upper
 * right first molar" to 56, which is not a tooth, and the reference would be
 * silently dropped.
 *
 * There is no third primary molar, so `wisdom` is deliberately absent and falls
 * through to being flagged.
 */
const PRIMARY_POSITION_WORDS: PositionWord[] = [
  { patterns: [/\bcentral\s+incisor\b/, /\bcentral\b/], position: 1 },
  { patterns: [/\blateral\s+incisor\b/, /\blateral\b/], position: 2 },
  { patterns: [/\bcanine\b/, /\bcuspid\b/, /\beye\s+tooth\b/], position: 3 },
  { patterns: [/\bfirst\s+molar\b/], position: 4 },
  { patterns: [/\bsecond\s+molar\b/], position: 5 },
];

function quadrantFor(arch: Arch, side: Side, dentition: Dentition): Quadrant {
  if (dentition === "primary") {
    if (arch === "upper") return side === "right" ? 5 : 6;
    return side === "right" ? 8 : 7;
  }
  if (arch === "upper") return side === "right" ? 1 : 2;
  return side === "right" ? 4 : 3;
}

/** English number words for the whole valid FDI range, e.g. "thirty six". */
function fromNumberWords(text: string): number | null {
  const words = text.split(/[\s-]+/).filter(Boolean);

  for (let i = 0; i < words.length; i += 1) {
    const tens = TENS[words[i]];
    if (tens !== undefined) {
      const ones = ONES[words[i + 1] ?? ""];
      const combined = ones === undefined ? tens : tens + ones;
      if (isFdiTooth(combined)) return combined;
      continue;
    }
    // Digit-by-digit: "three six" is how a two-digit tooth is usually said.
    const first = ONES[words[i]] ?? TEENS[words[i]];
    const second = ONES[words[i + 1] ?? ""];
    if (first !== undefined && second !== undefined && first >= 1 && first <= 8) {
      const combined = first * 10 + second;
      if (isFdiTooth(combined)) return combined;
    }
  }
  return null;
}

/**
 * A spoken tooth reference to an FDI number.
 *
 * Recognised, in this order: a bare two-digit number in Latin, Devanagari or
 * Gurmukhi digits; an English number-word form; and a descriptive English form
 * such as "lower left first molar". Anything else comes back
 * `{ fdi: null, needsReview: true }` and the review sheet asks the dentist.
 *
 * `dentition` decides which quadrants a *descriptive* reference resolves into —
 * "upper right first molar" is 16 in an adult and 55 in a child. It has no
 * effect on a numeric reference, which already names its own quadrant.
 */
export function parseToothReference(
  spoken: string | null | undefined,
  dentition: Dentition = "permanent",
): ParsedTooth {
  if (!spoken) return { fdi: null, needsReview: false };

  const text = latiniseDigits(spoken).toLowerCase().trim();
  if (text.length === 0) return { fdi: null, needsReview: false };

  // 1. Bare digits. Two digits is a tooth; anything else is not this field.
  const digitMatch = text.match(/(?<!\d)(\d{2})(?!\d)/);
  if (digitMatch) {
    const value = Number(digitMatch[1]);
    if (isFdiTooth(value)) return { fdi: value, needsReview: false };
    // A two-digit number that is not a tooth — 19, 30, 99 — is exactly the case
    // worth flagging rather than dropping: something was said and it did not
    // land, which is different from nothing being said.
    return { fdi: null, needsReview: true };
  }

  // 2. English number words.
  const spelled = fromNumberWords(text);
  if (spelled !== null) return { fdi: spelled, needsReview: false };

  // 3. Descriptive: quadrant plus position.
  const quadrantWord = QUADRANT_WORDS.find(({ patterns }) =>
    patterns.some((pattern) => pattern.test(text)),
  );
  if (quadrantWord) {
    const positionWords =
      dentition === "primary" ? PRIMARY_POSITION_WORDS : PERMANENT_POSITION_WORDS;
    const positionWord = positionWords.find(({ patterns }) =>
      patterns.some((pattern) => pattern.test(text)),
    );
    if (positionWord) {
      const quadrant = quadrantFor(quadrantWord.arch, quadrantWord.side, dentition);
      const fdi = quadrant * 10 + positionWord.position;
      if (isFdiTooth(fdi)) return { fdi, needsReview: false };
    }
    // A side was named and a tooth was not. The dentist has to finish the
    // sentence; the app must not pick a tooth for them.
    return { fdi: null, needsReview: true };
  }

  return { fdi: null, needsReview: true };
}
