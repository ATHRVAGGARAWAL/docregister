/**
 * A very small set of drug interactions, each one sourced.
 *
 * ## What this is, and what it deliberately is not
 *
 * It is four rules. It is not a formulary, not a substitute for one, and not a
 * safety net — a doctor who starts relying on it to catch things will be caught
 * out, because the overwhelming majority of real interactions are not in here.
 * Every string it shows says so.
 *
 * The first version of this file was deleted rather than fixed. It carried 822
 * lines, sixteen mechanism claims, two dose ceilings and zero citations, and it
 * classified `Meftal-P` as paracetamol. Meftal-P is paediatric mefenamic acid,
 * so a prescription containing it would have invented a paracetamol warning
 * while suppressing the NSAID-duplication warning it should have raised. That
 * is the failure mode this file is arranged against: an interaction checker
 * that is confidently wrong is worse than none, because it gets trusted.
 *
 * So the rules here are few, each carries a reference a doctor can follow, and
 * anything whose composition could not be sourced is simply absent. Missing a
 * real interaction is a known limitation stated on screen. Inventing one is not
 * recoverable.
 *
 * ## It advises; it never acts
 *
 * Nothing here blocks a commit, edits a prescription, or changes what is saved.
 * It renders a note beside a review a doctor is already doing, and they can
 * ignore it. That is the same rule the rest of this app follows: nothing enters
 * the register without the doctor putting it there.
 */

import type { InteractionFinding, InteractionSeverity, PrescribedDrug } from "./interactions.data.ts";
import { DRUGS, RULES } from "./interactions.data.ts";

export type { InteractionFinding, InteractionSeverity, PrescribedDrug };

/**
 * Which known molecules a prescription line mentions.
 *
 * A line can name more than one, because a combination brand is one line and
 * two molecules — Combiflam is ibuprofen and paracetamol, and both matter.
 *
 * Matching is on word boundaries against a normalised name, never on substring
 * containment: `\bnitro\b` must not fire on "nitrofurantoin", which is an
 * antibiotic and not a nitrate. The near-miss cases are the ones the tests
 * spend most of their assertions on.
 */
export function moleculesIn(drugName: string): string[] {
  const normalised = normalise(drugName);
  if (!normalised) return [];

  const found = new Set<string>();
  for (const drug of DRUGS) {
    if (drug.patterns.some((pattern) => pattern.test(normalised))) {
      for (const molecule of drug.molecules) found.add(molecule);
    }
  }
  return [...found];
}

/**
 * The interactions this prescription raises.
 *
 * Returns at most one finding per rule, most severe first. A rule fires when
 * two *different* lines supply the two sides of it — the same line naming both
 * molecules is a combination product, which is a formulation decision somebody
 * already made and not a prescribing error to warn about.
 */
export function findInteractions(prescription: readonly PrescribedDrug[]): InteractionFinding[] {
  const lines = prescription
    .map((drug, index) => ({ index, name: drug.drug_name ?? "", molecules: moleculesIn(drug.drug_name ?? "") }))
    .filter((line) => line.molecules.length > 0);

  const findings: InteractionFinding[] = [];

  for (const rule of RULES) {
    const left = lines.filter((line) => line.molecules.some((m) => rule.left.includes(m)));
    const right = lines.filter((line) => line.molecules.some((m) => rule.right.includes(m)));

    // Distinct lines only. `left[0]` and `right[0]` being the same entry means
    // one product contains both sides.
    const pair = left.flatMap((a) => right.map((b) => [a, b] as const)).find(([a, b]) => a.index !== b.index);
    if (!pair) continue;

    findings.push({
      id: rule.id,
      severity: rule.severity,
      headline: rule.headline,
      detail: rule.detail,
      source: rule.source,
      drugs: [pair[0].name, pair[1].name],
    });
  }

  const order: Record<InteractionSeverity, number> = { contraindicated: 0, major: 1, caution: 2 };
  return findings.sort((a, b) => order[a.severity] - order[b.severity]);
}

/** Lowercased, punctuation flattened to spaces, so "Zerodol-P" and "zerodol p" agree. */
function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
