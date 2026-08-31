import assert from "node:assert/strict";
import { test } from "node:test";

import {
  boundsOf,
  buildArch,
  crownSize,
  DEFAULT_CAMERA,
  project,
  projectTooth,
  ringPath,
  svgNumber,
  type Camera,
} from "../../src/lib/dental/arch.ts";
import { allTeeth, archOf, sideOf } from "../../src/lib/dental/tooth.ts";

/**
 * The arch is generated, not tabulated, which means a sign error in one place
 * mirrors the whole chart and puts every tooth on the wrong side of the
 * patient's mouth. Nothing about that failure looks broken on screen — it looks
 * like a chart. These are the invariants that would catch it.
 */

const PERMANENT = buildArch("permanent");
const byFdi = new Map(PERMANENT.map((placement) => [placement.fdi, placement]));

test("every tooth is placed exactly once", () => {
  assert.equal(PERMANENT.length, 32);
  assert.equal(byFdi.size, 32);
  assert.deepEqual(
    [...byFdi.keys()].sort((a, b) => a - b),
    allTeeth("permanent").sort((a, b) => a - b),
  );
  assert.equal(buildArch("primary").length, 20);
});

test("the patient's right is drawn on the left of the screen", () => {
  // The single most consequential line in the module. A chart is read as though
  // looking into the patient's mouth, so quadrants 1 and 4 — the patient's own
  // right — sit at negative x. Reversing this treats the wrong side.
  for (const placement of PERMANENT) {
    const expected = sideOf(placement.fdi) === "right" ? -1 : 1;
    assert.equal(
      Math.sign(placement.center.x),
      expected,
      `tooth ${placement.fdi} (patient's ${sideOf(placement.fdi)}) is on the wrong side`,
    );
  }
});

test("upper teeth sit above the midline and lower teeth below it", () => {
  // y grows downwards, matching SVG, so the upper arch is the negative one.
  // Building this the other way up is exactly how the first version of the
  // module drew the lower arch on top of the upper one.
  for (const placement of PERMANENT) {
    const expected = archOf(placement.fdi) === "upper" ? -1 : 1;
    assert.equal(
      Math.sign(placement.center.y),
      expected,
      `tooth ${placement.fdi} is in the wrong arch`,
    );
  }
});

test("each arch turns its incisors toward the other", () => {
  // The two arches face each other on a chart. An upper central incisor is
  // therefore the *lowest* upper tooth on screen and an upper third molar the
  // highest; the lower arch mirrors it. If a sign is wrong the arch inverts and
  // the mouth reads as opening the wrong way.
  for (let position = 1; position < 8; position += 1) {
    assert.ok(
      byFdi.get(10 + position + 1)!.center.y < byFdi.get(10 + position)!.center.y,
      `upper 1${position + 1} should sit higher on screen than 1${position}`,
    );
    assert.ok(
      byFdi.get(40 + position + 1)!.center.y > byFdi.get(40 + position)!.center.y,
      `lower 4${position + 1} should sit lower on screen than 4${position}`,
    );
  }
});

test("the arch is symmetric about the midline", () => {
  // 16 and 26 are the same tooth on opposite sides. If the quadrant mirroring
  // is right they are reflections; if the frames were flipped separately from
  // the geometry they will not be.
  for (let position = 1; position <= 8; position += 1) {
    const right = byFdi.get(10 + position)!;
    const left = byFdi.get(20 + position)!;
    assert.ok(
      Math.abs(right.center.x + left.center.x) < 1e-9,
      `1${position} and 2${position} are not mirrored in x`,
    );
    assert.ok(
      Math.abs(right.center.y - left.center.y) < 1e-9,
      `1${position} and 2${position} are not level`,
    );
  }
});

test("incisors sit nearest the midline and molars furthest out", () => {
  for (let position = 1; position < 8; position += 1) {
    const nearer = byFdi.get(10 + position)!;
    const further = byFdi.get(10 + position + 1)!;
    assert.ok(
      Math.abs(further.center.x) > Math.abs(nearer.center.x),
      `1${position + 1} should be further from the midline than 1${position}`,
    );
  }
});

test("teeth fill the arch without gaps or overlaps", () => {
  // The arch is scaled so its arc length equals the sum of the crown widths, so
  // two neighbours should be separated by almost exactly the average of their
  // two widths. A tolerance is needed because the centres are measured across
  // the chord and the widths along the curve.
  for (const quadrant of [1, 2, 3, 4]) {
    for (let position = 1; position < 8; position += 1) {
      const a = byFdi.get(quadrant * 10 + position)!;
      const b = byFdi.get(quadrant * 10 + position + 1)!;
      const gap = Math.hypot(b.center.x - a.center.x, b.center.y - a.center.y);
      const expected = (a.size.mesiodistal + b.size.mesiodistal) / 2;
      assert.ok(
        Math.abs(gap - expected) < expected * 0.12,
        `${a.fdi}→${b.fdi} centres are ${gap.toFixed(2)}mm apart, expected about ${expected.toFixed(2)}mm`,
      );
    }
  }
});

