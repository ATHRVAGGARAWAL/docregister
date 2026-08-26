import assert from "node:assert/strict";
import { test } from "node:test";

import { propagateCommitOutcome } from "../../src/lib/encounters/commit.ts";

test("commit results are validated and propagated without losing workflow context", () => {
  const payload = {
    encounterId: "11111111-1111-4111-8111-111111111111",
    patientId: "22222222-2222-4222-8222-222222222222",
    visitNumber: 7,
    isNewPatient: false,
    alreadyCommitted: true,
    accountEntryId: "33333333-3333-4333-8333-333333333333",
    accountEntryError: false,
  };
  let received: unknown;

  const outcome = propagateCommitOutcome(payload, (value) => {
    received = value;
  });

  assert.deepEqual(outcome, payload);
  assert.deepEqual(received, payload);
});

test("an incomplete commit result never opens post-commit actions", () => {
  assert.throws(
    () => propagateCommitOutcome({ encounterId: "encounter-only" }, () => undefined),
    /missing its patient/,
  );
});
