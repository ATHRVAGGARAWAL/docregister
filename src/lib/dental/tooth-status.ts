/**
 * The state of a mouth, derived from the procedures done to it.
 *
 * `encounter_procedures` stores events — on this date, this was done to that
 * tooth. A dentist reading a chart wants the accumulated result: which teeth
 * are missing, crowned, root-treated, filled and on which surfaces. This module
 * is the fold from one to the other.
 *
 * ## Why it is order-dependent, and therefore chronological
 *
 * The interesting cases are all sequences, not sets:
 *
 *   extraction, then implant     → an implant, not a missing tooth
 *   RCT, then crown              → both. A crowned tooth can be root-treated.
 *   filling on M, later on O     → surfaces accumulate to MO
 *   crown, then extraction       → missing. The crown left with the tooth.
 *
 * A set-based rule ("has any extraction ⇒ missing") gets the first and last of
 * those wrong in opposite directions. So the reducer walks the history in the
 * order it happened and each effect acts on the state so far — which is also
 * what makes it straightforward to test against named clinical sequences.
 *
 * ## What it will not do
 *
 * It never infers. A procedure whose catalogue entry declares `none` changes no
 * state, including a custom procedure the clinic invented — see the note in
 * `0026_tooth_status.sql` for why that is the safe direction to fail. And only
 * committed encounters reach here, because a draft is a suggestion until a
 * dentist confirms it.
 */

import { isFdiTooth, sortSurfaces, type ToothSurface } from "./tooth.ts";

/** Mirrors the `tooth_effect` enum in `0026_tooth_status.sql`. */
export type ToothEffect =
  | "none"
  | "restores"
  | "root_treats"
  | "crowns"
  | "extracts"
  | "implants"
  | "seals";

/** One row of `patient_tooth_procedures`, oldest first. */
export interface ToothProcedureRecord {
  tooth_fdi: number;
  occurred_at: string;
  procedure_name: string;
  tooth_effect: ToothEffect;
  surfaces?: readonly string[] | null;
  encounter_id?: string;
}

export type ToothFindingKind =
  | "sound"
  | "caries"
  | "fracture"
  | "wear"
  | "mobility"
  | "periapical"
  | "impacted"
  | "missing"
  | "restoration"
  | "crown"
  | "implant"
  | "root_canal"
  | "sealant"
  | "other";

export type ToothFindingState = "existing" | "planned" | "completed" | "resolved";

/** A structured chart entry returned by the clinical-chart endpoint. */
export interface ToothFindingRecord {
  tooth_fdi: number;
  finding: ToothFindingKind;
  state: ToothFindingState;
  observed_at: string;
  resolved_at?: string | null;
  surfaces?: readonly string[] | null;
  severity?: "mild" | "moderate" | "severe" | null;
}

export interface ActiveToothFinding {
  finding: Exclude<
    ToothFindingKind,
    "sound" | "missing" | "restoration" | "crown" | "implant" | "root_canal" | "sealant"
  >;
  surfaces: ToothSurface[];
  severity: "mild" | "moderate" | "severe" | null;
  observedAt: string;
}

export interface ToothStatus {
  fdi: number;
  /** Extracted and not replaced. Suppresses every other flag below. */
  missing: boolean;
  implant: boolean;
  crowned: boolean;
  rootTreated: boolean;
  sealed: boolean;
  /** A positive examination finding, distinct from an unexamined tooth. */
  sound: boolean;
  /** Accumulated across every restoration, in clinical order. */
  restoredSurfaces: ToothSurface[];
  /** Unresolved pathology that still needs clinical attention. */
  activeFindings: ActiveToothFinding[];
  /** How many procedures of any kind touched this tooth. */
  procedureCount: number;
  /** ISO timestamp of the most recent procedure on it. */
  lastTreatedAt: string | null;
}

function emptyStatus(fdi: number): ToothStatus {
  return {
    fdi,
    missing: false,
    implant: false,
    crowned: false,
    rootTreated: false,
    sealed: false,
    sound: false,
    restoredSurfaces: [],
    activeFindings: [],
    procedureCount: 0,
    lastTreatedAt: null,
  };
}

/**
 * Fold one procedure into the state so far.
 *
 * Split out and exported for the tests, which walk clinical sequences one step
 * at a time rather than asserting only on the end state — when a sequence comes
 * out wrong, the failing step is the useful thing to know.
 */
