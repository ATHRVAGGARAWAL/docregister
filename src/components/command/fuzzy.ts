/**
 * Subsequence matching for the command palette.
 *
 * Pure on purpose — no React, no DOM. What ends up at the top of the palette is
 * the part of it a doctor trusts without checking, so it has to be readable and
 * checkable on its own rather than through a rendered list.
 */

const COMBINING_MARK = /\p{M}/gu;
const ALPHANUMERIC = /[\p{L}\p{N}]/u;

/**
 * The weights.
 *
 * They are ordinal, not measured: all that matters is that a match at the start
 * of the text beats one at the start of a later word, which beats a run of
 * characters buried mid-word. Absolute values are meaningless outside a
 * comparison between two candidates for the same query.
 */
const START_BONUS = 18;
const WORD_START_BONUS = 12;
const CONSECUTIVE_BONUS = 10;
const LEADING_GAP_PENALTY = 1;
const MAX_LEADING_GAP_PENALTY = 12;
/** Rewards the shorter of two texts that match equally — "Register" over "Register export". */
const COVERAGE_BONUS = 10;

/**
 * How many starting positions are tried before the search settles for what it
 * has. A palette re-ranks on every keystroke, and a name repeating one letter
 * a dozen times is not worth a dozen more passes.
 */
const MAX_START_POSITIONS = 8;

/** Half-open `[start, end)` over the ORIGINAL text, so a caller can highlight it. */
export interface MatchRange {
  start: number;
  end: number;
}

export interface FuzzyMatch {
  score: number;
  ranges: MatchRange[];
}

/**
 * Case- and accent-folded, one output unit per input unit.
 *
 * `text.normalize("NFD")` over the whole string would be shorter and wrong:
 * decomposition changes the string's length, and every index this module hands
 * back has to address the text the caller is going to render.
 */
function fold(text: string): string {
  let folded = "";
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const stripped = char.normalize("NFD").replace(COMBINING_MARK, "").toLowerCase();
    // A lone combining mark folds to nothing and a few characters fold to two.
    // Either would shift every index after it, so the fold is pinned to 1:1.
    folded += stripped.length === 1 ? stripped : (stripped[0] ?? char);
  }
  return folded;
}

/** Start of the text, of a word, or of a camel-cased part. */
function isWordStart(text: string, index: number): boolean {
  if (index === 0) return true;
  const previous = text[index - 1];
  if (!ALPHANUMERIC.test(previous)) return true;
  const current = text[index];
  return previous === previous.toLowerCase() && current !== current.toLowerCase();
}

function findWordStart(folded: string, text: string, char: string, from: number): number {
  for (let index = folded.indexOf(char, from); index !== -1; index = folded.indexOf(char, index + 1)) {
    if (isWordStart(text, index)) return index;
  }
  return -1;
}

/**
 * One left-to-right pass with the first query character pinned at `start`.
 *
 * `preferWordStarts` is run as a separate pass rather than as the only rule
 * because skipping ahead to a word boundary can strand a later query character
 * that the plain greedy pass would have matched. Both passes run and the better
 * surviving one wins, so the preference can never turn a match into a miss.
 */
function matchFrom(
  text: string,
  folded: string,
  query: string,
  start: number,
  preferWordStarts: boolean,
): FuzzyMatch | null {
  const ranges: MatchRange[] = [];
  let score = 0;
  let previous = -2;

  for (let position = 0; position < query.length; position += 1) {
    let index: number;

    if (position === 0) {
      index = start;
      // Everything before the first match is dead weight, and it is the only
      // gap worth charging for: penalising the later ones would fight the
      // word-start bonus that makes "er" find "Export the register".
      score -= Math.min(index * LEADING_GAP_PENALTY, MAX_LEADING_GAP_PENALTY);
    } else {
      index = folded.indexOf(query[position], previous + 1);
      if (index === -1) return null;
      if (preferWordStarts && index !== previous + 1 && !isWordStart(text, index)) {
        const better = findWordStart(folded, text, query[position], index + 1);
        if (better !== -1) index = better;
      }
    }

    if (index === 0) score += START_BONUS;
    else if (isWordStart(text, index)) score += WORD_START_BONUS;
    if (index === previous + 1) score += CONSECUTIVE_BONUS;

    const last = ranges[ranges.length - 1];
    if (last && last.end === index) last.end = index + 1;
    else ranges.push({ start: index, end: index + 1 });

    previous = index;
  }

  return { score: score + Math.round((query.length / folded.length) * COVERAGE_BONUS), ranges };
}

/**
 * Score `text` against `query`, or null when the query is not a subsequence of it.
 *
 * Whitespace inside the query is matched literally, so "sunita d" narrows to a
 * surname the way a doctor typing a full name expects. An empty query matches
 * everything with no highlight, which is what leaves the palette's resting list
 * in the order its caller chose.
 */
export function fuzzyScore(text: string, query: string): FuzzyMatch | null {
  const trimmed = query.trim();
  if (trimmed === "") return { score: 0, ranges: [] };
  if (text === "") return null;

  const foldedText = fold(text);
  const foldedQuery = fold(trimmed);
  if (foldedQuery.length > foldedText.length) return null;

  let best: FuzzyMatch | null = null;
  let starts = 0;

  for (let index = 0; index < foldedText.length && starts < MAX_START_POSITIONS; index += 1) {
    if (foldedText[index] !== foldedQuery[0]) continue;
    starts += 1;

    for (const preferWordStarts of [true, false]) {
      const match = matchFrom(text, foldedText, foldedQuery, index, preferWordStarts);
      if (match && (best === null || match.score > best.score)) best = match;
    }
  }

  return best;
}

export interface HighlightSegment {
  text: string;
  match: boolean;
}

/** Splits `text` into matched and unmatched runs, in order, covering the whole string. */
export function highlightSegments(text: string, ranges: MatchRange[]): HighlightSegment[] {
  if (ranges.length === 0) return text === "" ? [] : [{ text, match: false }];

  const segments: HighlightSegment[] = [];
  let cursor = 0;

  for (const range of ranges) {
    if (range.start > cursor) segments.push({ text: text.slice(cursor, range.start), match: false });
    segments.push({ text: text.slice(range.start, range.end), match: true });
    cursor = range.end;
  }

  if (cursor < text.length) segments.push({ text: text.slice(cursor), match: false });
  return segments;
}
