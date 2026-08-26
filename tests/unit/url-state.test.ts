import assert from "node:assert/strict";
import { test } from "node:test";

import { parseDashboardUrlState } from "../../src/lib/url-state.ts";

test("follow-ups is a supported dashboard deep link", () => {
  assert.equal(parseDashboardUrlState({ view: "follow-ups" }).view, "follow-ups");
});

test("unknown dashboard views still fall back to overview", () => {
  assert.equal(parseDashboardUrlState({ view: "billing" }).view, "overview");
});

test("discarded drafts are a supported register recovery deep link", () => {
  assert.equal(
    parseDashboardUrlState({ view: "register", status: "discarded" }).status,
    "discarded",
  );
});
