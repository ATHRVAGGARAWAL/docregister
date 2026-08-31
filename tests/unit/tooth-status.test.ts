import assert from "node:assert/strict";
import { test } from "node:test";

import {
  deriveToothStatus,
  statusLabel,
  summariseMouth,
  type ToothFindingRecord,
  type ToothProcedureRecord,
} from "../../src/lib/dental/tooth-status.ts";

/**
 * The derivation is a fold over history, and every case worth testing is a
 * *sequence*. A set-based rule — "any extraction means missing" — passes a
 * naive test and then reports an implant as a gap, or a tooth that was crowned
 * and later taken out as still crowned. These are those sequences.
 */

let clock = 0;
function record(
  tooth: number,
  effect: ToothProcedureRecord["tooth_effect"],
  surfaces?: string[],
): ToothProcedureRecord {
  clock += 1;
  return {
    tooth_fdi: tooth,
    // Ordered timestamps, so a test states a sequence by writing it in order.
    occurred_at: `2026-01-${String(clock).padStart(2, "0")}T10:00:00+05:30`,
    procedure_name: effect,
    tooth_effect: effect,
    surfaces,
  };
}

test("a tooth with no history is absent, not present-and-sound", () => {
  // The distinction matters: "nobody has recorded anything" is a different
  // fact from "examined and found sound", and the chart must not state the
  // second when it only knows the first.
  const statuses = deriveToothStatus([]);
  assert.equal(statuses.size, 0);
  assert.equal(statuses.get(36), undefined);
  assert.equal(statusLabel(undefined), "no history");
});

test("an extraction leaves the tooth missing", () => {
  const statuses = deriveToothStatus([record(36, "extracts")]);
  assert.equal(statuses.get(36)?.missing, true);
  assert.equal(statusLabel(statuses.get(36)), "missing");
});

test("an implant after an extraction is an implant, not a gap", () => {
  // The case a set-based rule gets wrong: the extraction is still in the
  // history, so "has any extraction" would keep reporting a missing tooth
  // years after it was replaced.
  const statuses = deriveToothStatus([record(36, "extracts"), record(36, "implants")]);
  const tooth = statuses.get(36)!;
  assert.equal(tooth.missing, false, "the site is no longer an absence");
  assert.equal(tooth.implant, true);
  assert.equal(statusLabel(tooth), "implant");
});

test("an extraction after a crown leaves nothing behind", () => {
  // The mirror of the case above, and the reason `extracts` clears the flags:
  // a crown flag surviving would render as a crowned gap.
  const statuses = deriveToothStatus([
    record(46, "root_treats"),
    record(46, "crowns"),
    record(46, "extracts"),
  ]);
  const tooth = statuses.get(46)!;
  assert.equal(tooth.missing, true);
  assert.equal(tooth.crowned, false, "the crown left with the tooth");
  assert.equal(tooth.rootTreated, false);
  assert.equal(statusLabel(tooth), "missing");
});

test("a root canal and a crown coexist", () => {
  // Not mutually exclusive, and clinically the normal sequence: an RCT'd molar
  // is crowned afterwards to stop it splitting.
  const statuses = deriveToothStatus([record(16, "root_treats"), record(16, "crowns")]);
  const tooth = statuses.get(16)!;
  assert.equal(tooth.rootTreated, true);
  assert.equal(tooth.crowned, true);
  assert.equal(statusLabel(tooth), "crowned, root treated");
});

test("restored surfaces accumulate across visits, deduped and in order", () => {
  const statuses = deriveToothStatus([
    record(26, "restores", ["M"]),
    record(26, "restores", ["O"]),
    record(26, "restores", ["M"]), // the same surface refilled
  ]);
  assert.deepEqual(statuses.get(26)?.restoredSurfaces, ["M", "O"]);
  assert.equal(statusLabel(statuses.get(26)), "filled MO");
});

test("surfaces come back in clinical order regardless of the order filled", () => {
  const statuses = deriveToothStatus([
    record(27, "restores", ["D"]),
    record(27, "restores", ["M", "O"]),
  ]);
  assert.deepEqual(statuses.get(27)?.restoredSurfaces, ["M", "O", "D"]);
});

test("an extraction wipes accumulated fillings", () => {
  const statuses = deriveToothStatus([
    record(37, "restores", ["M", "O"]),
    record(37, "extracts"),
  ]);
  assert.deepEqual(statuses.get(37)?.restoredSurfaces, []);
});

test("nothing is charted after a tooth is gone", () => {
  // Guards against a mis-entered procedure resurrecting an extracted tooth.
  const statuses = deriveToothStatus([
    record(38, "extracts"),
    record(38, "crowns"),
    record(38, "root_treats"),
    record(38, "restores", ["O"]),
    record(38, "seals"),
  ]);
  const tooth = statuses.get(38)!;
  assert.equal(tooth.missing, true);
  assert.equal(tooth.crowned, false);
  assert.equal(tooth.rootTreated, false);
  assert.equal(tooth.sealed, false);
  assert.deepEqual(tooth.restoredSurfaces, []);
});

