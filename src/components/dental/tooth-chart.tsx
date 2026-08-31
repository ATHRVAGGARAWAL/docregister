"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";

import { announce } from "@/components/a11y";
import { CheckIcon, TriangleAlertIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  boundsOf,
  buildArch,
  DEFAULT_CAMERA,
  projectTooth,
  ringPath,
  svgNumber,
  type Camera,
  type ToothGeometry,
} from "@/lib/dental/arch";
import { chartOrder, toothLabel, type Dentition } from "@/lib/dental/tooth";
import {
  statusLabel,
  summariseMouth,
  type ToothStatus,
} from "@/lib/dental/tooth-status";
import { cn } from "@/lib/utils";

/**
 * The tooth chart: what the app heard, drawn on a mouth.
 *
 * This exists to answer one question and it is not "which teeth are in the
 * record". It is **"is that the tooth I said?"** — because 36 and 46 are one
 * digit apart in a transcript and opposite sides of a patient's mouth in the
 * chair, and a dentist reading back the number alone has no way to catch the
 * swap. A shape in the right half of the right arch, the right size for a
 * molar, is caught instantly.
 *
 * Everything below follows from that. The teeth are class-shaped rather than
 * uniform blocks so a molar cannot be mistaken for a premolar. The rotation is
 * there so the crown reads as a solid rather than a label. And the selection is
 * always written out in words underneath, because the picture is the fast path
 * and the words are the one that is unambiguous.
 *
 * ## Not decorative
 *
 * Nothing here moves on its own. `src/lib/motion.ts` sets the rule — motion
 * that does not tell the doctor something is time taken from the patient in the
 * chair — and an idly spinning jaw tells them nothing. The camera moves when a
 * finger moves it and at no other time, which also means there is no animation
 * to suppress under `prefers-reduced-motion`.
 */

export type ToothState = "selected" | "flagged" | "treated";

export interface ToothChartProps {
  dentition?: Dentition;
  /** Teeth the dentist has confirmed. */
  selected?: readonly number[];
  /**
   * Teeth heard but not confidently resolved — a tooth reference the rule table
   * could not map, or one the model flagged. Drawn differently and named in the
   * summary, so it reads as a question rather than as a record.
   */
  flagged?: readonly number[];
  /** Teeth with history on this patient. Context, never a claim about today. */
  treated?: readonly number[];
  /**
   * The mouth's derived condition, from `deriveToothStatus`.
   *
   * A tooth absent from this map has **no history**, which is not the same as
   * examined-and-sound — so it renders as plain rather than as a positive
   * statement about the tooth. Where a tooth carries both a status and a
   * this-visit state, the visit wins: what the dentist is confirming right now
   * matters more than what the chart knew before they spoke.
   */
  status?: ReadonlyMap<number, ToothStatus>;
  /** Omit to render read-only. */
  onToggle?: (fdi: number) => void;
  /** Label for the group, since a chart with no heading is an unnamed control. */
  label?: string;
  className?: string;
}

const MAX_PITCH = 0.62;
const MAX_YAW = 0.85;
/** Radians per pixel dragged. Tuned so a thumb-width drag is a readable turn. */
const DRAG_SENSITIVITY = 0.006;

function clamp(value: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, value));
}

