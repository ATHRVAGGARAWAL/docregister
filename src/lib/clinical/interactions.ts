import { normaliseFrequency, type FrequencyCode } from "../llm/dosage.ts";
import {
  DOSE_CEILINGS,
  INGREDIENTS,
  INTERACTION_RULES,
  type DrugClass,
  type IngredientId,
  type Selector,
  type Severity,
} from "./interactions.data.ts";

export type { IngredientId, Severity } from "./interactions.data.ts";

/**
 * Prescription safety net.
 *
 * This ADVISES. It never blocks a save, never edits a line, never removes a
 * drug and never asks to be acknowledged. The doctor overrides it by carrying
 * on, and the register records exactly what they wrote either way. A warning
 * that stops a two-minute consultation is worse than no warning at all, which
 * is why every design choice below leans toward saying nothing when unsure:
 * unrecognised names, unparseable strengths and as-needed frequencies all
 * produce silence rather than a guess.
 *
 * The silence cuts the other way too, so nothing here ever reports an all-clear.
 * A curated table of sixteen rules cannot support the claim that a prescription
 * is safe; it can only support the claim that these particular pairs are worth
 * a second look.
 *
 * Drug text is normalised the way `../llm/dosage.ts` normalises frequency text —
 * a deterministic table of patterns over a lowercased haystack, with anything
 * unmatched passed over rather than guessed at.
 */

/** Everything a warning needs from one prescription line. */
export interface PrescriptionLine {
  drug_name: string;
  strength?: string | null;
  form?: string | null;
  route?: string | null;
  frequency_spoken?: string | null;
}

export type WarningKind = "interaction" | "duplicate" | "dose";

export interface PrescriptionWarning {
  /** Stable across renders for the same prescription; unique within a result. */
  id: string;
  kind: WarningKind;
  severity: Severity;
  /** Indices into the prescription array, ascending. */
  medicationIndexes: number[];
  /** Drug names exactly as the doctor wrote them, aligned with the indexes. */
  drugs: string[];
  headline: string;
  detail: string;
  action: string;
}

const CLASSES_BY_INGREDIENT = new Map<IngredientId, readonly DrugClass[]>(
  INGREDIENTS.map((ingredient) => [ingredient.id, ingredient.classes]),
);

/**
 * Forms and routes with no systemic exposure worth warning about.
 *
 * A diclofenac gel beside warfarin is not the bleeding risk an oral tablet is,
 * and firing there would burn the warning the oral pair needs. `gel` is
 * deliberately absent: an antacid gel is swallowed, and suppressing Digene
 * would lose a true chelation warning to catch a rare false one.
 */
const NON_SYSTEMIC = /\b(?:topical|topically|ointment|cream|lotion|patch|emulgel|ophthalmic|otic)\b/;

/**
 * Doses per day for each canonical frequency.
 *
 * `SOS` is absent on purpose: as-needed has no daily count, and inventing one
 * would let a dose ceiling fire on a prescription that may never reach it.
 */
const DOSES_PER_DAY: Partial<Record<FrequencyCode, number>> = {
  OD: 1,
  BD: 2,
  TDS: 3,
  QID: 4,
  HS: 1,
  STAT: 1,
  ALT_DAY: 0.5,
  WEEKLY: 1 / 7,
};

const SEVERITY_ORDER: Record<Severity, number> = { major: 0, moderate: 1 };

/**
 * Lowercase, punctuation to spaces, letter/digit runs split apart.
 *
 * The split is what makes "Dolo650" and "Pan40" match the same patterns as
 * "Dolo 650" and "Pan-40"; doctors type all three. Non-Latin script drops out
 * entirely, which is correct here — the extraction schema asks for drug names
 * in Latin script and preserves the brand as spoken.
 */
export function normaliseDrugText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

/** Canonical ingredients found in a drug name, in table order. */
export function identifyIngredients(drugText: string): IngredientId[] {
  const haystack = normaliseDrugText(drugText);
  if (!haystack) return [];

  return INGREDIENTS.filter((ingredient) =>
    ingredient.patterns.some((pattern) => pattern.test(haystack)),
  ).map((ingredient) => ingredient.id);
}

interface ResolvedLine {
  index: number;
  name: string;
  normalisedName: string;
  ingredients: IngredientId[];
  systemic: boolean;
  strength: string | null;
  frequencySpoken: string | null;
}

function resolve(medications: readonly PrescriptionLine[]): ResolvedLine[] {
  return medications.map((medication, index) => {
    const name = medication.drug_name?.trim() ?? "";
    const descriptor = normaliseDrugText(
      [name, medication.form ?? "", medication.route ?? ""].join(" "),
    );

    return {
      index,
      name,
      normalisedName: normaliseDrugText(name),
      ingredients: identifyIngredients(name),
      systemic: !NON_SYSTEMIC.test(descriptor),
      strength: medication.strength ?? null,
      frequencySpoken: medication.frequency_spoken ?? null,
    };
  });
}

function matches(selector: Selector, line: ResolvedLine): boolean {
  if (selector.kind === "ingredient") return line.ingredients.includes(selector.id);
  return line.ingredients.some((ingredient) =>
    CLASSES_BY_INGREDIENT.get(ingredient)?.includes(selector.id),
  );
}

