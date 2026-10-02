import assert from "node:assert/strict";
import { test } from "node:test";
import { clinicDay, clinicDayWindow } from "../../src/lib/workspace.ts";
import { parseDashboardUrlState } from "../../src/lib/url-state.ts";

test("the clinic date changes at Indian midnight, independently of the device timezone", () => {
  assert.equal(clinicDay("2026-09-06T18:29:59Z"), "2026-09-06");
  assert.equal(clinicDay("2026-09-06T18:30:00Z"), "2026-09-07");
  assert.deepEqual(clinicDayWindow("2026-09-07"), {
    from: "2026-09-06T18:30:00.000Z",
    to: "2026-09-07T18:30:00.000Z",
  });
});

test("opening a year of unfinished visits survives URL parsing", () => {
  const state = parseDashboardUrlState({
    view: "register",
    days: "365",
    status: "draft",
  });
  assert.equal(state.days, 365);
  assert.equal(state.status, "draft");
});