export function ToothChart({
  dentition = "permanent",
  selected = [],
  flagged = [],
  treated = [],
  status,
  onToggle,
  label = "Tooth chart",
  className,
}: ToothChartProps) {
  const [camera, setCamera] = useState<Camera>(DEFAULT_CAMERA);
  const drag = useRef<{ pointer: number; x: number; y: number; moved: boolean } | null>(null);
  const titleId = useId();

  const readOnly = onToggle === undefined;

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const flaggedSet = useMemo(() => new Set(flagged), [flagged]);
  const treatedSet = useMemo(() => new Set(treated), [treated]);

  const placements = useMemo(() => buildArch(dentition), [dentition]);

  /**
   * Painter's algorithm. Sorted far-to-near so a crown nearer the viewer is
   * drawn over the one behind it — SVG has no depth buffer, so document order
   * is the only thing deciding what covers what.
   */
  const teeth = useMemo(() => {
    const projected = placements.map((placement) => projectTooth(placement, camera));
    return projected.sort((a, b) => a.depth - b.depth);
  }, [placements, camera]);

  // Every number rounded before it becomes an attribute — see `svgNumber`. The
  // server and the browser compute this same viewBox from the same trig, and
  // without rounding they disagree in the last bit and React reports a
  // hydration mismatch it will not repair.
  const viewBox = useMemo(() => {
    const bounds = boundsOf(teeth);
    const padding = 6;
    const minX = svgNumber(bounds.minX - padding);
    const minY = svgNumber(bounds.minY - padding);
    const width = svgNumber(bounds.maxX - bounds.minX + padding * 2);
    const height = svgNumber(bounds.maxY - bounds.minY + padding * 2);
    return `${minX} ${minY} ${width} ${height}`;
  }, [teeth]);

  const beginDrag = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (!event.isPrimary) return;
    drag.current = {
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
  }, []);

  const continueDrag = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    const active = drag.current;
    if (!active || active.pointer !== event.pointerId) return;

    const dx = event.clientX - active.x;
    const dy = event.clientY - active.y;
    // A few pixels of travel is a tap with a shaky hand, not a drag. Without
    // this a tooth becomes very hard to select on a phone.
    if (!active.moved && Math.hypot(dx, dy) < 4) return;

    active.moved = true;
    active.x = event.clientX;
    active.y = event.clientY;

    setCamera((current) => ({
      ...current,
      yaw: clamp(current.yaw + dx * DRAG_SENSITIVITY, MAX_YAW),
      pitch: clamp(current.pitch - dy * DRAG_SENSITIVITY, MAX_PITCH),
    }));
  }, []);

  const endDrag = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (drag.current?.pointer === event.pointerId) drag.current = null;
  }, []);

  const handleToggle = useCallback(
    (fdi: number) => {
      if (!onToggle) return;
      // A drag that ends over a tooth is a rotation, not a choice.
      if (drag.current?.moved) return;
      onToggle(fdi);
      announce(
        selectedSet.has(fdi)
          ? `${toothLabel(fdi)}, ${fdi}, removed`
          : `${toothLabel(fdi)}, ${fdi}, selected`,
      );
    },
    [onToggle, selectedSet],
  );

  const rotated = camera.yaw !== 0 || camera.pitch !== 0;

  // Tab order follows the chart left to right rather than paint order, so
  // keyboard travel across the mouth matches what the eye does.
  const tabOrder = useMemo(() => {
    const order = chartOrder(dentition);
    return new Map(order.map((fdi, index) => [fdi, index]));
  }, [dentition]);

  const orderedTeeth = useMemo(
    () => [...teeth].sort((a, b) => (tabOrder.get(a.fdi) ?? 0) - (tabOrder.get(b.fdi) ?? 0)),
    [teeth, tabOrder],
  );

  return (
    <div className={cn("dental-chart flex flex-col gap-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p id={titleId} className="text-xs font-semibold text-foreground">
            {label}
          </p>
          <p className="mt-0.5 text-[0.68rem] text-muted-foreground">
            FDI notation · orientation follows the patient
          </p>
        </div>
        {rotated && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setCamera(DEFAULT_CAMERA)}
          >
            Reset view
          </Button>
        )}
      </div>

      <div className="dental-chart-stage">
        <div className="dental-chart-orientation" aria-hidden>
          <span>Patient&rsquo;s right</span>
          <span>Patient&rsquo;s left</span>
        </div>
        <span className="dental-chart-arch-label is-upper" aria-hidden>Upper</span>
        <span className="dental-chart-arch-label is-lower" aria-hidden>Lower</span>
        <span className="dental-chart-midline" aria-hidden />
        <svg
          viewBox={viewBox}
          role="group"
          aria-labelledby={titleId}
          className={cn(
          // Capped, not free. A dental arch is deeper than it is half-wide, so
          // at full width this renders about 1.4x taller than it is wide and
          // pushes the last molars under the dictation dock. `preserveAspect-
          // Ratio` defaults to `meet`, so the height cap scales the whole chart
          // down and centres it rather than cropping a tooth off the bottom.
          //
          // The cap is looser on small screens, where width already constrains
          // the chart and the desktop cap was shrinking it a further 20% for no
          // reason — on a phone every pixel of a lower incisor is one a thumb
          // has to hit.
          "mx-auto block max-h-[33rem] w-full touch-none select-none sm:max-h-[26rem]",
          readOnly ? "cursor-default" : "cursor-grab active:cursor-grabbing",
        )}
          onPointerDown={beginDrag}
          onPointerMove={continueDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={endDrag}
        >
        {/*
          Two passes. Every crown's solid silhouette goes down first, so that no
          tooth's side can land on top of a neighbouring occlusal face, then the
          faces and their labels. Within each pass the order is already
          far-to-near.
        */}
        {teeth.map((tooth) => (
          <path
            key={`body-${tooth.fdi}`}
            d={ringPath(tooth.body)}
            className="fill-secondary stroke-border"
            strokeWidth={0.4}
            strokeLinejoin="round"
            aria-hidden
          />
        ))}

        {orderedTeeth.map((tooth) => (
          <ToothFace
            key={tooth.fdi}
            tooth={tooth}
            state={
              selectedSet.has(tooth.fdi)
                ? "selected"
                : flaggedSet.has(tooth.fdi)
                  ? "flagged"
                  : treatedSet.has(tooth.fdi)
                    ? "treated"
                    : undefined
            }
            status={status?.get(tooth.fdi)}
            readOnly={readOnly}
            onToggle={handleToggle}
          />
        ))}
        </svg>
      </div>

      {status && status.size > 0 && <MouthSummary status={status} />}

      <ChartSummary
        selected={selected}
        flagged={flagged}
        dentition={dentition}
        readOnly={readOnly}
      />
    </div>
  );
}

