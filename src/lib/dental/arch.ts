/**
 * The dental arch as geometry, and the projection that puts it on screen.
 *
 * Pure maths, no React and no DOM, so the layout can be asserted in a unit test
 * rather than eyeballed in a browser. `tooth-chart.tsx` is the only consumer and
 * it does nothing but turn the polygons below into `<path>` elements.
 *
 * ## The layout, and why it is this one
 *
 * A real dental arch is a curve in the *horizontal* plane, with the teeth
 * standing vertically and the two arches biting against each other. That
 * arrangement cannot show both arches' biting surfaces to one camera — the
 * upper arch's occlusal surfaces face down and the lower's face up, so any
 * viewpoint that sees one hides the other. It is exactly why a paper chart
 * draws the two arches as two separate diagrams.
 *
 * So this model lays the arches out the way the chart does — both curves in the
 * screen plane, upper above and lower below, incisors of each facing the
 * midline — and spends the third dimension on *crown depth* instead. Every
 * tooth is a prism extruded away from the viewer.
 *
 * That buys the property worth having: at zero rotation this is exactly the
 * flat odontogram a dentist already reads, and rotating it reveals the crown
 * walls and the class-specific silhouette, which is what makes a tooth
 * identifiable as a molar rather than a premolar. The 3D is there to confirm a
 * tooth, not to be scenery.
 *
 * ## Handedness and which way is up
 *
 * `x` increases to the right of the screen at rest, and the chart is drawn as
 * though looking into the patient's mouth. The patient's right — quadrants 1
 * and 4 — is therefore on the *left*, at negative `x`. Getting this backwards
 * puts a filling in the wrong side of someone's mouth, so `sideOf` is the only
 * thing allowed to decide the sign.
 *
 * `y` increases **downwards**, matching SVG rather than mathematics. Building
 * this the other way up and flipping at the end is the obvious thing to do and
 * it is how the first version of this file drew the lower arch above the upper
 * one — the flip has to be remembered in the projection, the normals and the
 * bounds, and forgetting it in any one of them silently mirrors the chart.
 * Adopting the target coordinate system here means there is no flip to forget.
 *
 * So the upper arch sits at negative `y` with its incisors nearest the midline
 * and its molars sweeping up and out; the lower arch mirrors it below. The two
 * face each other the way a paper chart draws them.
 */

import {
  archOf,
  dentitionOf,
  positionOf,
  sideOf,
  toothClass,
  type Dentition,
  type ToothClass,
} from "./tooth.ts";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Point2 {
  x: number;
  y: number;
}

/* -------------------------------------------------------------------------
 * Crown dimensions
 *
 * Mesiodistal and buccolingual crown widths in millimetres, averaged from the
 * standard odontometric tables (Wheeler's). They are averages of a real
 * distribution, not measurements of the patient in the chair — their job here
 * is to make a first molar unmistakably bigger than a lateral incisor, and to
 * make the teeth fill the arch without gaps or overlaps.
 * ---------------------------------------------------------------------- */

interface CrownSize {
  /** Along the arch. Sets how much of the arch this tooth occupies. */
  mesiodistal: number;
  /** Across the arch, cheek to tongue. Sets the silhouette's depth. */
  buccolingual: number;
  /** Toward the viewer. Only ever a visual thickness. */
  height: number;
}

/** Indexed by position from the midline, 1-based. */
const PERMANENT_UPPER: readonly CrownSize[] = [
  { mesiodistal: 8.5, buccolingual: 7.0, height: 10.5 },
  { mesiodistal: 6.5, buccolingual: 6.0, height: 9.0 },
  { mesiodistal: 7.5, buccolingual: 8.0, height: 10.0 },
  { mesiodistal: 7.0, buccolingual: 9.0, height: 8.5 },
  { mesiodistal: 6.7, buccolingual: 9.0, height: 8.5 },
  { mesiodistal: 10.0, buccolingual: 11.0, height: 7.5 },
  { mesiodistal: 9.5, buccolingual: 11.0, height: 7.0 },
  { mesiodistal: 8.5, buccolingual: 10.0, height: 6.5 },
];

