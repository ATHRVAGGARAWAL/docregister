import { archOf, chartOrder, positionOf, sideOf, toothClass, type ToothClass } from "./tooth.ts";

export interface PermanentToothPlacement {
  fdi: number;
  position: [number, number, number];
  rotation: [number, number, number];
  crownScale: [number, number, number];
  toothClass: ToothClass;
}

/**
 * A deterministic, lightweight full-mouth layout used while the licensed
 * anatomical GLBs are being prepared. Patient right remains screen-left.
 */
export function permanentArchPlacements(): PermanentToothPlacement[] {
  return chartOrder("permanent").map((fdi) => {
    const position = positionOf(fdi);
    const side = sideOf(fdi);
    const arch = archOf(fdi);
    const sideSign = side === "right" ? -1 : 1;
    const archSign = arch === "upper" ? 1 : -1;
    const along = position - 0.5;
    const x = sideSign * (0.12 + along * 0.49);
    const curve = 0.58 + Math.pow(position / 8, 1.7) * 1.28;
    const y = archSign * curve;
    const tangent = sideSign * archSign * (0.08 + (position / 8) * 0.72);
    const kind = toothClass(fdi);
    const crownScale = crownScaleFor(kind, arch);
    return {
      fdi,
      position: [x, y, 0],
      rotation: [0, 0, tangent],
      crownScale,
      toothClass: kind,
    };
  });
}

function crownScaleFor(kind: ToothClass, arch: "upper" | "lower"): [number, number, number] {
  const vertical = arch === "upper" ? 1 : 0.94;
  switch (kind) {
    case "incisor": return [0.34, 0.49 * vertical, 0.31];
    case "canine": return [0.38, 0.56 * vertical, 0.38];
    case "premolar": return [0.43, 0.47 * vertical, 0.43];
    case "molar": return [0.52, 0.43 * vertical, 0.5];
  }
}

export function toothNodeName(fdi: number): string {
  return `tooth-${fdi}`;
}
