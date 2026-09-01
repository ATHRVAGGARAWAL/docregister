/**
 * What the patient's own record says about what is safe to do to them today.
 *
 * `interactions.ts` answers "do these two drugs fight". This answers the
 * questions that a dental visit actually turns on: does this patient's allergy
 * forbid the antibiotic just prescribed, and does their medication make the
 * procedure just recorded a different procedure.
 *
 * ## The same doctrine, for the same reason
 *
 * Every rule here carries a citation, or it is not here. `interactions.ts`
 * records why: its 822-line predecessor was deleted for asserting sixteen
 * mechanisms with no source and classifying Meftal-P as paracetamol. A checker
 * that is confidently wrong is worse than none, because it gets trusted.
 *
 * And nothing here blocks anything. It renders beside a review a dentist is
 * already doing, and they can disagree with it. The commit path does not import
 * this file.
 *
 * ## What is deliberately absent, and why
 *
 * These four were considered and left out. Naming them is the point: the next
 * person to reach for one should find the argument rather than assume nobody
 * thought of it.
 *
 *   * **Antibiotic prophylaxis for infective endocarditis.** NICE CG64 advises
 *     against routine prophylaxis for dental procedures; the AHA's 2021
 *     scientific statement still recommends it for the highest-risk cardiac
 *     patients. They genuinely disagree. Shipping either would assert a
 *     consensus that does not exist, and shipping both would be a warning that
 *     tells a dentist to consult a guideline — which they can already do.
 *
 *   * **Adrenaline in local anaesthetic with hypertension.** The instinctive
 *     rule is "avoid", and it is wrong: guidance permits limited adrenaline in
 *     controlled hypertension, and the dose in two or three cartridges is small
 *     against endogenous release from an inadequately anaesthetised patient. A
 *     rule saying "avoid" would push dentists toward the worse option.
 *
 *   * **Radiographs in pregnancy.** Also instinctively "defer", also wrong.
 *     Dental radiography with appropriate shielding delivers a dose far below
 *     the threshold of concern, and both the ADA and the FDA say a clinically
 *     necessary radiograph should not be postponed. A "defer" warning would
 *     delay diagnosis for no benefit.
 *
 *   * **Diabetes and healing.** Real, and there is no crisp threshold to fire
 *     on. HbA1c is not in this record and "diabetic" alone does not tell a
 *     dentist anything they do not already know from the alert banner.
 */

import { moleculesIn, type PrescribedDrug } from "./interactions.ts";

export type SafetySeverity = "contraindicated" | "major" | "caution";

/** One row of `patient_alerts`, as the clinical route returns it. */
export interface PatientAlertRecord {
  kind: string;
  label: string;
  severity: string;
  note?: string | null;
  is_active?: boolean | null;
}

/** One row of `patient_medical_history`. */
export interface MedicalHistoryRecord {
  category: string;
  name: string;
  status?: string | null;
  detail?: string | null;
}

/** A procedure on this visit, only as much of it as a rule needs. */
export interface PlannedProcedure {
  procedure_name: string;
  tooth_fdi?: number | null;
}

export interface SafetyFinding {
  id: string;
  severity: SafetySeverity;
  headline: string;
  detail: string;
  source: string;
  /** The recorded fact that raised it, quoted back so it can be checked. */
  trigger: string;
}

/* --------------------------------------------------------------------------
 * Reading the patient's record
 *
 * Alerts and history are free text a clinic typed, so these are patterns over
 * what a person would actually write. A condition that does not match is not
 * detected and no rule fires — which is the safe direction: this file's job is
 * to catch the cases it recognises, and it says so on screen rather than
 * implying it has checked everything.
 * ----------------------------------------------------------------------- */

const PENICILLIN_ALLERGY = /penicillin|amoxicillin|amoxycillin|augmentin|beta-?lactam/i;
const ANTIRESORPTIVE = /bisphosphonate|alendron|risedron|ibandron|zoledron|pamidron|denosumab|prolia|xgeva/i;
const ANTICOAGULANT = /warfarin|acitrom|acenocoumarol|apixaban|rivaroxaban|dabigatran|edoxaban|eliquis|xarelto|anticoagulant|blood thinner/i;
const PREGNANCY = /pregnan|gravid|expecting/i;

/** Active entries only — a resolved condition is history, not a live risk. */
function activeText(
  alerts: readonly PatientAlertRecord[],
  history: readonly MedicalHistoryRecord[],
): { text: string; source: string }[] {
  const out: { text: string; source: string }[] = [];
  for (const alert of alerts) {
    if (alert.is_active === false) continue;
    out.push({ text: `${alert.kind} ${alert.label} ${alert.note ?? ""}`, source: alert.label });
  }
  for (const entry of history) {
    if (entry.status && entry.status !== "active") continue;
    out.push({ text: `${entry.category} ${entry.name} ${entry.detail ?? ""}`, source: entry.name });
  }
  return out;
}

function firstMatch(
  facts: readonly { text: string; source: string }[],
  pattern: RegExp,
): string | null {
  const hit = facts.find((fact) => pattern.test(fact.text));
  return hit ? hit.source : null;
}

/** Does any prescribed line supply this molecule? */
function prescribed(prescription: readonly PrescribedDrug[], molecule: string): string | null {
  for (const drug of prescription) {
    const name = drug.drug_name ?? "";
    if (moleculesIn(name).includes(molecule)) return name;
  }
  return null;
}