const PERMANENT_LOWER: readonly CrownSize[] = [
  { mesiodistal: 5.3, buccolingual: 6.0, height: 9.0 },
  { mesiodistal: 5.7, buccolingual: 6.5, height: 9.5 },
  { mesiodistal: 6.7, buccolingual: 7.5, height: 11.0 },
  { mesiodistal: 7.0, buccolingual: 7.5, height: 8.5 },
  { mesiodistal: 7.1, buccolingual: 8.0, height: 8.0 },
  { mesiodistal: 11.0, buccolingual: 10.5, height: 7.5 },
  { mesiodistal: 10.5, buccolingual: 10.0, height: 7.0 },
  { mesiodistal: 10.0, buccolingual: 9.5, height: 6.5 },
];

const PRIMARY_UPPER: readonly CrownSize[] = [
  { mesiodistal: 6.5, buccolingual: 5.0, height: 6.0 },
  { mesiodistal: 5.1, buccolingual: 4.0, height: 5.5 },
  { mesiodistal: 7.0, buccolingual: 7.0, height: 6.5 },
  { mesiodistal: 7.3, buccolingual: 8.5, height: 5.5 },
  { mesiodistal: 8.2, buccolingual: 10.0, height: 5.5 },
];

const PRIMARY_LOWER: readonly CrownSize[] = [
  { mesiodistal: 4.2, buccolingual: 4.0, height: 5.0 },
  { mesiodistal: 4.1, buccolingual: 4.0, height: 5.0 },
  { mesiodistal: 5.0, buccolingual: 4.8, height: 6.0 },
  { mesiodistal: 7.7, buccolingual: 7.0, height: 5.5 },
  { mesiodistal: 9.9, buccolingual: 8.7, height: 5.5 },
];

function crownSizes(fdi: number): readonly CrownSize[] {
  const upper = archOf(fdi) === "upper";
  if (dentitionOf(fdi) === "primary") return upper ? PRIMARY_UPPER : PRIMARY_LOWER;
  return upper ? PERMANENT_UPPER : PERMANENT_LOWER;
}

export function crownSize(fdi: number): CrownSize {
  return crownSizes(fdi)[positionOf(fdi) - 1];
}

/* -------------------------------------------------------------------------
 * The arch curve
 * ---------------------------------------------------------------------- */

/**
 * Shape of the half-arch, as the ratio of half-width to depth.
 *
 * The absolute size is not taken from here — it is solved for below, so that
 * the quarter-ellipse's arc length comes out exactly equal to the sum of the
 * crown widths that have to sit on it. Fixing the ratio and scaling to fit is
 * what guarantees the teeth meet at their contact points with no gap and no
 * overlap, at any dentition.
 */
const ARCH_SHAPE: Record<"upper" | "lower", { halfWidth: number; depth: number }> = {
  upper: { halfWidth: 27.5, depth: 40 },
  // Narrower, which is why the lower arch sits inside the upper one.
  lower: { halfWidth: 26, depth: 38 },
};

const ARC_SAMPLES = 512;

interface ArcTable {
  /** Cumulative arc length at each sampled angle, for a unit-scaled ellipse. */
  lengths: Float64Array;
  angles: Float64Array;
  total: number;
}

/**
 * Arc length along a quarter ellipse, sampled.
 *
 * There is no closed form for elliptic arc length, and the inverse — "which
 * angle is 23mm along this curve" — is what placing a tooth actually needs. A
 * sampled table inverted by linear interpolation is exact to well under a pixel
 * at this sample count and is far easier to be sure of than a series expansion.
 */
function buildArcTable(halfWidth: number, depth: number): ArcTable {
  const angles = new Float64Array(ARC_SAMPLES + 1);
  const lengths = new Float64Array(ARC_SAMPLES + 1);

  let total = 0;
  let previousX = 0;
  let previousY = 0;

  for (let i = 0; i <= ARC_SAMPLES; i += 1) {
    const t = (Math.PI / 2) * (i / ARC_SAMPLES);
    const x = halfWidth * Math.sin(t);
    const y = depth * (1 - Math.cos(t));
    if (i > 0) {
      total += Math.hypot(x - previousX, y - previousY);
    }
    angles[i] = t;
    lengths[i] = total;
    previousX = x;
    previousY = y;
  }

  return { angles, lengths, total };
}

