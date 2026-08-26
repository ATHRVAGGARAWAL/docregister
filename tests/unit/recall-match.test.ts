import assert from "node:assert/strict";
import test from "node:test";

import { resolveRecallCandidate } from "../../src/lib/patients/recall-match.ts";

const candidate = (id: string, full_name: string, similarity: number) => ({
  id,
  full_name,
  similarity,
});

test("resolves one unique full-name token match for a short spoken name", () => {
  const sunita = candidate("sunita", "Sunita Sharma", 0.61);
  const result = resolveRecallCandidate(
    [sunita, candidate("anita", "Anita Sharma", 0.48)],
    "Sunita",
  );

  assert.equal(result?.id, "sunita");
});

test("does not guess when two patients share the spoken name", () => {
  const result = resolveRecallCandidate(
    [
      candidate("one", "Sunita Sharma", 0.61),
      candidate("two", "Sunita Devi", 0.59),
    ],
    "Sunita",
  );

  assert.equal(result, null);
});

test("does not auto-resolve one merely fuzzy low-confidence result", () => {
  const result = resolveRecallCandidate(
    [candidate("one", "Suman Sharma", 0.44)],
    "Sunita",
  );

  assert.equal(result, null);
});

test("retains decisive high-confidence fuzzy matching", () => {
  const result = resolveRecallCandidate(
    [
      candidate("one", "Sunita Devii", 0.9),
      candidate("two", "Anita Devi", 0.5),
    ],
    "Sunita Devi",
  );

  assert.equal(result?.id, "one");
});