/** Milligrams in one dose, or null when the strength cannot be read exactly. */
function parseDoseMg(strength: string | null): number | null {
  if (!strength) return null;
  const text = strength.toLowerCase().replace(/\s+/g, " ").trim();

  // "125 mg / 5 ml" says what is in the bottle, not what the patient swallows,
  // and a percentage says neither. Refuse rather than infer a spoonful.
  if (/[/%]|\bml\b|\bteaspoon\b|\btsp\b/.test(text)) return null;

  const match = text.match(/(\d+(?:\.\d+)?)\s*(mcg|µg|mg|gm|g)\b/);
  if (!match) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;

  if (match[2] === "g" || match[2] === "gm") return value * 1000;
  if (match[2] === "mcg" || match[2] === "µg") return value / 1000;
  return value;
}

function dosesPerDay(frequencySpoken: string | null): number | null {
  const { code } = normaliseFrequency(frequencySpoken);
  if (!code) return null;
  return DOSES_PER_DAY[code] ?? null;
}

/** "4.5 g" reads faster than "4500 mg" at the dose a doctor is checking. */
function formatMilligrams(milligrams: number): string {
  if (milligrams >= 1000) {
    return `${(milligrams / 1000).toFixed(2).replace(/\.?0+$/, "")} g`;
  }
  return `${Math.round(milligrams * 100) / 100} mg`;
}

function findPairWarnings(lines: readonly ResolvedLine[]): PrescriptionWarning[] {
  const warnings: PrescriptionWarning[] = [];

  for (let left = 0; left < lines.length; left += 1) {
    for (let right = left + 1; right < lines.length; right += 1) {
      const a = lines[left];
      const b = lines[right];
      if (!a.systemic || !b.systemic) continue;
      if (a.ingredients.length === 0 || b.ingredients.length === 0) continue;

      for (const rule of INTERACTION_RULES) {
        const hit =
          (matches(rule.left, a) && matches(rule.right, b)) ||
          (matches(rule.right, a) && matches(rule.left, b));
        if (!hit) continue;

        // The same product written twice — a morning line and an SOS line, say —
        // is not the hidden duplication this rule is about. The dose ceiling
        // below still totals it, which is the part that can actually harm.
        if (rule.kind === "duplicate" && a.normalisedName === b.normalisedName) continue;

        warnings.push({
          id: `${rule.id}:${a.index}:${b.index}`,
          kind: rule.kind,
          severity: rule.severity,
          medicationIndexes: [a.index, b.index],
          drugs: [a.name, b.name],
          headline: rule.headline,
          detail: rule.detail,
          action: rule.action,
        });
      }
    }
  }

  return warnings;
}

function findDoseWarnings(lines: readonly ResolvedLine[]): PrescriptionWarning[] {
  const warnings: PrescriptionWarning[] = [];

  for (const ceiling of DOSE_CEILINGS) {
    // A combination brand states one strength for several ingredients, so there
    // is no honest way to say how much of this one it carries. Those lines are
    // left out of the total, which can only ever make the total an
    // underestimate — the direction that under-warns rather than over-warns.
    const contributing = lines.filter(
      (line) =>
        line.systemic &&
        line.ingredients.length === 1 &&
        line.ingredients[0] === ceiling.ingredient,
    );

    let totalMg = 0;
    const indexes: number[] = [];
    const drugs: string[] = [];

    for (const line of contributing) {
      const perDose = parseDoseMg(line.strength);
      const perDay = dosesPerDay(line.frequencySpoken);
      if (perDose === null || perDay === null) continue;

      totalMg += perDose * perDay;
      indexes.push(line.index);
      drugs.push(line.name);
    }

    if (indexes.length === 0 || totalMg <= ceiling.maxDailyMg) continue;

    const total = formatMilligrams(totalMg);
    warnings.push({
      id: `dose:${ceiling.ingredient}`,
      kind: "dose",
      severity: ceiling.severity,
      medicationIndexes: indexes,
      drugs,
      headline: ceiling.headline,
      detail:
        indexes.length === 1
          ? `This comes to ${total} a day. ${ceiling.reason}`
          : `These come to ${total} a day between them. ${ceiling.reason}`,
      action: ceiling.action,
    });
  }

  return warnings;
}

/**
 * Every advisory this prescription raises, most serious first.
 *
 * Returns an empty array both when the prescription raises nothing and when it
 * contains nothing this table recognises. Those two are not distinguished on
 * purpose: the caller has no honest way to present the difference, and "no
 * warnings" must never be read as "checked and safe".
 */
export function findPrescriptionWarnings(
  medications: readonly PrescriptionLine[],
): PrescriptionWarning[] {
  const lines = resolve(medications);

  return [...findPairWarnings(lines), ...findDoseWarnings(lines)].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.medicationIndexes[0] - b.medicationIndexes[0] ||
      a.id.localeCompare(b.id),
  );
}

/**
 * One line for a screen reader. Deliberately a count and not the warnings
 * themselves — the panel is right there to be read, and reading every
 * mechanism aloud each time a drug name changes buries the count that matters.
 */
export function summariseWarnings(warnings: readonly PrescriptionWarning[]): string {
  if (warnings.length === 0) return "";

  const majors = warnings.filter((warning) => warning.severity === "major").length;
  const noun = warnings.length === 1 ? "warning" : "warnings";
  const suffix = majors > 0 ? `, ${majors} major` : "";
  return `${warnings.length} prescription ${noun} to check${suffix}.`;
}