/** Invert the table: the angle at which the curve has run `target` millimetres. */
function angleAtLength(table: ArcTable, target: number): number {
  const { lengths, angles } = table;
  if (target <= 0) return angles[0];
  if (target >= table.total) return angles[angles.length - 1];

  let low = 0;
  let high = lengths.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (lengths[mid] <= target) low = mid;
    else high = mid;
  }
  const span = lengths[high] - lengths[low];
  const fraction = span === 0 ? 0 : (target - lengths[low]) / span;
  return angles[low] + fraction * (angles[high] - angles[low]);
}

/* -------------------------------------------------------------------------
 * Crown silhouettes
 *
 * Normalised to a unit box: `u` runs -0.5 → 0.5 along the arch, `v` runs
 * -0.5 (lingual) → 0.5 (buccal). Scaled per tooth by the crown table above.
 *
 * The four outlines exist to be told apart at a glance, because that is the
 * whole job — a dentist confirming "36" needs to see a molar, not a generic
 * blob with a 36 written on it. A blade-thin incisor, a pointed canine, a
 * small round premolar and a big square molar are distinguishable at the size
 * this renders on a phone.
 * ---------------------------------------------------------------------- */

type Outline = readonly (readonly [number, number])[];
/** Occlusal detail: polylines in the same local frame as the outline. */
type Fissures = readonly (readonly (readonly [number, number])[])[];

/**
 * A blade. Wide across the arch, thin through it, with a flat incisal edge and
 * a cervix that tapers — which is what makes an incisor unmistakable next to a
 * premolar of similar width.
 */
const INCISOR: Outline = [
  [-0.5, -0.5], [0.5, -0.5],
  [0.46, -0.1], [0.42, 0.32], [0.3, 0.5],
  [-0.3, 0.5], [-0.42, 0.32], [-0.46, -0.1],
];

/** One pronounced cusp. The point is the whole identity of this tooth. */
const CANINE: Outline = [
  [-0.4, -0.46], [0.4, -0.46],
  [0.5, -0.05], [0.22, 0.3],
  [0.0, 0.5],
  [-0.22, 0.3], [-0.5, -0.05],
];

/** Two cusps, buccal and lingual, on a rounded body. */
const PREMOLAR: Outline = [
  [-0.34, -0.5], [0.34, -0.5],
  [0.5, -0.22], [0.5, 0.18], [0.32, 0.46],
  [-0.32, 0.46], [-0.5, 0.18], [-0.5, -0.22],
];

/** The big square one, four cusps, slightly tapered distally. */
const MOLAR: Outline = [
  [-0.44, -0.5], [0.44, -0.5],
  [0.5, -0.26], [0.5, 0.26], [0.42, 0.5],
  [-0.42, 0.5], [-0.5, 0.26], [-0.5, -0.26],
];

/**
 * Occlusal anatomy.
 *
 * This is what actually makes the chart readable, more than the outlines do. A
 * molar with a cross-shaped fissure pattern reads as a molar at a glance even
 * when it is 20 pixels wide; the same shape without it is a rounded square that
 * could be anything. Drawn only when a crown is large enough on screen to carry
 * it — see `projectTooth`.
 */
const FISSURES: Record<ToothClass, Fissures> = {
  // The incisal edge, which is the one landmark an incisor has.
  incisor: [[[-0.3, 0.36], [0.3, 0.36]]],
  // The cusp ridge running down from the tip.
  canine: [[[0, 0.42], [0, -0.1]]],
  // A single mesiodistal groove between the two cusps.
  premolar: [[[-0.32, 0], [0.32, 0]]],
  // The central groove plus its buccal and lingual branches: the cross that
  // says "molar" instantly.
  molar: [
    [[-0.34, 0], [0.34, 0]],
    [[-0.12, 0], [-0.12, 0.3]],
    [[0.14, 0], [0.14, -0.3]],
  ],
};

const OUTLINES: Record<ToothClass, Outline> = {
  incisor: INCISOR,
  canine: CANINE,
  premolar: PREMOLAR,
  molar: MOLAR,
};

/* -------------------------------------------------------------------------
 * Placement
 * ---------------------------------------------------------------------- */

export interface ToothPlacement {
  fdi: number;
  toothClass: ToothClass;
  /** Centre of the occlusal face, in model space. */
  center: Vec3;
  /** Unit vector along the arch, pointing distally (away from the midline). */
  along: Point2;
  /** Unit vector across the arch, pointing buccally (toward the cheek). */
  buccal: Point2;
  size: CrownSize;
  /** The occlusal face, model space, wound consistently. */
  face: Vec3[];
  /** The same ring pushed away from the viewer by the crown height. */
  back: Vec3[];
  /** Occlusal grooves, in model space. */
  fissures: Vec3[][];
}