const EXTRACTION = /extract|exodont|removal of tooth|surgical removal|disimpact/i;

function extractionAmong(procedures: readonly PlannedProcedure[]): string | null {
  const hit = procedures.find((procedure) => EXTRACTION.test(procedure.procedure_name));
  if (!hit) return null;
  return hit.tooth_fdi != null ? `${hit.procedure_name} (${hit.tooth_fdi})` : hit.procedure_name;
}

/**
 * Everything this visit raises against this patient's record.
 *
 * Most severe first, at most one finding per rule.
 */
export function findSafetyIssues(input: {
  alerts?: readonly PatientAlertRecord[];
  medicalHistory?: readonly MedicalHistoryRecord[];
  prescription?: readonly PrescribedDrug[];
  procedures?: readonly PlannedProcedure[];
}): SafetyFinding[] {
  const alerts = input.alerts ?? [];
  const history = input.medicalHistory ?? [];
  const prescription = input.prescription ?? [];
  const procedures = input.procedures ?? [];

  const facts = activeText(alerts, history);
  const findings: SafetyFinding[] = [];

  // 1. A penicillin prescribed to a patient recorded as allergic to penicillin.
  //    The most direct contraindication in dentistry, and the easiest to hit:
  //    amoxicillin-clavulanate is the default dental antibiotic.
  const allergy = firstMatch(facts, PENICILLIN_ALLERGY);
  const penicillinLine = prescribed(prescription, "penicillin");
  if (allergy && penicillinLine) {
    findings.push({
      id: "penicillin-allergy",
      severity: "contraindicated",
      headline: `${penicillinLine} with a recorded penicillin allergy`,
      detail:
        "Amoxicillin and co-amoxiclav are contraindicated in penicillin hypersensitivity. " +
        "Clindamycin, azithromycin and metronidazole are the usual dental alternatives. " +
        "Cephalosporin cross-reactivity is real but far lower than once believed, so a " +
        "cephalosporin is a decision rather than an automatic exclusion.",
      source: "BNF / amoxicillin SmPC — contraindicated in penicillin hypersensitivity",
      trigger: allergy,
    });
  }

  // 2. Extraction in a patient on an antiresorptive.
  const antiresorptive =
    firstMatch(facts, ANTIRESORPTIVE) ?? prescribed(prescription, "antiresorptive");
  const extraction = extractionAmong(procedures);
  if (antiresorptive && extraction) {
    findings.push({
      id: "mronj-risk",
      severity: "major",
      headline: `Extraction on an antiresorptive — MRONJ risk`,
      detail:
        "Bisphosphonates and denosumab carry a risk of medication-related osteonecrosis of " +
        "the jaw after dentoalveolar surgery. Risk rises with duration and is higher for " +
        "intravenous than oral therapy. Consider whether the tooth can be retained and " +
        "root-treated instead, and record the discussion.",
      source: "AAOMS Position Paper on Medication-Related Osteonecrosis of the Jaw — 2022 Update",
      trigger: antiresorptive,
    });
  }

  // 3. Extraction in an anticoagulated patient.
  //
  //    Phrased around NOT stopping the drug, deliberately. The instinctive
  //    response is to interrupt it, and interrupting it causes thromboembolism
  //    — a worse outcome than a socket that oozes.
  const anticoagulant =
    firstMatch(facts, ANTICOAGULANT) ??
    prescribed(prescription, "warfarin") ??
    prescribed(prescription, "doac");
  if (anticoagulant && extraction) {
    findings.push({
      id: "anticoagulant-extraction",
      severity: "major",
      headline: "Extraction while anticoagulated",
      detail:
        "Do not interrupt the anticoagulant for a routine dental extraction — the " +
        "thromboembolic risk of stopping it outweighs the bleeding risk of continuing. " +
        "Treat early in the day, use local haemostatic measures, and check the INR within " +
        "24 hours where the patient is on warfarin.",
      source:
        "SDCEP — Management of Dental Patients Taking Anticoagulants or Antiplatelet Drugs (3rd edition, 2022)",
      trigger: anticoagulant,
    });
  }

  // 4. An NSAID prescribed in pregnancy.
  const pregnancy = firstMatch(facts, PREGNANCY);
  const nsaidLine = prescribed(prescription, "nsaid");
  if (pregnancy && nsaidLine) {
    findings.push({
      id: "nsaid-pregnancy",
      severity: "major",
      headline: `${nsaidLine} in pregnancy`,
      detail:
        "NSAIDs are avoided from 20 weeks onward: they can cause fetal renal impairment and " +
        "oligohydramnios, and near term they risk premature closure of the ductus " +
        "arteriosus. Paracetamol is the usual analgesic in pregnancy.",
      source: "FDA Drug Safety Communication, 15 October 2020 — NSAID use at 20 weeks or later",
      trigger: pregnancy,
    });
  }

  const order: Record<SafetySeverity, number> = { contraindicated: 0, major: 1, caution: 2 };
  return findings.sort((a, b) => order[a.severity] - order[b.severity]);
}

/**
 * The alerts worth putting in front of a dentist before they touch anything.
 *
 * Not a rule — just the record, surfaced. Most of what keeps a patient safe is
 * the dentist knowing the patient is on warfarin, which no rule can improve on.
 */
export function criticalAlerts(
  alerts: readonly PatientAlertRecord[],
): PatientAlertRecord[] {
  return alerts.filter(
    (alert) => alert.is_active !== false && (alert.severity === "critical" || alert.severity === "important"),
  );
}