export function applyEffect(status: ToothStatus, record: ToothProcedureRecord): ToothStatus {
  const next: ToothStatus = {
    ...status,
    restoredSurfaces: [...status.restoredSurfaces],
    activeFindings: [...status.activeFindings],
    procedureCount: status.procedureCount + 1,
    // `occurred_at` arrives ordered from SQL, but `max` rather than "last wins"
    // so an unsorted caller cannot make this go backwards.
    lastTreatedAt:
      status.lastTreatedAt === null || record.occurred_at > status.lastTreatedAt
        ? record.occurred_at
        : status.lastTreatedAt,
  };

  switch (record.tooth_effect) {
    case "extracts":
      // The tooth is gone, and so is everything that was done to it. Keeping a
      // crown flag on a missing tooth would render as a crowned gap.
      next.missing = true;
      next.implant = false;
      next.crowned = false;
      next.rootTreated = false;
      next.sealed = false;
      next.restoredSurfaces = [];
      next.sound = false;
      break;

    case "implants":
      // A fixture in the socket. The site is no longer an absence, but it is
      // also not the natural tooth, so it carries none of the old flags.
      next.missing = false;
      next.implant = true;
      next.crowned = false;
      next.rootTreated = false;
      next.sealed = false;
      next.restoredSurfaces = [];
      next.sound = false;
      break;

    case "crowns":
      if (!next.missing) {
        next.crowned = true;
        next.sound = false;
      }
      break;

    case "root_treats":
      if (!next.missing) {
        next.rootTreated = true;
        next.sound = false;
      }
      break;

    case "seals":
      if (!next.missing) {
        next.sealed = true;
        next.sound = false;
      }
      break;

    case "restores": {
      if (next.missing) break;
      const added = sortSurfaces([
        ...next.restoredSurfaces,
        ...sortSurfaces((record.surfaces ?? []).map(String)),
      ]);
      next.restoredSurfaces = added;
      next.sound = false;
      break;
    }

    case "none":
      break;
  }

  next.activeFindings = clearFindingsResolvedBy(next.activeFindings, record.tooth_effect);

  return next;
}

const FINDING_EFFECT: Partial<Record<ToothFindingKind, ToothEffect>> = {
  missing: "extracts",
  restoration: "restores",
  crown: "crowns",
  implant: "implants",
  root_canal: "root_treats",
  sealant: "seals",
};

const PATHOLOGY_FINDINGS = new Set<ActiveToothFinding["finding"]>([
  "caries",
  "fracture",
  "wear",
  "mobility",
  "periapical",
  "impacted",
  "other",
]);

function clearFindingsResolvedBy(
  findings: readonly ActiveToothFinding[],
  effect: ToothEffect,
): ActiveToothFinding[] {
  if (effect === "extracts" || effect === "implants") return [];

  const resolved =
    effect === "restores" || effect === "crowns"
      ? new Set<ActiveToothFinding["finding"]>(["caries", "fracture", "wear"])
      : effect === "root_treats"
        ? new Set<ActiveToothFinding["finding"]>(["periapical"])
        : null;

  return resolved ? findings.filter((finding) => !resolved.has(finding.finding)) : [...findings];
}

function applyFinding(status: ToothStatus, record: ToothFindingRecord): ToothStatus {
  const next: ToothStatus = {
    ...status,
    restoredSurfaces: [...status.restoredSurfaces],
    activeFindings: [...status.activeFindings],
  };

  if (record.state === "resolved" || record.state === "completed") {
    next.activeFindings = next.activeFindings.filter(
      (finding) => finding.finding !== record.finding,
    );
  }

  // Planned work is not a current clinical condition and must not make the
  // diagnostic chart claim treatment has already happened.
  if (record.state === "planned" || record.state === "resolved") return next;

  const effect = FINDING_EFFECT[record.finding];
  if (effect) {
    // A completed or currently observed restoration/crown/etc. is current
    // chart state even when the corresponding historic procedure was entered
    // elsewhere. It does not inflate the count of committed procedures.
    const applied = applyEffect(next, {
      tooth_fdi: record.tooth_fdi,
      occurred_at: record.observed_at,
      procedure_name: record.finding,
      tooth_effect: effect,
      surfaces: record.surfaces,
    });
    applied.procedureCount = next.procedureCount;
    applied.lastTreatedAt = next.lastTreatedAt;
    return applied;
  }

  if (record.finding === "sound") {
    next.sound = true;
    next.activeFindings = [];
    return next;
  }

  if (record.state === "existing" && PATHOLOGY_FINDINGS.has(record.finding as ActiveToothFinding["finding"])) {
    const finding = record.finding as ActiveToothFinding["finding"];
    next.sound = false;
    next.activeFindings = [
      ...next.activeFindings.filter((entry) => entry.finding !== finding),
      {
        finding,
        surfaces: sortSurfaces((record.surfaces ?? []).map(String)),
        severity: record.severity ?? null,
        observedAt: record.observed_at,
      },
    ];
  }

  return next;
}

