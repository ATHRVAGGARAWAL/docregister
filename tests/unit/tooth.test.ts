import assert from "node:assert/strict";
import { test } from "node:test";

import {
  allTeeth,
  archOf,
  chartOrder,
  extractFdiTeeth,
  isFdiTooth,
  parseSurfaces,
  parseToothReference,
  positionOf,
  quadrantOf,
  sideOf,
  sortSurfaces,
  toothClass,
  toothName,
} from "../../src/lib/dental/tooth.ts";

/**
 * FDI notation is the one field in a dental record where a near-miss is not a
 * near-miss: 36 and 46 are the same tooth on opposite sides of the mouth, and
 * treating one as the other is treating the wrong tooth. These are the cases
 * the module claims to get right.
 */

test("the gaps in FDI numbering are not teeth", () => {
  // Every one of these is inside 11..48 and none of them exists. A range check
  // would accept all seven, which is the reason the module does arithmetic.
  for (const notATooth of [10, 19, 20, 29, 30, 39, 40, 49]) {
    assert.equal(isFdiTooth(notATooth), false, `${notATooth} is not a tooth`);
  }
  for (const tooth of [11, 18, 21, 28, 31, 38, 41, 48]) {
    assert.equal(isFdiTooth(tooth), true, `${tooth} is a tooth`);
  }
});

test("primary teeth stop at position five", () => {
  for (const tooth of [51, 55, 65, 75, 85]) {
    assert.equal(isFdiTooth(tooth), true, `${tooth} is a primary tooth`);
  }
  for (const notATooth of [56, 66, 76, 86, 58]) {
    assert.equal(isFdiTooth(notATooth), false, `${notATooth} is not a primary tooth`);
  }
});

test("a child has no premolars", () => {
  // Positions 4 and 5 are premolars in an adult and molars in a child. Calling
  // 54 a premolar on a chart would be wrong in a way a dentist would notice
  // immediately and a patient would not.
  assert.equal(toothClass(14), "premolar");
  assert.equal(toothClass(15), "premolar");
  assert.equal(toothClass(54), "molar");
  assert.equal(toothClass(55), "molar");
  assert.equal(toothName(54), "upper right primary first molar");
});

test("quadrants map to the patient's own left and right", () => {
  assert.deepEqual(
    [archOf(11), sideOf(11)],
    ["upper", "right"],
    "quadrant 1 is the patient's upper right",
  );
  assert.deepEqual([archOf(21), sideOf(21)], ["upper", "left"]);
  assert.deepEqual([archOf(31), sideOf(31)], ["lower", "left"]);
  assert.deepEqual([archOf(41), sideOf(41)], ["lower", "right"]);
  // Primary quadrants run in the same order, 5 through 8.
  assert.deepEqual([archOf(51), sideOf(51)], ["upper", "right"]);
  assert.deepEqual([archOf(61), sideOf(61)], ["upper", "left"]);
  assert.deepEqual([archOf(71), sideOf(71)], ["lower", "left"]);
  assert.deepEqual([archOf(81), sideOf(81)], ["lower", "right"]);
});

test("the two teeth a dentation confusion would swap have different names", () => {
  assert.equal(toothName(36), "lower left first molar");
  assert.equal(toothName(46), "lower right first molar");
  assert.notEqual(toothName(36), toothName(46));
});

test("a full dentition is thirty-two teeth, and a primary one is twenty", () => {
  assert.equal(allTeeth("permanent").length, 32);
  assert.equal(allTeeth("primary").length, 20);
  assert.equal(new Set(allTeeth("permanent")).size, 32, "no duplicates");
  assert.ok(allTeeth("permanent").every(isFdiTooth), "every generated tooth is valid");
  assert.ok(allTeeth("primary").every(isFdiTooth), "every generated primary tooth is valid");
});

test("chart order runs left to right across the screen", () => {
  const order = chartOrder("permanent");
  assert.equal(order.length, 32);
  assert.deepEqual([...new Set(order)].length, 32, "every tooth appears once");

  // The patient's right is drawn on the left, back tooth first, running in to
  // the midline — then straight out again through the patient's left. The
  // midline crossing is the part worth pinning: it is where a reversed quadrant
  // would show up.
  assert.deepEqual(order.slice(0, 3), [18, 17, 16], "upper row starts at the patient's right");
  assert.deepEqual(order.slice(6, 10), [12, 11, 21, 22], "upper row crosses the midline");
  assert.equal(order[15], 28, "upper row ends at the patient's left third molar");

  assert.equal(order[16], 48, "lower row starts at the patient's right third molar");
  assert.deepEqual(order.slice(22, 26), [42, 41, 31, 32], "lower row crosses the midline");
  assert.equal(order.at(-1), 38, "lower row ends at the patient's left third molar");
});

/* ---------------------------------------------------------------------------
 * Parsing
 * ------------------------------------------------------------------------ */

