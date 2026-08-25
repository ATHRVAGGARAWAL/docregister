"use client";

import { NotebookPen } from "lucide-react";

import { AnimatedItem } from "@/components/reactbits/reveal";
import { Badge } from "@/components/ui/badge";
import { formatClock, formatINR } from "@/lib/format";
import type { RegisterEntry } from "@/lib/types";

/**
 * Today's register.
 *
 * A ruled ledger sheet, which is the object this app replaces. Rows are
 * separated by hairlines rather than floated as individual cards: a register is
 * read as one continuous page down a spine, and eight stacked cards with eight
 * separate shadows turns that page into a pile.
 *
 * The fee sits in its own right-aligned monospaced column. That column is the
 * whole reason a doctor keeps a register — it has to add up by eye, which means
 * the digits have to line up vertically, which means tabular figures in a fixed
 * gutter rather than a number inline with the prose.
 */
export function RegisterTimeline({ entries }: { entries: RegisterEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="slip px-6 py-12 text-center">
        <span className="bg-secondary text-muted-foreground mx-auto grid size-11 place-items-center rounded-lg">
          <NotebookPen className="size-5" aria-hidden />
        </span>
        <p className="text-foreground mt-4 text-sm">No visits recorded yet today.</p>
        <p className="text-muted-foreground mt-1 text-xs">
          Hold the microphone and dictate your first patient.
        </p>
      </div>
    );
  }

  return (
    <ol className="slip divide-border divide-y overflow-hidden py-0">
      {entries.map((entry, index) => (
        <AnimatedItem
          as="li"
          key={entry.id}
          index={index}
          className="hover:bg-secondary/50 relative flex gap-3 px-4 py-3.5 transition-colors sm:px-5"
        >
          {/* Time gutter. Fixed width so the column holds its edge whether the
              row reads "9:05 am" or "12:40 pm". */}
          <div className="flex w-[4.25rem] shrink-0 items-baseline gap-1.5 pt-0.5">
            <span
              aria-hidden
              className="mt-1.5 size-[6px] shrink-0 rounded-full"
              style={{
                background:
                  entry.status === "draft"
                    ? "var(--money)"
                    : entry.is_new_patient
                      ? "var(--chart-1)"
                      : "var(--chart-2)",
              }}
            />
            <span className="text-muted-foreground tnum text-[11px]">
              {formatClock(entry.occurred_at)}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-foreground truncate font-medium">
              {entry.patient_name}
              {entry.age_years !== null && (
                <span className="text-muted-foreground ml-1.5 text-xs font-normal">
                  {entry.age_years}y
                </span>
              )}
            </p>

            {entry.diagnosis && (
              <p className="text-muted-foreground mt-0.5 truncate text-sm">{entry.diagnosis}</p>
            )}

            {entry.drugs.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {entry.drugs.slice(0, 4).map((drug) => (
                  <li
                    key={drug}
                    className="border-border bg-secondary text-secondary-foreground rounded-sm border px-1.5 py-0.5 text-[11px]"
                  >
                    {drug}
                  </li>
                ))}
                {entry.drugs.length > 4 && (
                  <li className="text-muted-foreground px-1 py-0.5 text-[11px]">
                    +{entry.drugs.length - 4}
                  </li>
                )}
              </ul>
            )}

            {/* Status is a word first and a colour second, always. */}
            <div className="mt-2 flex items-center gap-2 text-[11px]">
              {entry.status === "draft" ? (
                <Badge variant="money">Needs review</Badge>
              ) : entry.is_new_patient ? (
                <span className="text-muted-foreground">First visit</span>
              ) : (
                entry.visit_number && (
                  <span className="text-muted-foreground">Visit {entry.visit_number}</span>
                )
              )}
            </div>
          </div>

          {/* The figures column. */}
          <p className="text-money tnum shrink-0 pt-0.5 text-right text-sm font-medium">
            {entry.fees_inr !== null ? formatINR(entry.fees_inr) : "—"}
          </p>
        </AnimatedItem>
      ))}
    </ol>
  );
}