function ToothFace({
  tooth,
  state,
  status,
  readOnly,
  onToggle,
}: {
  tooth: ToothGeometry;
  state: ToothState | undefined;
  status: ToothStatus | undefined;
  readOnly: boolean;
  onToggle: (fdi: number) => void;
}) {
  const { fdi, face, labelAt } = tooth;
  // A missing tooth is the one condition that changes the *shape* of the chart
  // rather than its colour: an outline with nothing in it, which is what a
  // dentist scanning for gaps is actually looking for.
  const gone = status?.missing === true && state !== "selected";

  /*
   * Every state carries a mark as well as a fill.
   *
   * The app's rule, stated at `Field` in the review sheet, is that a flagged
   * thing never signals with colour alone — it renders the words "check this"
   * beside the dot. The same applies here with more force, because a chart is
   * mostly colour by nature: a selected tooth gets a tick, an unresolved one
   * gets a warning triangle, and both are named in the summary underneath.
   */
  const fill =
    state === "selected"
      ? "fill-primary"
      : state === "flagged"
        ? "fill-warning-soft"
        : gone
          ? "fill-transparent"
          : status?.activeFindings.length
            ? "fill-warning-soft"
            : status?.implant
              ? "fill-secondary"
              : status || state === "treated"
                ? "fill-primary-soft"
                : "fill-card";

  const stroke =
    state === "selected"
      ? "stroke-primary"
      : state === "flagged"
        ? "stroke-warning"
        : status?.activeFindings.length
          ? "stroke-warning"
          : status && !gone
            ? "stroke-primary/50"
            : "stroke-field-border";

  // The condition is always spoken, whatever the colour is doing. A chart is
  // mostly colour by nature, and the app's rule is that nothing signals with
  // colour alone.
  const condition = status ? `, ${statusLabel(status)}` : "";
  const description =
    state === "selected"
      ? `${toothLabel(fdi)}, tooth ${fdi}, selected${condition}`
      : state === "flagged"
        ? `${toothLabel(fdi)}, tooth ${fdi}, needs checking${condition}`
        : status
          ? `${toothLabel(fdi)}, tooth ${fdi}${condition}`
          : state === "treated"
            ? `${toothLabel(fdi)}, tooth ${fdi}, treated before`
            : `${toothLabel(fdi)}, tooth ${fdi}`;

  const interactive = !readOnly;

  return (
    <g
      role={interactive ? "checkbox" : "img"}
      aria-checked={interactive ? state === "selected" : undefined}
      aria-label={description}
      tabIndex={interactive ? 0 : -1}
      className={cn(
        "outline-none",
        interactive &&
          "cursor-pointer focus-visible:[&>path]:stroke-ring focus-visible:[&>path]:stroke-[1.4]",
      )}
      onClick={interactive ? () => onToggle(fdi) : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              // Space scrolls the sheet otherwise, which throws the chart off
              // screen mid-selection.
              event.preventDefault();
              onToggle(fdi);
            }
          : undefined
      }
    >
      <path
        d={ringPath(face)}
        className={cn(fill, stroke, "transition-none")}
        strokeWidth={state === "selected" || status?.crowned ? 0.9 : 0.5}
        strokeDasharray={gone ? "1.6 1.2" : undefined}
        strokeLinejoin="round"
      />
      {/*
        Root-treated is the one condition with no outward sign on a crown, so it
        gets a mark of its own rather than a shade nobody can name. Suppressed on
        a missing tooth, which has no root left to have treated.
      */}
      {status?.rootTreated && !gone && (
        <circle
          cx={labelAt.x}
          cy={labelAt.y - tooth.labelSize * 0.92}
          r={tooth.labelSize * 0.17}
          // Inverted on a selected crown. The marker was `fill-primary` against
          // a `fill-primary` fill, so it vanished the moment a dentist tapped
          // the tooth — which is precisely when they are looking at it.
          className={cn(
            state === "selected" ? "fill-primary-foreground" : "fill-primary",
          )}
          aria-hidden
        />
      )}
      {/*
        Occlusal grooves. Drawn under the number and above the fill, at a weight
        that reads as anatomy rather than as a border. This is what makes a
        molar identifiable as a molar at twenty pixels wide.
      */}
      {tooth.fissures.map((line, index) => (
        <path
          key={`f${index}`}
          d={line
            .map((point, i) => `${i === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
            .join("")}
          fill="none"
          strokeWidth={0.28}
          strokeLinecap="round"
          className={cn(
            "pointer-events-none",
            state === "selected"
              ? "stroke-primary-foreground/55"
              : gone
                ? "stroke-transparent"
                : "stroke-muted-foreground/45",
          )}
          aria-hidden
        />
      ))}

      <text
        x={labelAt.x}
        y={svgNumber(labelAt.y + tooth.labelSize * 0.36)}
        textAnchor="middle"
        fontSize={tooth.labelSize}
        className={cn(
          "pointer-events-none font-semibold tabular-nums",
          state === "selected"
            ? "fill-primary-foreground"
            : gone
              ? "fill-muted-foreground/50"
              : "fill-muted-foreground",
        )}
      >
        {fdi}
      </text>
    </g>
  );
}

/**
 * What the chart is showing about the mouth, counted.
 *
 * The legend a dental chart needs, and the second half of the no-colour-alone
 * rule: the shading says something, and this says what.
 */
function MouthSummary({ status }: { status: ReadonlyMap<number, ToothStatus> }) {
  const counts = summariseMouth(status as Map<number, ToothStatus>);
  const parts: string[] = [];
  if (counts.missing) parts.push(`${counts.missing} missing`);
  if (counts.implants) parts.push(`${counts.implants} implant${counts.implants > 1 ? "s" : ""}`);
  if (counts.crowned) parts.push(`${counts.crowned} crowned`);
  if (counts.rootTreated) parts.push(`${counts.rootTreated} root treated`);
  if (counts.filled) parts.push(`${counts.filled} filled`);
  if (counts.findings) parts.push(`${counts.findings} with active findings`);

  if (parts.length === 0) return null;

  return (
    <p className="text-xs text-muted-foreground">
      <span className="font-medium text-foreground">{counts.treated} teeth with history</span>
      {" — "}
      {parts.join(" · ")}
    </p>
  );
}

/**
 * The selection in words.
 *
 * This is not a caption for the picture — for the question the chart is asking
 * it is the more reliable half of the answer. "36" and "lower left first molar"
 * fail differently: a dentist can misread a number and not notice, and cannot
 * misread the name. It is also the only part of this component a screen reader
 * can make sense of without walking thirty-two shapes.
 */
function ChartSummary({
  selected,
  flagged,
  dentition,
  readOnly,
}: {
  selected: readonly number[];
  flagged: readonly number[];
  dentition: Dentition;
  readOnly: boolean;
}) {
  const order = useMemo(() => chartOrder(dentition), [dentition]);
  const sort = useCallback(
    (teeth: readonly number[]) =>
      [...teeth].sort((a, b) => order.indexOf(a) - order.indexOf(b)),
    [order],
  );

  const chosen = sort(selected);
  const unresolved = sort(flagged);

  if (chosen.length === 0 && unresolved.length === 0) {
    // A read-only chart has nothing to select, so inviting a tap describes a
    // control that is not there. On the patient sheet the mouth summary above
    // has already said everything this line could.
    if (readOnly) return null;
    return (
      <p className="text-xs text-muted-foreground">
        No teeth selected yet. Tap a tooth, or dictate one.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 text-xs">
      {chosen.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <CheckIcon className="size-3.5 text-primary" aria-hidden />
          <span className="sr-only">Selected teeth:</span>
          {chosen.map((fdi) => (
            <span
              key={fdi}
              className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary-soft px-2 py-0.5 font-medium text-primary"
            >
              <span className="tabular-nums">{fdi}</span>
              <span className="text-primary/70">{toothLabel(fdi)}</span>
            </span>
          ))}
        </div>
      )}

      {unresolved.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <TriangleAlertIcon className="size-3.5 text-warning" aria-hidden />
          <span className="font-medium text-foreground">Check this:</span>
          {unresolved.map((fdi) => (
            <span
              key={fdi}
              className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning-soft px-2 py-0.5 font-medium"
            >
              <span className="tabular-nums">{fdi}</span>
              <span className="text-muted-foreground">{toothLabel(fdi)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