test("a bare two-digit number is the common case and needs no review", () => {
  for (const spoken of ["36", "tooth 36", "36 mein dard hai", " 36 "]) {
    assert.deepEqual(
      parseToothReference(spoken),
      { fdi: 36, needsReview: false },
      `"${spoken}" should read as 36`,
    );
  }
});

test("Devanagari and Gurmukhi digits parse", () => {
  // `dosage.ts` records that every native-script pattern in it was written with
  // `\b` and was therefore unreachable, because JavaScript's word boundary is
  // ASCII-only. This module maps digits character by character to stay clear of
  // that trap, and this is the test that would have caught it.
  assert.deepEqual(parseToothReference("३६"), { fdi: 36, needsReview: false });
  assert.deepEqual(parseToothReference("੩੬"), { fdi: 36, needsReview: false });
  assert.deepEqual(parseToothReference("दांत ४६ में दर्द"), { fdi: 46, needsReview: false });
  assert.deepEqual(parseToothReference("੧੧"), { fdi: 11, needsReview: false });
});

test("English number words parse, spelled out and digit by digit", () => {
  assert.deepEqual(parseToothReference("thirty six"), { fdi: 36, needsReview: false });
  assert.deepEqual(parseToothReference("thirty-six"), { fdi: 36, needsReview: false });
  assert.deepEqual(parseToothReference("three six"), { fdi: 36, needsReview: false });
  assert.deepEqual(parseToothReference("four eight"), { fdi: 48, needsReview: false });
});

test("a descriptive reference resolves against the dentition", () => {
  assert.deepEqual(
    parseToothReference("lower left first molar"),
    { fdi: 36, needsReview: false },
  );
  assert.deepEqual(
    parseToothReference("upper right canine"),
    { fdi: 13, needsReview: false },
  );
  assert.deepEqual(
    parseToothReference("wisdom tooth lower right"),
    { fdi: 48, needsReview: false },
  );
  // The same words mean a different tooth in a child.
  assert.deepEqual(
    parseToothReference("upper right first molar", "primary"),
    { fdi: 54, needsReview: false },
  );
});

test("something said that did not land is flagged, not dropped", () => {
  // The distinction that matters: nothing said is not the same as something
  // said that could not be read. The first is an empty field, the second is a
  // question for the dentist.
  assert.deepEqual(parseToothReference(null), { fdi: null, needsReview: false });
  assert.deepEqual(parseToothReference(""), { fdi: null, needsReview: false });

  for (const unparsed of ["19", "30", "99", "the back one", "upper left"]) {
    assert.deepEqual(
      parseToothReference(unparsed),
      { fdi: null, needsReview: true },
      `"${unparsed}" should be flagged for review`,
    );
  }
});

test("FDI teeth are extracted from diagnosis and treatment prose", () => {
  assert.deepEqual(extractFdiTeeth("Treatment to be done on tooth 32"), [32]);
  assert.deepEqual(extractFdiTeeth("Caries 16 and 26; RCT planned for tooth 36"), [16, 26, 36]);
});

test("free-text FDI extraction deduplicates and ignores invalid numbers", () => {
  assert.deepEqual(extractFdiTeeth("32, tooth 32, invalid 19 30 99, then 48"), [32, 48]);
  assert.deepEqual(extractFdiTeeth("case 132 and invoice 3200"), []);
});

test("free-text FDI extraction supports native-script digits", () => {
  assert.deepEqual(extractFdiTeeth("दांत ३२ और ४६"), [32, 46]);
  assert.deepEqual(extractFdiTeeth("ਦੰਦ ੧੧ ਅਤੇ ੨੧"), [11, 21]);
});

/* ---------------------------------------------------------------------------
 * Surfaces
 * ------------------------------------------------------------------------ */

test("surfaces come back canonical, deduped and in clinical order", () => {
  // Sorted because these arrays are stored and end up inside amendment
  // snapshots, where the same surfaces in a different order would read as an
  // edit that never happened.
  assert.deepEqual(sortSurfaces(["O", "M"]), ["M", "O"]);
  assert.deepEqual(sortSurfaces(["d", "m", "o"]), ["M", "O", "D"]);
  assert.deepEqual(sortSurfaces(["M", "M", "O"]), ["M", "O"]);
  assert.deepEqual(sortSurfaces(["X", "zzz"]), []);
});

test("surfaces parse from both the spoken and the written form", () => {
  assert.deepEqual(parseSurfaces("mesial occlusal"), ["M", "O"]);
  assert.deepEqual(parseSurfaces("MOD"), ["M", "O", "D"]);
  assert.deepEqual(parseSurfaces("mo"), ["M", "O"]);
  assert.deepEqual(parseSurfaces("distal"), ["D"]);
  assert.deepEqual(parseSurfaces(null), []);
});

test("quadrant and position decompose the number back again", () => {
  for (const tooth of allTeeth("permanent")) {
    assert.equal(quadrantOf(tooth) * 10 + positionOf(tooth), tooth);
  }
});
