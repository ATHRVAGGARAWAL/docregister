import assert from "node:assert/strict";
import { test } from "node:test";

import {
  findPrescriptionWarnings,
  identifyIngredients,
  normaliseDrugText,
  summariseWarnings,
  type IngredientId,
  type PrescriptionLine,
} from "../../src/lib/clinical/interactions.ts";
import { INTERACTION_RULES } from "../../src/lib/clinical/interactions.data.ts";

/**
 * The interaction table is only worth having if it is quiet.
 *
 * A checker that fires on a lookalike name teaches the doctor to dismiss it,
 * and a dismissed checker is worse than none — so roughly half of what follows
 * asserts that nothing happens. Indian brand names collide hard at the front
 * (Dolo/Dolonex, Digene/digoxin, Ciplox/Ciplar, Levoflox/Levocet), and every
 * one of those collisions is a real prescription somebody could write.
 */

function med(drug_name: string, extra: Partial<PrescriptionLine> = {}): PrescriptionLine {
  return { drug_name, ...extra };
}

function headlines(medications: PrescriptionLine[]): string[] {
  return findPrescriptionWarnings(medications).map((warning) => warning.headline);
}

// ---- Normalisation --------------------------------------------------------

test("drug text normalises punctuation, case and glued digits alike", () => {
  assert.equal(normaliseDrugText("Pan-D"), "pan d");
  assert.equal(normaliseDrugText("DOLO-650"), "dolo 650");
  assert.equal(normaliseDrugText("dolo650"), "dolo 650");
  assert.equal(normaliseDrugText("  Zerodol   SP  "), "zerodol sp");
});

test("brand and generic names resolve to the same ingredient", () => {
  for (const spelling of ["Paracetamol", "Dolo 650", "Crocin", "Calpol", "PCM", "dolo650"]) {
    assert.deepEqual(
      identifyIngredients(spelling),
      ["paracetamol"],
      `${spelling} should be paracetamol`,
    );
  }
});

test("fixed-dose combination brands resolve to every ingredient they carry", () => {
  assert.deepEqual(identifyIngredients("Combiflam"), ["paracetamol", "ibuprofen"]);
  assert.deepEqual(identifyIngredients("Ultracet"), ["paracetamol", "tramadol"]);
  assert.deepEqual(identifyIngredients("Zerodol-P"), ["paracetamol", "aceclofenac"]);
  assert.deepEqual(identifyIngredients("Zerodol"), ["aceclofenac"]);
});

// ---- Near misses that must stay silent ------------------------------------

test("lookalike brand names do not resolve to their dangerous neighbour", () => {
  const nearMisses: [string, IngredientId][] = [
    ["Dolonex DT", "paracetamol"],
    ["Metrogyl 400", "metformin"],
    ["Digene", "digoxin"],
    ["Levocetirizine", "levofloxacin"],
    ["Levocet", "levothyroxine"],
    ["Nitrofurantoin 100", "nitroglycerin"],
    ["Septilin", "cotrimoxazole"],
    ["Ciplar 40", "ciprofloxacin"],
    ["Esomeprazole", "omeprazole"],
    ["Acivir 400", "acenocoumarol"],
    ["Telekast L", "telmisartan"],
    ["Gelusil", "sucralfate"],
  ];

  for (const [written, mustNotMatch] of nearMisses) {
    assert.equal(
      identifyIngredients(written).includes(mustNotMatch),
      false,
      `${written} must not resolve to ${mustNotMatch}`,
    );
  }
});

test("lookalikes still resolve to what they actually are", () => {
  assert.deepEqual(identifyIngredients("Dolonex DT"), ["piroxicam"]);
  assert.deepEqual(identifyIngredients("Metrogyl 400"), ["metronidazole"]);
  assert.deepEqual(identifyIngredients("Digene"), ["antacid"]);
  assert.deepEqual(identifyIngredients("Esomeprazole"), ["esomeprazole"]);
});

test("names outside the table resolve to nothing rather than a near match", () => {
  for (const unknown of ["Becosules", "Ciplar 40", "Septilin", "", "   "]) {
    assert.deepEqual(identifyIngredients(unknown), [], `${unknown} should resolve to nothing`);
  }
});

// ---- Interactions that must fire ------------------------------------------

test("an anticoagulant beside an NSAID raises a major bleeding warning", () => {
  const warnings = findPrescriptionWarnings([med("Warfarin 5 mg"), med("Combiflam")]);

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].headline, "Higher bleeding risk");
  assert.equal(warnings[0].severity, "major");
  assert.deepEqual(warnings[0].medicationIndexes, [0, 1]);
  assert.deepEqual(warnings[0].drugs, ["Warfarin 5 mg", "Combiflam"]);
});

test("the anticoagulant rule is on the class, not on warfarin alone", () => {
  assert.deepEqual(headlines([med("Acitrom 2"), med("Zerodol SP")]), ["Higher bleeding risk"]);
});

test("order of the two lines does not change the finding", () => {
  assert.deepEqual(
    headlines([med("Combiflam"), med("Warfarin 5 mg")]),
    headlines([med("Warfarin 5 mg"), med("Combiflam")]),
  );
});

