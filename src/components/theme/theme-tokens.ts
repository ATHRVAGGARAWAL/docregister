/**
 * The palette, read back from the stylesheet rather than restated here.
 *
 * A second copy of the token values in TypeScript would be wrong the first time
 * anyone edited `globals.css`, and a preview that lies about the palette is
 * worse than no preview. So the scan below reads the `:root` and `.dark` rule
 * blocks out of the CSSOM: whatever is in the stylesheet is what gets rendered,
 * measured and labelled, including tokens added after this file was written.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

const HEX = /^#([0-9a-f]{3,8})$/i;
const FUNCTIONAL = /^rgba?\(([^)]+)\)$/i;

/**
 * Hex and `rgb()` only, and `null` for anything else.
 *
 * Every colour token in this app is authored in one of those two forms. A token
 * written in a form this does not understand is reported as unmeasurable rather
 * than guessed at — a swatch that silently renders black because a parser gave
 * up is the failure mode this exists to prevent.
 */
export function parseColor(value: string): Rgb | null {
  const raw = value.trim();
  if (!raw) return null;

  const hex = HEX.exec(raw);
  if (hex) {
    const digits = hex[1];
    const expand = (part: string) => parseInt(part.length === 1 ? part + part : part, 16);
    if (digits.length === 3 || digits.length === 4) {
      return {
        r: expand(digits[0]),
        g: expand(digits[1]),
        b: expand(digits[2]),
        a: digits.length === 4 ? expand(digits[3]) / 255 : 1,
      };
    }
    if (digits.length === 6 || digits.length === 8) {
      return {
        r: expand(digits.slice(0, 2)),
        g: expand(digits.slice(2, 4)),
        b: expand(digits.slice(4, 6)),
        a: digits.length === 8 ? expand(digits.slice(6, 8)) / 255 : 1,
      };
    }
    return null;
  }

  const functional = FUNCTIONAL.exec(raw);
  if (!functional) return null;

  // Both the legacy `rgb(0, 0, 0)` and the modern `rgb(0 0 0 / 0.56)` forms are
  // in the stylesheet today.
  const parts = functional[1]
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number);
  if (parts.length < 3 || parts.slice(0, 3).some((part) => !Number.isFinite(part))) return null;

  const alpha = parts.length > 3 && Number.isFinite(parts[3]) ? parts[3] : 1;
  return { r: parts[0], g: parts[1], b: parts[2], a: alpha > 1 ? alpha / 100 : alpha };
}

/** Source-over compositing, so a translucent token is measured where it lands. */
export function flatten(top: Rgb, bottom: Rgb): Rgb {
  const a = top.a + bottom.a * (1 - top.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / a,
    g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / a,
    b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / a,
    a,
  };
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const srgb = value / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.2 SC 1.4.3 / 1.4.11 contrast, on colours already flattened to opaque. */
export function contrastRatio(foreground: Rgb, background: Rgb): number {
  const front = foreground.a < 1 ? flatten(foreground, background) : foreground;
  const lighter = Math.max(relativeLuminance(front), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(front), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

export function formatRatio(ratio: number): string {
  return `${ratio.toFixed(2)}:1`;
}

export type ContrastGrade = "AAA" | "AA" | "AA-large" | "fail";

/**
 * Text at 24px, or 18.66px bold, is "large" and drops to 3:1. Nothing in this
 * app's token pairs is large text, so `minimum` is passed in per pair instead of
 * being inferred — a 3:1 pair is a non-text boundary (1.4.11), not big type.
 */
export function grade(ratio: number, minimum: number): ContrastGrade {
  if (minimum <= 3) return ratio >= 3 ? "AA" : "fail";
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA-large";
  return "fail";
}

/**
 * Tailwind owns these namespaces, and `@import "tailwindcss"` declares hundreds
 * of them on `:root`. They are not this app's palette, so they are not this
 * app's preview. `--radius` survives because the filter needs the trailing
 * hyphen: `--radius-lg` is Tailwind's alias, `--radius` is the token it reads.
 *
 * `--lightningcss-*` is scaffolding the build step adds to both scopes to make
 * `light-dark()` resolve. It measured as a real pair here — declared on `:root`
 * and on `.dark`, with the values `initial` and the empty string — which is
 * exactly the shape of a palette token and none of the substance.
 */
const FRAMEWORK_NAMESPACE =
  /^--(?:color|font|text|font-weight|tracking|leading|breakpoint|container|spacing|radius|shadow|inset-shadow|drop-shadow|text-shadow|blur|perspective|aspect|ease|animate|default)-|^--lightningcss-/;

export interface TokenScan {
  /** Declared in both scopes: the tokens that actually flip. */
  flipping: string[];
  /** Declared once, so identical in both themes — geometry, not colour. */
  shared: string[];
  light: Record<string, string>;
  dark: Record<string, string>;
  /** True when no stylesheet could be read, so the caller can say so. */
  blocked: boolean;
}

function collect(rule: CSSStyleRule, into: Record<string, string>): void {
  for (const property of Array.from(rule.style)) {
    if (!property.startsWith("--")) continue;
    if (FRAMEWORK_NAMESPACE.test(property)) continue;
    const value = rule.style.getPropertyValue(property).trim();
    // `initial` and the empty string are how a custom property is *un*-declared.
    // Neither is a swatch, and neither belongs in the inline palette the preview
    // writes onto its panels.
    if (!value || value === "initial") continue;
    into[property] = value;
  }
}

/**
 * Read the two palettes out of the document's own stylesheets.
 *
 * Declared values, not computed ones: `getComputedStyle` can only report the
 * scope the document is currently in, and the whole point of the preview is to
 * show the other one at the same time. Rules nested in `@media` are skipped, so
 * the `prefers-contrast: more` override does not overwrite the base palette.
 */
export function scanThemeTokens(sheets: StyleSheetList): TokenScan {
  const light: Record<string, string> = {};
  const dark: Record<string, string> = {};
  let readable = 0;

  for (const sheet of Array.from(sheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      // A cross-origin stylesheet throws on access. None of this app's own CSS
      // is cross-origin, so this is a browser extension's sheet, not ours.
      continue;
    }
    readable += 1;

    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSStyleRule)) continue;
      const selectors = rule.selectorText.split(",").map((selector) => selector.trim());
      if (selectors.includes(":root")) collect(rule, light);
      if (selectors.includes(".dark")) collect(rule, dark);
    }
  }

  const flipping = Object.keys(dark)
    .filter((name) => name in light)
    .sort();
  const shared = Object.keys(light)
    .filter((name) => !(name in dark))
    .sort();

  return { flipping, shared, light, dark, blocked: readable === 0 };
}

