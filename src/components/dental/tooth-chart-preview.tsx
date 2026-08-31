"use client";

import { useState } from "react";

import { ToothChart } from "@/components/dental/tooth-chart";
import { Button } from "@/components/ui/button";
import type { Dentition } from "@/lib/dental/tooth";
import {
  deriveToothStatus,
  type ToothProcedureRecord,
} from "@/lib/dental/tooth-status";

/**
 * A place to actually use the tooth chart before it has a record to attach to.
 *
 * Temporary. It exists because the chart's real home is the review sheet's
 * procedures section, which needs `encounter_procedures` to exist first — and
 * shipping an interactive control that nobody has touched with a thumb is how
 * you find out on a clinic floor that the molars are too small to tap.
 *
 * Delete this file and its one mount in `settings-workspace.tsx` once the chart
 * is wired into review.
 */
export function ToothChartPreview() {
  const [dentition, setDentition] = useState<Dentition>("permanent");
  const [selected, setSelected] = useState<number[]>([36, 16]);

  // Fixed examples so every state is on screen at once: something the model was
  // unsure of, and something with history behind it.
  const flagged = dentition === "permanent" ? [47] : [75];
  const treated = dentition === "permanent" ? [] : [51, 61];

  // A plausible adult history, written as the sequence it happened in — which
  // is also what exercises the ordering rules in `deriveToothStatus`.
  const status =
    dentition === "permanent"
      ? deriveToothStatus(HISTORY)
      : undefined;

  const toggle = (fdi: number) =>
    setSelected((current) =>
      current.includes(fdi) ? current.filter((t) => t !== fdi) : [...current, fdi],
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={dentition === "permanent" ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setDentition("permanent");
            setSelected([36, 16]);
          }}
        >
          Adult
        </Button>
        <Button
          type="button"
          variant={dentition === "primary" ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setDentition("primary");
            setSelected([54]);
          }}
        >
          Child
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setSelected([])}>
          Clear
        </Button>
      </div>

      <ToothChart
        dentition={dentition}
        selected={selected}
        flagged={flagged}
        treated={treated}
        status={status}
        onToggle={toggle}
        label="Tap a tooth to select it. Drag to turn the model."
      />
    </div>
  );
}

/** A plausible adult history, oldest first. */
const HISTORY: ToothProcedureRecord[] = [
  { tooth_fdi: 26, occurred_at: "2023-04-11T10:00:00+05:30", procedure_name: "Composite restoration", tooth_effect: "restores", surfaces: ["O"] },
  { tooth_fdi: 18, occurred_at: "2023-09-02T10:00:00+05:30", procedure_name: "Extraction — third molar", tooth_effect: "extracts" },
  { tooth_fdi: 26, occurred_at: "2024-01-20T10:00:00+05:30", procedure_name: "Composite restoration", tooth_effect: "restores", surfaces: ["M"] },
  { tooth_fdi: 16, occurred_at: "2024-06-08T10:00:00+05:30", procedure_name: "Root canal — molar", tooth_effect: "root_treats" },
  { tooth_fdi: 16, occurred_at: "2024-07-19T10:00:00+05:30", procedure_name: "Crown — PFM", tooth_effect: "crowns" },
  { tooth_fdi: 46, occurred_at: "2024-11-03T10:00:00+05:30", procedure_name: "Extraction — simple", tooth_effect: "extracts" },
  { tooth_fdi: 46, occurred_at: "2025-03-15T10:00:00+05:30", procedure_name: "Implant", tooth_effect: "implants" },
  { tooth_fdi: 37, occurred_at: "2025-08-01T10:00:00+05:30", procedure_name: "GIC restoration", tooth_effect: "restores", surfaces: ["M", "O", "D"] },
  { tooth_fdi: 24, occurred_at: "2026-02-10T10:00:00+05:30", procedure_name: "Pit and fissure sealant", tooth_effect: "seals" },
  { tooth_fdi: 36, occurred_at: "2026-05-06T10:00:00+05:30", procedure_name: "Root canal — molar", tooth_effect: "root_treats" },
];