test("CYP2C9 inhibitors are flagged against an anticoagulant", () => {
  for (const antimicrobial of ["Fluconazole 150", "Metrogyl 400", "Septran DS"]) {
    assert.deepEqual(
      headlines([med("Acitrom 2"), med(antimicrobial)]),
      ["INR may climb"],
      `${antimicrobial} should raise an INR warning`,
    );
  }
});

test("clopidogrel is flagged with omeprazole but not with pantoprazole", () => {
  assert.deepEqual(headlines([med("Clopilet 75"), med("Omez 20")]), [
    "Clopidogrel may be weakened",
  ]);
  assert.deepEqual(headlines([med("Clopilet 75"), med("Pan-D")]), []);
});

test("the statin rule separates CYP3A4 macrolides from the rest", () => {
  assert.deepEqual(headlines([med("Atorva 10"), med("Claribid 500")]), ["Muscle injury risk"]);
  assert.deepEqual(headlines([med("Atorva 10"), med("Azithral 500")]), []);
  assert.deepEqual(headlines([med("Rosuvas 10"), med("Claribid 500")]), []);
});

test("polyvalent cations are flagged against a fluoroquinolone and thyroxine", () => {
  assert.deepEqual(headlines([med("Ciplox 500"), med("Shelcal 500")]), [
    "Antibiotic may not absorb",
  ]);
  assert.deepEqual(headlines([med("Thyronorm 50 mcg"), med("Shelcal 500")]), [
    "Thyroxine may not absorb",
  ]);
  assert.deepEqual(headlines([med("Ciplox 500"), med("Dolo 650")]), []);
});

test("theophylline is flagged with ciprofloxacin but not with levofloxacin", () => {
  assert.deepEqual(headlines([med("Deriphyllin"), med("Ciplox 500")]), ["Theophylline may rise"]);
  assert.deepEqual(headlines([med("Deriphyllin"), med("Levoflox 500")]), []);
});

test("the renal and potassium pairs of cardiac prescribing are flagged", () => {
  assert.deepEqual(headlines([med("Telma 40"), med("Zerodol 100")]), ["Kidney and BP effect"]);
  assert.deepEqual(headlines([med("Telma 40"), med("Aldactone 25")]), ["Potassium may rise"]);
  assert.deepEqual(headlines([med("Digoxin 0.25 mg"), med("Lasix 40")]), [
    "Digoxin toxicity risk",
  ]);
  assert.deepEqual(headlines([med("Telekast L"), med("Zerodol 100")]), []);
});

test("a nitrate beside a PDE5 inhibitor is major", () => {
  const warnings = findPrescriptionWarnings([med("Sorbitrate 5"), med("Sildenafil 50")]);
  assert.equal(warnings[0].headline, "Severe hypotension");
  assert.equal(warnings[0].severity, "major");
  assert.deepEqual(headlines([med("Nitrofurantoin 100"), med("Sildenafil 50")]), []);
});

test("methotrexate is flagged against both NSAIDs and co-trimoxazole", () => {
  assert.deepEqual(headlines([med("Folitrax 10"), med("Zerodol 100")]), [
    "Methotrexate may accumulate",
  ]);
  assert.deepEqual(headlines([med("Folitrax 10"), med("Septran DS")]), [
    "Marrow suppression risk",
  ]);
});

test("tramadol is flagged against an SSRI", () => {
  assert.deepEqual(headlines([med("Tramazac 50"), med("Nexito 10")]), [
    "Serotonin and seizure risk",
  ]);
});

// ---- Duplication ----------------------------------------------------------

test("paracetamol hidden in a combination brand is flagged against a plain one", () => {
  assert.deepEqual(headlines([med("Dolo 650"), med("Combiflam")]), [
    "Paracetamol in two products",
  ]);
});

test("two NSAIDs raise a duplication warning alongside any hidden paracetamol", () => {
  assert.deepEqual(headlines([med("Combiflam"), med("Zerodol SP")]).sort(), [
    "Paracetamol in two products",
    "Two NSAIDs together",
  ]);
});

test("the same product written on two lines is not a duplication", () => {
  assert.deepEqual(
    headlines([
      med("Dolo 650", { frequency_spoken: "BD" }),
      med("Dolo 650", { frequency_spoken: "SOS" }),
    ]),
    [],
  );
});

test("one combination line never warns against itself", () => {
  assert.deepEqual(headlines([med("Ultracet")]), []);
  assert.deepEqual(headlines([med("Combiflam")]), []);
});

// ---- Route and form guards ------------------------------------------------

test("a topical NSAID is not treated as systemic exposure", () => {
  assert.deepEqual(headlines([med("Warfarin 5 mg"), med("Diclofenac", { form: "ointment" })]), []);
  assert.deepEqual(headlines([med("Warfarin 5 mg"), med("Diclofenac", { route: "topical" })]), []);
  assert.deepEqual(headlines([med("Warfarin 5 mg"), med("Diclofenac 50", { form: "tablet" })]), [
    "Higher bleeding risk",
  ]);
});