test("the buccal normal points away from the inside of the arch", () => {
  // Buccal is toward the cheek, so it points out of the arch — away from the
  // palate on top and away from the tongue below. On this layout that is
  // toward the opposite arch at the incisors. Getting it backwards turns every
  // crown inside out.
  assert.ok(byFdi.get(11)!.buccal.y > 0.9, "upper incisor buccal points at the lower arch");
  assert.ok(byFdi.get(21)!.buccal.y > 0.9, "upper incisor buccal points at the lower arch");
  assert.ok(byFdi.get(41)!.buccal.y < -0.9, "lower incisor buccal points at the upper arch");
  assert.ok(byFdi.get(31)!.buccal.y < -0.9, "lower incisor buccal points at the upper arch");

  // And on the posterior teeth it points outward, away from the midline.
  assert.ok(byFdi.get(17)!.buccal.x < 0, "upper right molar buccal points left");
  assert.ok(byFdi.get(27)!.buccal.x > 0, "upper left molar buccal points right");
});

test("the frame vectors are unit length and perpendicular", () => {
  for (const placement of PERMANENT) {
    const alongLength = Math.hypot(placement.along.x, placement.along.y);
    const buccalLength = Math.hypot(placement.buccal.x, placement.buccal.y);
    assert.ok(Math.abs(alongLength - 1) < 1e-9, `${placement.fdi} tangent is not unit length`);
    assert.ok(Math.abs(buccalLength - 1) < 1e-9, `${placement.fdi} normal is not unit length`);
    const dot = placement.along.x * placement.buccal.x + placement.along.y * placement.buccal.y;
    assert.ok(Math.abs(dot) < 1e-9, `${placement.fdi} frame is not perpendicular`);
  }
});

test("a molar's crown is bigger than an incisor's", () => {
  // The whole reason the outlines differ: a dentist confirming "36" has to see
  // a molar, not a shape with 36 written on it.
  assert.ok(crownSize(16).mesiodistal > crownSize(12).mesiodistal);
  assert.ok(crownSize(16).buccolingual > crownSize(12).buccolingual);
  assert.ok(crownSize(36).mesiodistal > crownSize(32).mesiodistal);
});

test("crowns are extruded away from the viewer", () => {
  for (const placement of PERMANENT) {
    assert.ok(placement.face.every((point) => point.z === 0), "the occlusal face is at z = 0");
    assert.ok(
      placement.back.every((point) => point.z < 0),
      "the back ring is pushed away from the viewer",
    );
    assert.equal(placement.face.length, placement.back.length);
  }
});

/* ---------------------------------------------------------------------------
 * Projection
 * ------------------------------------------------------------------------ */

test("a face-on camera preserves the layout", () => {
  const point = { x: 10, y: -20, z: 0 };
  const projected = project(point, DEFAULT_CAMERA);
  assert.ok(Math.abs(projected.x - 10) < 1e-9);
  assert.ok(Math.abs(projected.y + 20) < 1e-9);
  assert.equal(projected.depth, 0);
});

test("yaw swings the model about the vertical axis", () => {
  const camera: Camera = { ...DEFAULT_CAMERA, yaw: Math.PI / 2 };
  const projected = project({ x: 10, y: 0, z: 0 }, camera);
  // A quarter turn takes a point on the x axis onto the depth axis, so its
  // horizontal position collapses to zero.
  assert.ok(Math.abs(projected.x) < 1e-6, `expected x near 0, got ${projected.x}`);
});

test("perspective never divides by zero, even inside the model", () => {
  // A camera pushed into the geometry would otherwise flip the sign of the
  // whole scene, which renders as the chart turning inside out mid-drag.
  const camera: Camera = { ...DEFAULT_CAMERA, distance: 10 };
  const projected = project({ x: 5, y: 5, z: 1000 }, camera);
  assert.ok(Number.isFinite(projected.x) && Number.isFinite(projected.y));
  assert.ok(projected.x > 0, "the scene is not mirrored by a near camera");
});

test("a projected tooth yields a face, a body and a label position", () => {
  const tilted: Camera = { ...DEFAULT_CAMERA, yaw: 0.4, pitch: 0.3 };
  const geometry = projectTooth(byFdi.get(36)!, tilted);

  assert.equal(geometry.fdi, 36);
  assert.equal(geometry.toothClass, "molar");
  assert.ok(geometry.face.length >= 3, "the occlusal face is a polygon");
  assert.ok(geometry.body.length >= 3, "the crown silhouette is a polygon");
  assert.ok(Number.isFinite(geometry.labelAt.x) && Number.isFinite(geometry.labelAt.y));
});

