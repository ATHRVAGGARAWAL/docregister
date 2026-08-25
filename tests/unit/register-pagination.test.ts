import assert from "node:assert/strict";
import test from "node:test";

import { registerPageRange } from "../../src/lib/register-pagination.ts";

test("register pagination reports honest first and middle pages", () => {
  assert.deepEqual(registerPageRange(125, 0, 50), { from: 1, to: 50, hasMore: true });
  assert.deepEqual(registerPageRange(125, 50, 50), { from: 51, to: 100, hasMore: true });
  assert.deepEqual(registerPageRange(125, 100, 50), { from: 101, to: 125, hasMore: false });
});

test("register pagination handles an empty or out-of-range page", () => {
  assert.deepEqual(registerPageRange(0, 0, 50), { from: 0, to: 0, hasMore: false });
  assert.deepEqual(registerPageRange(3, 50, 50), { from: 0, to: 0, hasMore: false });
});