// ---- Dose ceilings --------------------------------------------------------

test("paracetamol is totalled across lines and flagged only above 4 g", () => {
  assert.deepEqual(headlines([med("Dolo 650", { strength: "650 mg", frequency_spoken: "TDS" })]), []);
  assert.deepEqual(
    headlines([med("Paracetamol", { strength: "1 g", frequency_spoken: "QID" })]),
    [],
    "exactly 4 g a day is the ceiling, not above it",
  );

  const warnings = findPrescriptionWarnings([
    med("Dolo 650", { strength: "650 mg", frequency_spoken: "QID" }),
    med("Paracetamol", { strength: "500 mg", frequency_spoken: "TDS" }),
  ]);
  const dose = warnings.find((warning) => warning.kind === "dose");
  assert.ok(dose, "the running total should be flagged");
  assert.equal(dose.severity, "major");
  assert.match(dose.detail, /4\.1 g a day between them/);
  assert.deepEqual(dose.medicationIndexes, [0, 1]);
});

test("tramadol has its own ceiling", () => {
  assert.deepEqual(
    headlines([med("Tramadol", { strength: "100 mg", frequency_spoken: "QID" })]),
    [],
  );
  assert.deepEqual(
    headlines([med("Tramadol", { strength: "150 mg", frequency_spoken: "QID" })]),
    ["Above the daily tramadol ceiling"],
  );
});

test("a dose that cannot be read exactly is passed over rather than guessed", () => {
  const unreadable: PrescriptionLine[] = [
    med("Paracetamol", { strength: "125 mg/5 ml", frequency_spoken: "QID" }),
    med("Paracetamol", { strength: "10 ml", frequency_spoken: "QID" }),
    med("Paracetamol", { strength: null, frequency_spoken: "QID" }),
    med("Paracetamol", { strength: "1 g", frequency_spoken: "SOS" }),
    med("Paracetamol", { strength: "1 g", frequency_spoken: null }),
    med("Paracetamol", { strength: "1 g", frequency_spoken: "twice a dya" }),
  ];

  for (const line of unreadable) {
    assert.deepEqual(
      headlines([line]),
      [],
      `${line.strength} ${line.frequency_spoken} should not produce a dose warning`,
    );
  }
});

test("a combination brand contributes to no dose total", () => {
  // Combiflam's "400 mg" is its ibuprofen, and nothing on the line says how
  // much paracetamol rides along with it.
  assert.deepEqual(
    headlines([
      med("Combiflam", { strength: "400 mg", frequency_spoken: "QID" }),
      med("Combiflam", { strength: "400 mg", frequency_spoken: "QID" }),
    ]),
    [],
  );
});

test("grams and milligrams are read to the same scale", () => {
  assert.deepEqual(
    headlines([med("Paracetamol", { strength: "1.5 g", frequency_spoken: "TDS" })]),
    ["Above the daily paracetamol ceiling"],
  );
});

// ---- Result shape ---------------------------------------------------------

test("an empty or unrecognised prescription produces nothing", () => {
  assert.deepEqual(findPrescriptionWarnings([]), []);
  assert.deepEqual(findPrescriptionWarnings([med("Becosules"), med("")]), []);
});

test("major findings sort ahead of moderate ones", () => {
  const warnings = findPrescriptionWarnings([
    med("Ciplox 500"),
    med("Shelcal 500"),
    med("Warfarin 5 mg"),
    med("Combiflam"),
  ]);

  assert.deepEqual(
    warnings.map((warning) => warning.severity),
    ["major", "moderate"],
  );
});

test("every warning in a result carries a distinct key", () => {
  const warnings = findPrescriptionWarnings([
    med("Warfarin 5 mg"),
    med("Combiflam"),
    med("Zerodol SP"),
    med("Dolo 650", { strength: "1 g", frequency_spoken: "QID" }),
  ]);

  const ids = warnings.map((warning) => warning.id);
  assert.equal(new Set(ids).size, ids.length, `duplicate keys in ${ids.join(", ")}`);
});

test("rule ids are unique so a finding traces back to one rule", () => {
  const ids = INTERACTION_RULES.map((rule) => rule.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("every rule carries copy the doctor can act on", () => {
  for (const rule of INTERACTION_RULES) {
    assert.ok(rule.headline.length > 0 && rule.headline.length <= 40, `headline: ${rule.id}`);
    assert.ok(rule.detail.length > 0, `detail: ${rule.id}`);
    assert.ok(rule.action.length > 0, `action: ${rule.id}`);
  }
});

test("the spoken summary counts warnings without reciting them", () => {
  assert.equal(summariseWarnings([]), "");
  assert.equal(
    summariseWarnings(findPrescriptionWarnings([med("Ciplox 500"), med("Shelcal 500")])),
    "1 prescription warning to check.",
  );
  assert.equal(
    summariseWarnings(
      findPrescriptionWarnings([med("Warfarin 5 mg"), med("Combiflam"), med("Shelcal 500")]),
    ),
    "1 prescription warning to check, 1 major.",
  );
});