test("a 'none' procedure is recorded but changes no state", () => {
  // An x-ray of 36 is history on 36 and says nothing about its condition.
  const statuses = deriveToothStatus([record(36, "none")]);
  const tooth = statuses.get(36)!;
  assert.equal(tooth.procedureCount, 1);
  assert.equal(tooth.missing, false);
  assert.equal(tooth.crowned, false);
  assert.deepEqual(tooth.restoredSurfaces, []);
});

test("out-of-order input still folds chronologically", () => {
  // SQL returns these ordered, but the reducer must not depend on the caller.
  const extraction = record(45, "extracts");
  const implant = record(45, "implants");
  const shuffled = deriveToothStatus([implant, extraction]);
  assert.equal(shuffled.get(45)?.implant, true, "the implant is still the later event");
  assert.equal(shuffled.get(45)?.missing, false);
});

test("a fabricated tooth number is dropped, not charted", () => {
  // The database constrains this, so reaching here means hand-built records.
  // A tooth that does not exist appearing on a chart is worse than an absence.
  const statuses = deriveToothStatus([
    { tooth_fdi: 19, occurred_at: "2026-01-01T00:00:00Z", procedure_name: "x", tooth_effect: "extracts" },
    { tooth_fdi: 56, occurred_at: "2026-01-01T00:00:00Z", procedure_name: "x", tooth_effect: "extracts" },
    record(36, "extracts"),
  ]);
  assert.deepEqual([...statuses.keys()], [36]);
});

test("several teeth are tracked independently", () => {
  const statuses = deriveToothStatus([
    record(36, "root_treats"),
    record(46, "extracts"),
    record(26, "restores", ["O"]),
    record(11, "crowns"),
  ]);
  assert.equal(statuses.size, 4);
  assert.equal(statuses.get(36)?.rootTreated, true);
  assert.equal(statuses.get(46)?.missing, true);
  assert.deepEqual(statuses.get(26)?.restoredSurfaces, ["O"]);
  assert.equal(statuses.get(11)?.crowned, true);
});

test("the summary counts a mouth", () => {
  const statuses = deriveToothStatus([
    record(36, "extracts"),
    record(46, "extracts"),
    record(46, "implants"),
    record(16, "root_treats"),
    record(16, "crowns"),
    record(26, "restores", ["M", "O"]),
  ]);
  const summary = summariseMouth(statuses);
  assert.equal(summary.missing, 1, "46 was replaced, so only 36 is missing");
  assert.equal(summary.implants, 1);
  assert.equal(summary.crowned, 1);
  assert.equal(summary.rootTreated, 1);
  assert.equal(summary.filled, 1);
  assert.equal(summary.treated, 4);
});

test("lastTreatedAt is the most recent, not the last seen", () => {
  const statuses = deriveToothStatus([
    { tooth_fdi: 36, occurred_at: "2026-05-01T00:00:00Z", procedure_name: "x", tooth_effect: "restores", surfaces: ["O"] },
    { tooth_fdi: 36, occurred_at: "2026-02-01T00:00:00Z", procedure_name: "x", tooth_effect: "none" },
  ]);
  assert.equal(statuses.get(36)?.lastTreatedAt, "2026-05-01T00:00:00Z");
});

test("a structured finding becomes chart state even without procedure history", () => {
  const findings: ToothFindingRecord[] = [{
    tooth_fdi: 36,
    finding: "caries",
    state: "existing",
    observed_at: "2026-06-01T00:00:00Z",
    surfaces: ["O", "M"],
    severity: "moderate",
  }];

  const tooth = deriveToothStatus([], findings).get(36)!;
  assert.deepEqual(tooth.activeFindings, [{
    finding: "caries",
    surfaces: ["M", "O"],
    severity: "moderate",
    observedAt: "2026-06-01T00:00:00Z",
  }]);
  assert.equal(statusLabel(tooth), "moderate caries MO");
});

test("a same-time structured finding takes precedence over completed procedure history", () => {
  const at = "2026-06-01T00:00:00Z";
  const tooth = deriveToothStatus(
    [{ tooth_fdi: 46, occurred_at: at, procedure_name: "Crown", tooth_effect: "crowns" }],
    [{ tooth_fdi: 46, finding: "missing", state: "existing", observed_at: at }],
  ).get(46)!;

  // A procedure describes what was completed; a finding documented at the
  // same moment is the clinician's final observation of the tooth today.
  assert.equal(tooth.missing, true);
  assert.equal(tooth.crowned, false);
  assert.equal(statusLabel(tooth), "missing");
});

test("later completed treatment resolves an earlier active structured finding", () => {
  const tooth = deriveToothStatus(
    [{
      tooth_fdi: 16,
      occurred_at: "2026-06-02T00:00:00Z",
      procedure_name: "Composite restoration",
      tooth_effect: "restores",
      surfaces: ["O"],
    }],
    [{
      tooth_fdi: 16,
      finding: "caries",
      state: "existing",
      observed_at: "2026-06-01T00:00:00Z",
      surfaces: ["O"],
    }],
  ).get(16)!;

  assert.deepEqual(tooth.activeFindings, []);
  assert.deepEqual(tooth.restoredSurfaces, ["O"]);
});