export interface TokenPair {
  label: string;
  foreground: string;
  background: string;
  /** 4.5 for text (1.4.3), 3 for a boundary that identifies a control (1.4.11). */
  minimum: number;
}

/**
 * Pairs that are only correct as a pair.
 *
 * The `-foreground` half of the list is derived from the naming convention, so
 * a new `--x` / `--x-foreground` couple is measured the day it is added. The
 * rest are the combinations the interface actually paints — a token can pass
 * against the page and still fail on the chip it is printed on, which is how
 * every contrast defect in this app has presented so far.
 */
export function tokenPairs(scan: TokenScan): TokenPair[] {
  const has = (name: string) => name in scan.light || name in scan.dark;

  const derived = scan.flipping
    .filter((name) => name.endsWith("-foreground"))
    .map((name) => {
      const base = name.replace(/-foreground$/, "");
      return { label: `${base.slice(2)} label`, foreground: name, background: base, minimum: 4.5 };
    })
    .filter((pair) => has(pair.background));

  const painted: TokenPair[] = [
    { label: "body text on page", foreground: "--foreground", background: "--background", minimum: 4.5 },
    { label: "body text on card", foreground: "--foreground", background: "--card", minimum: 4.5 },
    { label: "muted text on page", foreground: "--muted-foreground", background: "--background", minimum: 4.5 },
    { label: "muted text on card", foreground: "--muted-foreground", background: "--card", minimum: 4.5 },
    { label: "muted text in a well", foreground: "--muted-foreground", background: "--secondary", minimum: 4.5 },
    { label: "muted text in a field", foreground: "--muted-foreground", background: "--input", minimum: 4.5 },
    { label: "accent text on page", foreground: "--primary", background: "--background", minimum: 4.5 },
    { label: "accent text on card", foreground: "--primary", background: "--card", minimum: 4.5 },
    { label: "accent text on its chip", foreground: "--primary", background: "--primary-soft", minimum: 4.5 },
    { label: "danger text on page", foreground: "--destructive", background: "--background", minimum: 4.5 },
    { label: "danger text on its chip", foreground: "--destructive", background: "--destructive-soft", minimum: 4.5 },
    { label: "warning text on its chip", foreground: "--warning", background: "--warning-soft", minimum: 4.5 },
    { label: "money on its chip", foreground: "--money", background: "--money-soft", minimum: 4.5 },
    { label: "axis labels on page", foreground: "--axis", background: "--background", minimum: 4.5 },
    { label: "field edge on the field", foreground: "--field-border", background: "--input", minimum: 3 },
    { label: "field edge on a card", foreground: "--field-border", background: "--card", minimum: 3 },
    { label: "focus ring on page", foreground: "--ring", background: "--background", minimum: 3 },
    { label: "focus ring on card", foreground: "--ring", background: "--card", minimum: 3 },
    { label: "focus ring on a well", foreground: "--ring", background: "--secondary", minimum: 3 },
    { label: "chart series 1 on page", foreground: "--chart-1", background: "--background", minimum: 3 },
    { label: "chart series 5 on page", foreground: "--chart-5", background: "--background", minimum: 3 },
    { label: "grid lines on page", foreground: "--grid", background: "--background", minimum: 3 },
  ];

  return [...painted, ...derived].filter((pair) => has(pair.foreground) && has(pair.background));
}

export interface PairMeasurement extends TokenPair {
  theme: "light" | "dark";
  ratio: number | null;
  grade: ContrastGrade | null;
}

export function measurePair(
  pair: TokenPair,
  palette: Record<string, string>,
  theme: "light" | "dark",
  page: Rgb | null,
): PairMeasurement {
  const foreground = parseColor(palette[pair.foreground] ?? "");
  const background = parseColor(palette[pair.background] ?? "");
  if (!foreground || !background) {
    return { ...pair, theme, ratio: null, grade: null };
  }

  // A translucent surface is measured where it is painted: on the page.
  const surface = background.a < 1 && page ? flatten(background, page) : background;
  const ratio = contrastRatio(foreground, surface);
  return { ...pair, theme, ratio, grade: grade(ratio, pair.minimum) };
}
