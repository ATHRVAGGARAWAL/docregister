export interface RankedRecallCandidate {
  id: string;
  full_name: string;
  similarity: number;
}

/**
 * pg_trgm similarity at or above which a name is treated as the same name
 * rather than a lookalike. Below 1.0 so ordinary dictation noise still counts.
 */
const CONFIDENT_MATCH = 0.85;

/** How far ahead of the runner-up a fuzzy leader must be to resolve silently. */
const DECISIVE_GAP = 0.25;

/**
 * Resolve a spoken name only when the result is safe to act on without a tap.
 *
 * A short spoken name such as "Sunita" scores well below 0.85 against a stored
 * full name such as "Sunita Sharma", even though it is an exact name token. If
 * exactly one result contains all spoken name tokens, that unique row is a
 * better signal than the raw trigram score. Two Sunitas still remain ambiguous.
 */
export function resolveRecallCandidate<T extends RankedRecallCandidate>(
  candidates: T[],
  spokenName: string,
): T | null {
  const [top, next] = candidates;
  if (!top) return null;

  const tokenMatches = candidates.filter((candidate) =>
    containsAllNameTokens(candidate.full_name, spokenName),
  );
  if (tokenMatches.length === 1 && tokenMatches[0].id === top.id) return top;

  const decisive =
    top.similarity >= CONFIDENT_MATCH &&
    (next === undefined || top.similarity - next.similarity >= DECISIVE_GAP);
  return decisive ? top : null;
}

function containsAllNameTokens(fullName: string, spokenName: string): boolean {
  const fullTokens = new Set(nameTokens(fullName));
  const spokenTokens = nameTokens(spokenName);
  return spokenTokens.length > 0 && spokenTokens.every((token) => fullTokens.has(token));
}

function nameTokens(value: string): string[] {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}