test("the crown silhouette is convex and encloses the occlusal face", () => {
  // The hull is what replaced per-wall quads. Its two guarantees are that it
  // never self-intersects — which is what grew fins on a rotated crown before —
  // and that the occlusal face lies inside it, so painting the face on top
  // covers the body rather than peeking out from under it.
  const geometry = projectTooth(byFdi.get(16)!, { ...DEFAULT_CAMERA, yaw: 0.5, pitch: 0.4 });
  const hull = geometry.body;

  for (let i = 0; i < hull.length; i += 1) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const c = hull[(i + 2) % hull.length];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    assert.ok(cross >= -1e-9, "the silhouette turns the same way at every vertex");
  }

  for (const point of geometry.face) {
    let inside = true;
    for (let i = 0; i < hull.length; i += 1) {
      const a = hull[i];
      const b = hull[(i + 1) % hull.length];
      if ((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x) < -1e-6) inside = false;
    }
    assert.ok(inside, "every occlusal point is inside the silhouette");
  }
});

test("bounds enclose every projected point", () => {
  const teeth = PERMANENT.map((placement) => projectTooth(placement, DEFAULT_CAMERA));
  const bounds = boundsOf(teeth);
  assert.ok(bounds.minX < 0 && bounds.maxX > 0, "the arch straddles the midline");
  assert.ok(bounds.minY < 0 && bounds.maxY > 0, "both arches are inside the bounds");
  for (const tooth of teeth) {
    for (const point of tooth.face) {
      assert.ok(point.x >= bounds.minX && point.x <= bounds.maxX);
      assert.ok(point.y >= bounds.minY && point.y <= bounds.maxY);
    }
  }
});

test("bounds of nothing are still usable as a viewBox", () => {
  const bounds = boundsOf([]);
  assert.ok(bounds.maxX > bounds.minX && bounds.maxY > bounds.minY);
});

test("a ring becomes a closed SVG path", () => {
  const path = ringPath([
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
  ]);
  assert.match(path, /^M0\.00 0\.00L1\.00 0\.00L1\.00 1\.00Z$/);
  assert.equal(ringPath([]), "");
});

/* ---------------------------------------------------------------------------
 * Hydration safety
 * ------------------------------------------------------------------------ */

test("every number that becomes an SVG attribute is already rounded", () => {
  // This chart is rendered once on the server for the first paint and again in
  // the browser on hydration, on two different builds of V8. Their `Math.sin`
  // and `Math.cos` can disagree in the last bit, and React compares rendered
  // attributes as *strings* — so an unrounded coordinate is a hydration
  // mismatch that React reports and then refuses to repair.
  //
  // It cost a real one: `viewBox` and the tooth labels shipped at full float
  // precision and differed in the fourteenth decimal between Node and Chrome.
  // Nothing in the geometry assertions above could see it, because both sides
  // were individually correct.
  for (const camera of [
    DEFAULT_CAMERA,
    { ...DEFAULT_CAMERA, yaw: 0.4, pitch: 0.3 },
    { ...DEFAULT_CAMERA, yaw: -0.62, pitch: 0.51 },
  ]) {
    for (const placement of PERMANENT) {
      const tooth = projectTooth(placement, camera);
      assert.equal(tooth.labelAt.x, svgNumber(tooth.labelAt.x), `${tooth.fdi} label x unrounded`);
      assert.equal(tooth.labelAt.y, svgNumber(tooth.labelAt.y), `${tooth.fdi} label y unrounded`);
      assert.equal(tooth.labelSize, svgNumber(tooth.labelSize), `${tooth.fdi} label size unrounded`);
    }
  }
});

test("svgNumber is idempotent and keeps sub-pixel accuracy", () => {
  assert.equal(svgNumber(svgNumber(-44.097450799491355)), svgNumber(-44.097450799491355));
  assert.equal(svgNumber(-44.097450799491355), -44.1);
  assert.equal(svgNumber(0), 0);
  // The two values that actually differed between engines must now agree.
  assert.equal(svgNumber(-44.097450799491355), svgNumber(-44.097450799491334));
  assert.equal(svgNumber(-32.889232646106805), svgNumber(-32.889232646106784));
});

test("path coordinates carry exactly two decimals", () => {
  const path = ringPath(projectTooth(byFdi.get(36)!, { ...DEFAULT_CAMERA, yaw: 0.4, pitch: 0.3 }).face);
  for (const coordinate of path.matchAll(/-?\d+\.\d+/g)) {
    assert.match(coordinate[0], /^-?\d+\.\d{2}$/, `${coordinate[0]} is not at two decimals`);
  }
});
