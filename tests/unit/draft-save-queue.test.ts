import assert from "node:assert/strict";
import test from "node:test";

import { createDraftSaveQueue } from "../../src/lib/encounters/draft-save-queue.ts";

test("autosave and final save run in order with fresh draft versions", async () => {
  let releaseAutosave!: () => void;
  let markAutosaveStarted!: () => void;
  const autosaveGate = new Promise<void>((resolve) => {
    releaseAutosave = resolve;
  });
  const autosaveStarted = new Promise<void>((resolve) => {
    markAutosaveStarted = resolve;
  });
  const calls: Array<{ payload: string; version: number }> = [];
  const queue = createDraftSaveQueue(4, async (payload: string, version) => {
    calls.push({ payload, version });
    if (payload === "autosave") {
      markAutosaveStarted();
      await autosaveGate;
    }
    return { version: version + 1 };
  });

  const autosave = queue.enqueue("autosave");
  const finalSave = queue.enqueue("final");
  await autosaveStarted;

  assert.deepEqual(calls, [{ payload: "autosave", version: 4 }]);
  releaseAutosave();
  await Promise.all([autosave, finalSave]);

  assert.deepEqual(calls, [
    { payload: "autosave", version: 4 },
    { payload: "final", version: 5 },
  ]);
  assert.equal(queue.currentVersion(), 6);
});

test("a failed autosave does not prevent the explicit retry", async () => {
  const calls: number[] = [];
  const queue = createDraftSaveQueue(2, async (_payload: string, version) => {
    calls.push(version);
    if (calls.length === 1) throw new Error("offline");
    return { version: version + 1 };
  });

  await assert.rejects(queue.enqueue("autosave"), /offline/);
  const result = await queue.enqueue("final");

  assert.deepEqual(calls, [2, 2]);
  assert.equal(result.version, 3);
});
