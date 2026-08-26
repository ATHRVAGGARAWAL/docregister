import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeThemePreference, resolveTheme } from "../../src/lib/theme.ts";

test("missing or invalid theme preferences default to system", () => {
  assert.equal(normalizeThemePreference(null), "system");
  assert.equal(normalizeThemePreference("sepia"), "system");
  assert.equal(normalizeThemePreference("system"), "system");
});

test("system theme resolves from the current media preference", () => {
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
});