/**
 * Vertical gap between the two arches.
 *
 * An artefact of the exploded layout rather than anatomy — in a real mouth the
 * arches meet — so it is set by what reads well. Kept tight because the chart
 * is already taller than it is wide (a dental arch genuinely is deeper than it
 * is half-wide) and every millimetre here is height competing with the rest of
 * a review sheet on a phone.
 */
const ARCH_GAP = 10;

/**
 * How much of the anatomical crown height to spend on visible thickness.
 *
 * A real crown is 7–11mm tall against a 5–11mm width, and extruding that at
 * full scale makes each tooth read as a tower rather than a tooth once the
 * chart is turned. The depth here is a cue that the crown is solid, not a
 * measurement, so it is deliberately understated.
 */
const CROWN_DEPTH_SCALE = 0.45;

function placeQuadrant(fdi0: number, count: number): ToothPlacement[] {
  const teeth = Array.from({ length: count }, (_, i) => fdi0 + i + 1);
  const upper = archOf(teeth[0]) === "upper";
  const shape = ARCH_SHAPE[upper ? "upper" : "lower"];

  const sizes = teeth.map((fdi) => crownSize(fdi));
  const totalWidth = sizes.reduce((sum, size) => sum + size.mesiodistal, 0);

  // Solve the arch's scale so its arc length is exactly the teeth that sit on
  // it: build the table at the nominal shape, then scale uniformly.
  const nominal = buildArcTable(shape.halfWidth, shape.depth);
  const scale = totalWidth / nominal.total;
  const halfWidth = shape.halfWidth * scale;
  const depth = shape.depth * scale;
  const table = buildArcTable(halfWidth, depth);

  // Patient's right is screen-left. Everything else follows from this line.
  const sign = sideOf(teeth[0]) === "right" ? -1 : 1;
  // y grows downwards, so the upper arch is the negative one.
  const archSign = upper ? -1 : 1;

  const placements: ToothPlacement[] = [];
  let travelled = 0;

  for (let i = 0; i < teeth.length; i += 1) {
    const fdi = teeth[i];
    const size = sizes[i];
    const t = angleAtLength(table, travelled + size.mesiodistal / 2);
    travelled += size.mesiodistal;

    // Incisors sit nearest the midline; molars sweep out and away from it.
    const x = sign * halfWidth * Math.sin(t);
    const y = archSign * (ARCH_GAP / 2 + depth * (1 - Math.cos(t)));

    const tangent = normalise({
      x: sign * halfWidth * Math.cos(t),
      y: archSign * depth * Math.sin(t),
    });
    // The true outward normal of the ellipse, not the tangent turned a quarter
    // circle. For a non-circular arch those differ, and only the gradient stays
    // perpendicular to the curve at every point — which is what keeps a crown
    // square to the arch instead of sheared at the canines, where the curvature
    // changes fastest. Carrying both signs means the frame mirrors along with
    // the geometry rather than being flipped afterwards.
    const buccal = normalise({
      x: sign * depth * Math.sin(t),
      y: -archSign * halfWidth * Math.cos(t),
    });

    // The crown outline is written in the tooth's own frame — `u` along the
    // arch, `v` across it — and mapped onto the model by that frame's two axes.
    const outline = OUTLINES[toothClass(fdi)];
    const center: Vec3 = { x, y, z: 0 };
    const face = outline.map(([u, v]) => {
      const alongArch = u * size.mesiodistal;
      const acrossArch = v * size.buccolingual;
      return {
        x: x + tangent.x * alongArch + buccal.x * acrossArch,
        y: y + tangent.y * alongArch + buccal.y * acrossArch,
        z: 0,
      };
    });
    const back = face.map((point) => ({ ...point, z: -size.height * CROWN_DEPTH_SCALE }));

    // Occlusal grooves, mapped through the same frame as the outline so they
    // turn with the crown instead of sliding across it.
    const fissures = FISSURES[toothClass(fdi)].map((line) =>
      line.map(([u, v]) => {
        const alongArch = u * size.mesiodistal;
        const acrossArch = v * size.buccolingual;
        return {
          x: x + tangent.x * alongArch + buccal.x * acrossArch,
          y: y + tangent.y * alongArch + buccal.y * acrossArch,
          z: 0,
        };
      }),
    );

    placements.push({
      fdi,
      toothClass: toothClass(fdi),
      center,
      along: tangent,
      buccal,
      size,
      face,
      back,
      fissures,
    });
  }

  return placements;
}

