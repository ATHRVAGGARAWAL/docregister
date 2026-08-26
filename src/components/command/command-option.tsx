import { Fragment } from "react";

import type { RankedCommandItem } from "@/components/command/command-items";
import { highlightSegments } from "@/components/command/fuzzy";
import { cn } from "@/lib/utils";

/**
 * One row of the palette's listbox.
 *
 * Focus never leaves the search box, so "active" here is a drawn state pointed
 * at by `aria-activedescendant` rather than a focused element. It is drawn with
 * a --ring halo rather than a fill: the fill would have to carry body text at
 * 3.65:1 on the dark theme (see the note on --primary in globals.css), and a
 * highlighted row nobody can read is not a highlight.
 */
export function CommandOption({
  id,
  index,
  ranked,
  active,
  onSelect,
}: {
  id: string;
  index: number;
  ranked: RankedCommandItem;
  active: boolean;
  onSelect: () => void;
}) {
  const { item, ranges } = ranked;
  const Icon = item.icon;

  return (
    <div
      role="option"
      id={id}
      data-command-index={index}
      data-active={active || undefined}
      aria-selected={active}
      // The visible label is broken into matched and unmatched spans, and a
      // screen reader walking those spans reads a name in pieces. Naming the
      // row outright puts it back together, and lets the second line and the
      // date be part of the row's name instead of debris after it.
      aria-label={spokenName(ranked)}
      onClick={onSelect}
      className={cn(
        "pressable flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2",
        active && "bg-secondary ring-2 ring-ring ring-inset",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "border-border bg-background grid size-8 shrink-0 place-items-center rounded-md border",
          active ? "text-primary" : "text-muted-foreground",
        )}
      >
        <Icon className="size-4" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="text-foreground block truncate text-sm font-medium tracking-[-0.01em]">
          {highlightSegments(item.label, ranges).map((segment, segmentIndex) => (
            <Fragment key={segmentIndex}>
              {segment.match ? (
                <span className={cn("font-semibold", !active && "text-primary")}>{segment.text}</span>
              ) : (
                segment.text
              )}
            </Fragment>
          ))}
        </span>
        {item.detail && (
          <span className="text-muted-foreground mt-0.5 block truncate text-xs leading-relaxed">
            {item.detail}
          </span>
        )}
      </span>

      {item.meta && (
        <span className="text-muted-foreground shrink-0 text-xs whitespace-nowrap">{item.meta}</span>
      )}
    </div>
  );
}

/** Label, second line, then the trailing date — the order the row is read in. */
function spokenName({ item }: RankedCommandItem): string {
  return [item.label, item.detail, item.meta].filter(Boolean).join(", ");
}
