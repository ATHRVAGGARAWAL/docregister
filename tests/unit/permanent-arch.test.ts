import assert from "node:assert/strict";
import { test } from "node:test";

import { permanentArchPlacements, toothNodeName } from "../../src/lib/dental/permanent-arch.ts";

test("the permanent 3D arch contains exactly one placement for every permanent tooth", () => {
  const placements = permanentArchPlacements();
  assert.equal(placements.length, 32);
  assert.equal(new Set(placements.map((tooth) => tooth.fdi)).size, 32);
  assert.equal(new Set(placements.map((tooth) => toothNodeName(tooth.fdi))).size, 32);
});

test("patient right is rendered on screen left in the 3D arch", () => {
  const byFdi = new Map(permanentArchPlacements().map((tooth) => [tooth.fdi, tooth]));
  assert.ok(byFdi.get(16)!.position[0] < 0);
  assert.ok(byFdi.get(26)!.position[0] > 0);
  assert.ok(byFdi.get(46)!.position[0] < 0);
  assert.ok(byFdi.get(36)!.position[0] > 0);
});

test("upper and lower teeth remain in their own visual arches", () => {
  const byFdi = new Map(permanentArchPlacements().map((tooth) => [tooth.fdi, tooth]));
  assert.ok(byFdi.get(11)!.position[1] > 0);
  assert.ok(byFdi.get(41)!.position[1] < 0);
});