function normalise(vector: Point2): Point2 {
  const length = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / length, y: vector.y / length };
}

/**
 * Every tooth of a dentition, placed.
 *
 * Computed rather than tabulated so that changing a crown width or the arch
 * shape moves everything consistently, and so the same code lays out an adult
 * and a child without a second table of coordinates to keep in step.
 */
export function buildArch(dentition: Dentition): ToothPlacement[] {
  const count = dentition === "permanent" ? 8 : 5;
  const quadrants = dentition === "permanent" ? [10, 20, 30, 40] : [50, 60, 70, 80];
  return quadrants.flatMap((base) => placeQuadrant(base, count));
}

/* -------------------------------------------------------------------------
 * Projection
 * ---------------------------------------------------------------------- */

export interface Camera {
  /** Rotation about the vertical axis, radians. Zero is face-on. */
  yaw: number;
  /** Rotation about the horizontal axis, radians. Zero is face-on. */
  pitch: number;
  /**
   * Distance from the model, in model units. Larger is flatter; this is a weak
   * perspective, chosen so that a tooth on the far side is not rendered so much
   * smaller than its mirror image that the two stop being comparable. On a
   * chart whose purpose is to distinguish 36 from 46, symmetry is worth more
   * than depth drama.
   */
  distance: number;
}

export const DEFAULT_CAMERA: Camera = {
  yaw: 0,
  pitch: 0,
  distance: 420,
};

export interface Projected extends Point2 {
  /** View-space depth. Larger is nearer the viewer; sort ascending to paint. */
  depth: number;
}

export function project(point: Vec3, camera: Camera): Projected {
  const cosYaw = Math.cos(camera.yaw);
  const sinYaw = Math.sin(camera.yaw);
  const x1 = point.x * cosYaw + point.z * sinYaw;
  const z1 = -point.x * sinYaw + point.z * cosYaw;

  const cosPitch = Math.cos(camera.pitch);
  const sinPitch = Math.sin(camera.pitch);
  const y2 = point.y * cosPitch - z1 * sinPitch;
  const z2 = point.y * sinPitch + z1 * cosPitch;

  // Weak perspective. Guarded so a camera pushed inside the model cannot divide
  // by zero or flip the sign of the whole scene.
  const denominator = Math.max(camera.distance - z2, camera.distance * 0.25);
  const scale = camera.distance / denominator;

  return { x: x1 * scale, y: y2 * scale, depth: z2 };
}

/** Mean depth of a ring, for painter's-algorithm ordering. */
export function meanDepth(points: readonly Projected[]): number {
  if (points.length === 0) return 0;
  let total = 0;
  for (const point of points) total += point.depth;
  return total / points.length;
}

/**
 * Round a coordinate on its way into the DOM.
 *
 * Not cosmetic, and not an optimisation. This geometry is computed on the
 * server for the first paint and again in the browser on hydration, and the two
 * run different builds of V8 whose `Math.sin`/`Math.cos` may disagree in the
 * last bit. That is enough: React compares rendered attributes as strings, so
 * `-44.097450799491334` from Node against `-44.097450799491355` from Chrome is
 * a hydration mismatch — and React explicitly does not patch attributes up, so
 * the server's values simply stay.
 *
 * Two decimal places is far below a pixel at every scale this renders at, and
 * it makes both engines agree byte for byte. Every number that becomes an
 * attribute goes through here.
 */
export function svgNumber(value: number): number {
  return Math.round(value * 100) / 100;
}

/** An SVG path `d` for a closed ring. */
export function ringPath(ring: readonly Point2[]): string {
  if (ring.length === 0) return "";
  const [first, ...rest] = ring;
  const parts = [`M${first.x.toFixed(2)} ${first.y.toFixed(2)}`];
  for (const point of rest) parts.push(`L${point.x.toFixed(2)} ${point.y.toFixed(2)}`);
  parts.push("Z");
  return parts.join("");
}

