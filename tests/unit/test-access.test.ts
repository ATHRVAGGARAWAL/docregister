import assert from "node:assert/strict";
import { test } from "node:test";

import {
  matchesTestAccessCode,
  normalizeTestEmail,
  testEmailAllowlist,
} from "../../src/lib/auth/test-access.ts";

test("test access normalizes and allowlists exact email addresses", () => {
  const allowed = testEmailAllowlist(" RupieKansal@gmail.com, dr_rupie@yahoo.co.in ");

  assert.equal(allowed.has("rupiekansal@gmail.com"), true);
  assert.equal(allowed.has("dr_rupie@yahoo.co.in"), true);
  assert.equal(allowed.has("other@gmail.com"), false);
});

test("test access rejects malformed email values", () => {
  assert.equal(normalizeTestEmail("not-an-email"), null);
  assert.equal(normalizeTestEmail("a@b.com"), "a@b.com");
  assert.equal(normalizeTestEmail(null), null);
});

test("test access codes must be long and match exactly", () => {
  const code = "a-strong-testing-code-123456789";

  assert.equal(matchesTestAccessCode(code, code), true);
  assert.equal(matchesTestAccessCode(`${code}x`, code), false);
  assert.equal(matchesTestAccessCode("short", "short"), false);
});
