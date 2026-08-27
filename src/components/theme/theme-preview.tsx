"use client";

import * as React from "react";

import { CheckIcon, TriangleAlertIcon } from "@/components/icons";
import {
  contrastRatio,
  flatten,
  formatRatio,
  measurePair,
  measureSurface,
  parseColor,
  scanThemeTokens,
  surfacePairs,
  tokenPairs,
  type ContrastGrade,
  type SurfaceMeasurement,
  type TokenScan,
} from "@/components/theme/theme-tokens";
import { cn } from "@/lib/utils";

const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];

const THEME_LABEL: Record<Theme, string> = { light: "Light", dark: "Dark" };

/**
 * Paint a subtree in a theme the document is not currently in.
 *
 * The palettes live on `:root` and `.dark`, so a subtree inside a dark document
 * has no way back to the light values — there is no "light" class to apply.
 * Writing the scanned declarations onto the panel as inline custom properties
 * is the way to have both on screen at once, and because they are scanned from
 * the stylesheet rather than restated in this file, the panel cannot drift from
 * what `globals.css` actually says.
 */
function paletteStyle(palette: Record<string, string>, theme: Theme): React.CSSProperties {
  const style: Record<string, string> = { colorScheme: theme };
  for (const [name, value] of Object.entries(palette)) style[name] = value;
  return style as React.CSSProperties;
}

function GradeBadge({ grade, ratio }: { grade: ContrastGrade | null; ratio: number | null }) {
  if (grade === null || ratio === null) {
    return <span className="text-muted-foreground text-xs">not a colour</span>;
  }

  const failing = grade === "fail" || grade === "AA-large";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold",
        failing ? "bg-destructive-soft text-destructive" : "bg-money-soft text-money",
      )}
    >
      {failing ? (
        <TriangleAlertIcon className="size-3" aria-hidden />
      ) : (
        <CheckIcon className="size-3" aria-hidden />
      )}
      <span className="tnum">{formatRatio(ratio)}</span>
      <span>{grade}</span>
    </span>
  );
}

/**
 * The fill-against-surface column.
 *
 * Deliberately not styled like `GradeBadge`: a faint fill is often correct — a
 * `--card` that barely lifts off the page is a design choice — so this reports
 * rather than judges, and only `invisible` is coloured like a failure, because
 * that one is not a matter of taste.
 */
function SurfaceBadge({ measurement }: { measurement: SurfaceMeasurement }) {
  const { verdict, ratio, deltaE } = measurement;
  if (verdict === null || ratio === null || deltaE === null) {
    return <span className="text-muted-foreground text-xs">not a colour</span>;
  }

  return (
    <span className="flex flex-col gap-0.5">
      <span
        className={cn(
          "inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold",
          verdict === "invisible"
            ? "bg-destructive-soft text-destructive"
            : verdict === "distinct"
              ? "bg-money-soft text-money"
              : "bg-warning-soft text-warning",
        )}
      >
        {verdict === "distinct" ? (
          <CheckIcon className="size-3" aria-hidden />
        ) : (
          <TriangleAlertIcon className="size-3" aria-hidden />
        )}
        <span>{verdict}</span>
      </span>
      <span className="text-muted-foreground tnum text-xs">
        {formatRatio(ratio)} &middot; &Delta;E {deltaE.toFixed(1)}
      </span>
    </span>
  );
}

/** A token that is not a colour still has to be checkable, so it is rendered. */
function TokenSample({ name, value }: { name: string; value: string }) {
  const colour = parseColor(value);
  if (colour) {
    return (
      <span
        className="border-field-border block size-9 shrink-0 rounded-md border"
        style={{ background: value }}
        aria-hidden
      />
    );
  }

  if (name.startsWith("--elev")) {
    return (
      <span
        className="bg-card border-border block size-9 shrink-0 rounded-md border"
        style={{ boxShadow: value }}
        aria-hidden
      />
    );
  }

  if (name.startsWith("--focus-ring")) {
    return (
      <span
        className="bg-card block size-9 shrink-0 rounded-md"
        style={{
          outline: `${name.endsWith("width") ? value : "2px"} solid var(--ring)`,
          outlineOffset: name.endsWith("offset") ? value : "2px",
        }}
        aria-hidden
      />
    );
  }

  return (
    <span
      className="bg-secondary border-border block size-9 shrink-0 border"
      style={{ borderRadius: name === "--radius" ? value : undefined }}
      aria-hidden
    />
  );
}