export interface ToothGeometry {
  fdi: number;
  toothClass: ToothClass;
  /** The occlusal face, projected. Painted last, on top of the body. */
  face: Projected[];
  /**
   * The crown's whole silhouette — the outline of the solid, painted first.
   * A single ring rather than a set of side walls; see `projectTooth`.
   */
  body: Point2[];
  /**
   * Occlusal grooves, projected. Empty when the crown is too small on screen to
   * carry them — below a few pixels they stop being anatomy and become noise
   * that makes every tooth look smudged.
   */
  fissures: Point2[][];
  /** Where a label should sit. */
  labelAt: Point2;
  /**
   * Type size for that label, in the same units as the geometry.
   *
   * Derived from the crown rather than fixed, because a lower central incisor
   * is 5.3mm across and a lower first molar is 11mm, and one size that fits the
   * molar overruns the four incisors either side of the midline — which is
   * exactly where a chart is read most closely. It follows the projection too,
   * so a crown turned edge-on does not keep a label wider than itself.
   */
  labelSize: number;
  depth: number;
}

/**
 * Convex hull, Andrew's monotone chain.
 *
 * Exact and O(n log n) on the sixteen points a crown has, which is not a
 * performance question at this size — it is chosen because it cannot produce a
 * self-intersecting ring, and a self-intersecting ring is what a naive outline
 * of a rotated prism gives you.
 */
function convexHull(points: readonly Point2[]): Point2[] {
  if (points.length < 3) return [...points];

  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const cross = (o: Point2, a: Point2, b: Point2) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const build = (input: readonly Point2[]) => {
    const chain: Point2[] = [];
    for (const point of input) {
      while (chain.length >= 2 && cross(chain[chain.length - 2], chain[chain.length - 1], point) <= 0) {
        chain.pop();
      }
      chain.push(point);
    }
    chain.pop();
    return chain;
  };

  return [...build(sorted), ...build([...sorted].reverse())];
}

/**
 * Project one tooth into two paintable rings.
 *
 * The crown is drawn as its **silhouette** — the convex hull of the occlusal
 * ring and its pushed-back twin — with the occlusal face laid on top. The
 * obvious alternative, one quad per side wall with back-facing quads culled,
 * was what this did first and it is worse in every way that matters here: the
 * culled set is not contiguous, so a rotated crown grows thin fins where a wall
 * survives between two that did not, and it costs five or six elements per
 * tooth instead of two. At thirty-two teeth that is the difference between
 * about sixty paths and nearly two hundred, every frame of a drag.
 *
 * A crown outline is convex, so its hull is exactly its silhouette and nothing
 * is lost by taking it.
 */
export function projectTooth(placement: ToothPlacement, camera: Camera): ToothGeometry {
  const face = placement.face.map((point) => project(point, camera));
  const back = placement.back.map((point) => project(point, camera));

  let labelX = 0;
  let labelY = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of face) {
    labelX += point.x;
    labelY += point.y;
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }

  const shortest = Math.min(maxX - minX, maxY - minY);

  // Detail is dropped rather than drawn tiny. The threshold is in the same
  // units as the geometry, so it follows the projection: a crown turned
  // edge-on loses its grooves before it loses its outline.
  const fissures =
    shortest < 3.4 ? [] : placement.fissures.map((line) => line.map((point) => project(point, camera)));

  return {
    fdi: placement.fdi,
    toothClass: placement.toothClass,
    face,
    fissures,
    body: convexHull([...face, ...back]),
    // Rounded here rather than at the point of use: these two become DOM
    // attributes directly, and `svgNumber` explains why that has to be stable
    // across the server and the browser.
    labelAt: { x: svgNumber(labelX / face.length), y: svgNumber(labelY / face.length) },
    // Floored so a heavily turned crown keeps a legible number rather than
    // shrinking one of the thirty-two labels out of existence.
    labelSize: svgNumber(Math.max(2.1, Math.min(3.4, shortest * 0.46))),
    depth: meanDepth(face),
  };
}

/** Bounding box of a projected set, for fitting a viewBox around it. */
export function boundsOf(teeth: readonly ToothGeometry[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const tooth of teeth) {
    for (const ring of [tooth.face, tooth.body]) {
      for (const point of ring) {
        if (point.x < minX) minX = point.x;
        if (point.y < minY) minY = point.y;
        if (point.x > maxX) maxX = point.x;
        if (point.y > maxY) maxY = point.y;
      }
    }
  }

  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return { minX, minY, maxX, maxY };
}
