"use client";

import { CircleAlertIcon, ShieldCheckIcon, TriangleAlertIcon } from "@/components/icons";
import {
  criticalAlerts,
  findSafetyIssues,
  type MedicalHistoryRecord,
  type PatientAlertRecord,
  type PlannedProcedure,
} from "@/lib/clinical/safety";
import type { PrescribedDrug } from "@/lib/clinical/interactions";
import { cn } from "@/lib/utils";

/**
 * What this patient's record says about what is being prescribed and done.
 *
 * Two halves, and the first matters more. The banner is just the record —
 * "on warfarin", "penicillin allergy" — put where a dentist reads it before
 * they act. Most of what keeps a patient safe is knowing that, and no rule
 * improves on it. The findings below are the four cases where a rule can add
 * something the label alone does not.
 *
 * Advisory, like `InteractionWarnings` beside it. Nothing here blocks the
 * commit, edits a line, or has a confirm step of its own — the commit path does
 * not import any of it.
 *
 * The closing line is not cover. Four rules is few enough that a dentist could
 * reasonably read a quiet panel as "checked and clear", and it does not mean
 * that. Saying so is what keeps this from being worse than showing nothing.
 */
export function SafetyPanel({
  alerts,
  medicalHistory,
  prescription,
  procedures,
  className,
}: {
  alerts: readonly PatientAlertRecord[];
  medicalHistory: readonly MedicalHistoryRecord[];
  prescription: readonly PrescribedDrug[];
  procedures: readonly PlannedProcedure[];
  className?: string;
}) {
  const banner = criticalAlerts(alerts);
  const findings = findSafetyIssues({ alerts, medicalHistory, prescription, procedures });

  if (banner.length === 0 && findings.length === 0) return null;

  return (
    <section className={cn("space-y-2", className)} aria-label="Patient safety">
      {banner.length > 0 && (
        <div className="surface-inset rounded-xl border border-warning/30 bg-warning-soft p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-warning">
            <ShieldCheckIcon className="size-3.5" aria-hidden />
            On this chart
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {banner.map((alert, index) => (
              <li
                key={`${alert.label}-${index}`}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium",
                  // Never colour alone: `critical` also carries the word, and
                  // every entry is inside a section a screen reader announces
                  // as "Patient safety".
                  alert.severity === "critical"
                    ? "border-destructive/30 bg-destructive-soft text-destructive"
                    : "border-border bg-card text-foreground",
                )}
              >
                {alert.severity === "critical" && (
                  <>
                    <CircleAlertIcon className="size-3" aria-hidden />
                    <span className="sr-only">Critical: </span>
                  </>
                )}
                {alert.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {findings.map((finding) => (
        <div
          key={finding.id}
          className={cn(
            "surface-inset rounded-xl border p-3",
            finding.severity === "contraindicated"
              ? "border-destructive/30 bg-destructive-soft"
              : "border-warning/30 bg-warning-soft",
          )}
        >
          <p
            className={cn(
              "flex items-start gap-2 text-sm font-semibold",
              finding.severity === "contraindicated" ? "text-destructive" : "text-warning",
            )}
          >
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              {/* The severity in words, because the colour is not the message. */}
              <span className="uppercase tracking-[0.08em]">
                {finding.severity === "contraindicated" ? "Contraindicated" : "Check"}
              </span>
              {" — "}
              {finding.headline}
            </span>
          </p>
          <p className="mt-1.5 text-xs leading-5 text-foreground">{finding.detail}</p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {/* What on the chart raised it, so the dentist can check the premise
                rather than take the warning on faith. */}
            From this chart: {finding.trigger} · {finding.source}
          </p>
        </div>
      ))}

      <p className="text-xs text-muted-foreground">
        A small set of checks, not a formulary. It will miss risks it does not
        know about.
      </p>
    </section>
  );
}