/**
 * Tokens that are meant to be a fill rather than ink.
 *
 * The per-row number is a token's contrast against the page, and for ink that
 * number answers "can this be seen at all". For a surface it answers nothing:
 * `--background` is the page, so it is 1.00:1 against itself by definition, and
 * `--scrim` in dark mode is black on black because a scrim's whole job is to
 * darken whatever is under a sheet — neither is a defect, and flagging them
 * would train a reader to ignore the column that catches the real ones.
 *
 * The `-soft` chips are here because the interface only ever prints text on
 * them; the row for the accent that lands on each one is in the table below.
 */
const SURFACE_TOKENS = new Set([
  "--background",
  "--card",
  "--popover",
  "--muted",
  "--secondary",
  "--input",
  "--scrim",
  "--grid",
]);

/**
 * True for a token whose contrast against the page says nothing about it.
 *
 * Surfaces are one half of that; the `-foreground` labels are the other. In the
 * light theme all three of `--primary-foreground`, `--accent-foreground` and
 * `--destructive-foreground` are `#ffffff` on a `#ffffff` page and measured
 * 1.00:1 — but none of them is ever painted there. They are painted on the fill
 * they are named for, which the table below measures as a pair.
 */
function measuredElsewhere(name: string): boolean {
  return SURFACE_TOKENS.has(name) || name.endsWith("-soft") || name.endsWith("-foreground");
}

function TokenRow({
  name,
  value,
  page,
}: {
  name: string;
  value: string;
  /** The panel's own background, so a swatch can say whether it vanishes on it. */
  page: string | undefined;
}) {
  const colour = parseColor(value);
  const surface = page ? parseColor(page) : null;
  const ratio =
    colour && surface ? contrastRatio(colour.a < 1 ? flatten(colour, surface) : colour, surface) : null;
  const vanished = ratio !== null && ratio < 1.06 && !measuredElsewhere(name);

  return (
    <li className="flex items-center gap-3 py-2">
      <TokenSample name={name} value={value} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold">{name}</span>
        <span className="text-muted-foreground tnum block truncate text-xs">{value}</span>
      </span>
      {ratio === null ? null : (
        <span
          className={cn(
            "tnum shrink-0 text-xs",
            vanished ? "text-destructive font-semibold" : "text-muted-foreground",
          )}
        >
          {/* Against the page it sits on, which is the one number that says
              whether the swatch is visible at all. */}
          {formatRatio(ratio)}
          {vanished ? " — invisible here" : ""}
        </span>
      )}
    </li>
  );
}

