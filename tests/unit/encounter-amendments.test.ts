import assert from "node:assert/strict";
import test from "node:test";

import { applyEncounterAmendments } from "../../src/lib/encounter-amendments.ts";

test("amendment replay leaves the signed source unchanged and applies revisions in order", () => {
  const source = { diagnosis: "viral fever", fees_inr: 500, treatment: "Rest" };
  const effective = applyEncounterAmendments(source, [
    { after_values: { fees_inr: 600 } },
    { after_values: { diagnosis: "dengue suspected", treatment: "Hydration" } },
  ]);

  assert.deepEqual(source, { diagnosis: "viral fever", fees_inr: 500, treatment: "Rest" });
  assert.deepEqual(effective, { diagnosis: "dengue suspected", fees_inr: 600, treatment: "Hydration" });
});