/**
 * Every tooth this patient has a history on, keyed by FDI number.
 *
 * Teeth with no history are absent rather than present-and-empty: the chart
 * treats a missing key as "sound, nothing recorded", and materialising
 * thirty-two blank objects to say the same thing would only invite a caller to
 * read `missing: false` as a clinical statement. It is not one — it means
 * nobody has recorded anything, which is a different fact.
 */
export function deriveToothStatus(
  records: readonly ToothProcedureRecord[],
  findings: readonly ToothFindingRecord[] = [],
): Map<number, ToothStatus> {
  const timeline = [
    ...records.map((record) => ({
      at: record.occurred_at,
      // Apply the completed procedure first on an exact timestamp tie. A
      // finding charted at that same instant is the clinician's final stated
      // observation and should therefore be the visible state.
      order: 0,
      type: "procedure" as const,
      record,
    })),
    ...findings.map((record) => ({
      at: record.state === "resolved" ? (record.resolved_at ?? record.observed_at) : record.observed_at,
      order: 1,
      type: "finding" as const,
      record,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at) || a.order - b.order);

  const byTooth = new Map<number, ToothStatus>();
  for (const event of timeline) {
    // A row whose tooth number is not a tooth is dropped rather than charted.
    // The database constrains this (`is_fdi_tooth`), so reaching here means a
    // caller built records by hand — and a fabricated tooth on a chart is worse
    // than a missing one.
    if (!isFdiTooth(event.record.tooth_fdi)) continue;
    const current = byTooth.get(event.record.tooth_fdi) ?? emptyStatus(event.record.tooth_fdi);
    byTooth.set(
      event.record.tooth_fdi,
      event.type === "procedure"
        ? applyEffect(current, event.record)
        : applyFinding(current, event.record),
    );
  }
  return byTooth;
}

/** Single-word label for a tooth's state, for a legend or a screen reader. */
export function statusLabel(status: ToothStatus | undefined): string {
  if (!status) return "no history";
  const findings = status.activeFindings.map((finding) => {
    const surface = finding.surfaces.length > 0 ? ` ${finding.surfaces.join("")}` : "";
    const severity = finding.severity ? `${finding.severity} ` : "";
    return `${severity}${finding.finding}${surface}`;
  });

  let structural: string | null = null;
  if (status.implant) structural = "implant";
  else if (status.missing) structural = "missing";
  else if (status.crowned) structural = status.rootTreated ? "crowned, root treated" : "crowned";
  else if (status.rootTreated) structural = "root treated";
  else if (status.restoredSurfaces.length > 0) structural = `filled ${status.restoredSurfaces.join("")}`;
  else if (status.sealed) structural = "sealed";
  else if (status.sound) structural = "sound";
  else if (status.procedureCount > 0) structural = "treated";

  return [...findings, ...(structural ? [structural] : [])].join("; ") || "recorded finding";
}

/** Counts for a chart summary line. */
export function summariseMouth(statuses: ReadonlyMap<number, ToothStatus>): {
  missing: number;
  implants: number;
  crowned: number;
  rootTreated: number;
  filled: number;
  findings: number;
  treated: number;
} {
  let missing = 0;
  let implants = 0;
  let crowned = 0;
  let rootTreated = 0;
  let filled = 0;
  let findings = 0;

  for (const status of statuses.values()) {
    if (status.implant) implants += 1;
    else if (status.missing) missing += 1;
    if (status.crowned) crowned += 1;
    if (status.rootTreated) rootTreated += 1;
    if (status.restoredSurfaces.length > 0) filled += 1;
    if (status.activeFindings.length > 0) findings += 1;
  }

  return { missing, implants, crowned, rootTreated, filled, findings, treated: statuses.size };
}