function ThemePanel({
  theme,
  scan,
  className,
}: {
  theme: Theme;
  scan: TokenScan;
  className?: string;
}) {
  const palette = theme === "dark" ? { ...scan.light, ...scan.dark } : scan.light;
  const headingId = `theme-preview-${theme}`;

  return (
    <section
      aria-labelledby={headingId}
      className={cn("surface-card text-foreground bg-background overflow-hidden", className)}
      style={paletteStyle(palette, theme)}
    >
      <header className="border-border bg-card flex items-center justify-between border-b px-4 py-3">
        <h4 id={headingId} className="text-sm font-semibold">
          {THEME_LABEL[theme]}
        </h4>
        <p className="text-muted-foreground text-xs">
          {scan.flipping.length} themed · {scan.shared.length} shared
        </p>
      </header>

      {/* Rendered before the swatch list on purpose: a doctor checking this by
          hand is looking for a control that disappeared, not for a hex value. */}
      <div className="border-border space-y-3 border-b px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="bg-primary text-primary-foreground pressable rounded-lg px-3 py-2 text-xs font-semibold">
            Commit visit
          </span>
          <span className="bg-secondary text-secondary-foreground rounded-lg px-3 py-2 text-xs font-semibold">
            Secondary
          </span>
          <span className="bg-primary-soft text-primary rounded-md px-2 py-1 text-xs font-semibold">
            Draft
          </span>
          <span className="bg-destructive-soft text-destructive rounded-md px-2 py-1 text-xs font-semibold">
            Failed
          </span>
          <span className="bg-money-soft text-money tnum rounded-md px-2 py-1 text-xs font-semibold">
            ₹1,250
          </span>
        </div>
        <div className="surface-inset flex items-center justify-between px-3 py-2">
          <span className="text-muted-foreground text-xs">Patient name</span>
          <span className="text-foreground text-xs">Sunita Devi</span>
        </div>
        <div
          className="bg-card border-border rounded-lg border px-3 py-2 text-xs"
          style={{ outline: "var(--focus-ring-width, 2px) solid var(--ring)", outlineOffset: "var(--focus-ring-offset, 2px)" }}
        >
          Focus ring, as a keyboard sees it
        </div>
      </div>

      <ul className="divide-border divide-y px-4 py-1">
        {scan.flipping.map((name) => (
          <TokenRow key={name} name={name} value={palette[name] ?? ""} page={palette["--background"]} />
        ))}
      </ul>

      {scan.shared.length === 0 ? null : (
        <>
          <h5 className="text-muted-foreground border-border border-t px-4 pt-3 text-xs font-semibold uppercase">
            Same in both themes
          </h5>
          <ul className="divide-border divide-y px-4 pb-2">
            {scan.shared.map((name) => (
              <TokenRow key={name} name={name} value={palette[name] ?? ""} page={undefined} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/**
 * Every token, in both themes, on one screen.
 *
 * Built so dark mode stays checkable after this change ships: the swatches are
 * read out of the stylesheet at runtime, so a token added to `globals.css`
 * tomorrow appears here without anyone editing this file, and the contrast
 * column is computed rather than copied from a spreadsheet that will go stale.
 *
 * Mount it wherever it is useful — the settings workspace, or a scratch route.
 */
export function ThemePreview({ className }: { className?: string }) {
  // The CSSOM is only reachable in the browser, and only after the stylesheet
  // has been parsed, so this cannot be computed during render.
  const [scan, setScan] = React.useState<TokenScan | null>(null);
  React.useEffect(() => {
    // Deferred to a microtask rather than set inline: a synchronous setState in
    // an effect body makes React render twice before paint, and this scan walks
    // every rule in every stylesheet.
    let live = true;
    void Promise.resolve().then(() => {
      if (live) setScan(scanThemeTokens(document.styleSheets));
    });
    return () => {
      live = false;
    };
  }, []);

  if (!scan) {
    return (
      <p className={cn("text-muted-foreground text-sm", className)}>Reading the palette…</p>
    );
  }

  if (scan.blocked || scan.flipping.length === 0) {
    return (
      <p className={cn("text-destructive text-sm", className)}>
        The palette could not be read from the page&rsquo;s stylesheets, so this preview would be
        guessing. Reload the page; if it persists, the tokens are no longer declared on
        <code className="tnum px-1">:root</code> and <code className="tnum px-1">.dark</code>.
      </p>
    );
  }

  const pairs = tokenPairs(scan);
  const surfaces = surfacePairs(scan);
  const darkPalette = { ...scan.light, ...scan.dark };
  const lightPage = parseColor(scan.light["--background"] ?? "");
  const darkPage = parseColor(darkPalette["--background"] ?? "");

  return (
    <div className={cn("space-y-6", className)}>
      <div className="grid gap-4 lg:grid-cols-2">
        {THEMES.map((theme) => (
          <ThemePanel key={theme} theme={theme} scan={scan} />
        ))}
      </div>

      {/* Focusable and named. Chrome already makes an overflowing box a tab stop
          so a keyboard user can scroll it, but it arrives unnamed; a screen
          reader landing on "group" with no label cannot say what was reached. */}
      <div
        className="surface-card overflow-x-auto"
        role="region"
        aria-label="Contrast of the pairs the interface paints, scrollable"
        tabIndex={0}
      >
        <table className="w-full text-left text-xs">
          <caption className="text-muted-foreground px-4 py-3 text-left text-xs">
            Measured contrast for the pairs the interface actually paints. Text pairs are held to
            4.5:1 (WCAG 1.4.3); boundaries that identify a control are held to 3:1 (1.4.11).
          </caption>
          <thead className="text-muted-foreground border-border border-b">
            <tr>
              <th scope="col" className="px-4 py-2 font-semibold">
                Pair
              </th>
              <th scope="col" className="px-4 py-2 font-semibold">
                Needs
              </th>
              <th scope="col" className="px-4 py-2 font-semibold">
                Light
              </th>
              <th scope="col" className="px-4 py-2 font-semibold">
                Dark
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {pairs.map((pair) => {
              const light = measurePair(pair, scan.light, "light", lightPage);
              const dark = measurePair(pair, darkPalette, "dark", darkPage);
              return (
                <tr key={`${pair.label}-${pair.foreground}-${pair.background}`}>
                  <th scope="row" className="px-4 py-2 font-normal">
                    <span className="block font-semibold">{pair.label}</span>
                    <span className="text-muted-foreground block">
                      {pair.foreground} on {pair.background}
                    </span>
                  </th>
                  <td className="tnum px-4 py-2">{pair.minimum}:1</td>
                  <td className="px-4 py-2">
                    <GradeBadge grade={light.grade} ratio={light.ratio} />
                  </td>
                  <td className="px-4 py-2">
                    <GradeBadge grade={dark.grade} ratio={dark.ratio} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        className="surface-card overflow-x-auto"
        role="region"
        aria-label="Separation of each fill from the surface under it, scrollable"
        tabIndex={0}
      >
        <table className="w-full text-left text-xs">
          <caption className="text-muted-foreground px-4 py-3 text-left text-xs">
            Measured separation between a fill and the surface it is painted on. A chip whose fill
            matches its card is still legible and is no longer a chip, which the table above cannot
            see. A contrast ratio is a luminance ratio, so it is paired with CIEDE2000: a
            <span className="text-warning font-semibold"> tint-only</span> fill is visible in
            colour and gone in greyscale, while <span className="text-destructive font-semibold">
            invisible</span> is neither. 3:1 is what WCAG 1.4.11 asks of a shape carrying a state on
            its own; decoration does not owe that.
          </caption>
          <thead className="text-muted-foreground border-border border-b">
            <tr>
              <th scope="col" className="px-4 py-2 font-semibold">
                Fill on surface
              </th>
              <th scope="col" className="px-4 py-2 font-semibold">
                Light
              </th>
              <th scope="col" className="px-4 py-2 font-semibold">
                Dark
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {surfaces.map((pair) => {
              const light = measureSurface(pair, scan.light, "light", lightPage);
              const dark = measureSurface(pair, darkPalette, "dark", darkPage);
              return (
                <tr key={`${pair.label}-${pair.fill}-${pair.surface}`}>
                  <th scope="row" className="px-4 py-2 font-normal">
                    <span className="block font-semibold">{pair.label}</span>
                    <span className="text-muted-foreground block">
                      {pair.fill} on {pair.surface}
                    </span>
                  </th>
                  <td className="px-4 py-2">
                    <SurfaceBadge measurement={light} />
                  </td>
                  <td className="px-4 py-2">
                    <SurfaceBadge measurement={dark} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
