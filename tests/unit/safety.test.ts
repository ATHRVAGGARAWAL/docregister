import assert from "node:assert/strict";
import { test } from "node:test";

import {
  criticalAlerts,
  findSafetyIssues,
  type MedicalHistoryRecord,
  type PatientAlertRecord,
} from "../../src/lib/clinical/safety.ts";

/**
 * These rules decide whether a dentist is told that the antibiotic they just
 * prescribed is the one this patient is allergic to. The tests are therefore
 * about two things in equal measure: that a real risk fires, and that nothing
 * fires when it should not — because a panel that cries wolf is a panel that
 * gets scrolled past, and this one is competing for attention with a patient
 * in the chair.
 */

const drug = (drug_name: string) => ({ drug_name });
const proc = (procedure_name: string, tooth_fdi: number | null = null) => ({ procedure_name, tooth_fdi });
const alert = (o: Partial<PatientAlertRecord>): PatientAlertRecord => ({
  kind: "medical", label: "", severity: "important", is_active: true, ...o,
});
const hist = (o: Partial<MedicalHistoryRecord>): MedicalHistoryRecord => ({
  category: "condition", name: "", status: "active", ...o,
});

/* -------------------------------------------------------------------------
 * Penicillin allergy
 * ---------------------------------------------------------------------- */

test("co-amoxiclav prescribed to a penicillin-allergic patient is contraindicated", () => {
  const [finding] = findSafetyIssues({
    alerts: [alert({ kind: "allergy", label: "Penicillin allergy", severity: "critical" })],
    prescription: [drug("Augmentin 625")],
  });
  assert.equal(finding.id, "penicillin-allergy");
  assert.equal(finding.severity, "contraindicated");
  assert.match(finding.detail, /Clindamycin|azithromycin|metronidazole/);
  assert.equal(finding.trigger, "Penicillin allergy", "the recorded fact is quoted back");
});

test("the allergy is caught from history as well as from an alert", () => {
  const found = findSafetyIssues({
    medicalHistory: [hist({ category: "allergy", name: "Penicillin", detail: "Rash" })],
    prescription: [drug("Amoxicillin 500")],
  });
  assert.equal(found.length, 1);
});

test("a non-penicillin antibiotic does not fire the allergy rule", () => {
  // Metronidazole and azithromycin are exactly what a dentist reaches for
  // instead. Warning about them would train the dentist to ignore the panel.
  for (const safe of ["Metrogyl 400", "Azithromycin 500", "Clindamycin 300"]) {
    assert.deepEqual(
      findSafetyIssues({
        alerts: [alert({ kind: "allergy", label: "Penicillin allergy", severity: "critical" })],
        prescription: [drug(safe)],
      }),
      [],
      `${safe} must not fire`,
    );
  }
});

test("a resolved allergy is history, not a live risk", () => {
  assert.deepEqual(
    findSafetyIssues({
      medicalHistory: [hist({ category: "allergy", name: "Penicillin", status: "resolved" })],
      prescription: [drug("Augmentin 625")],
    }),
    [],
  );
});

test("an inactive alert does not fire", () => {
  assert.deepEqual(
    findSafetyIssues({
      alerts: [alert({ kind: "allergy", label: "Penicillin allergy", is_active: false })],
      prescription: [drug("Augmentin 625")],
    }),
    [],
  );
});

/* -------------------------------------------------------------------------
 * MRONJ
 * ---------------------------------------------------------------------- */

test("extraction on an antiresorptive raises MRONJ", () => {
  const [finding] = findSafetyIssues({
    alerts: [alert({ kind: "medication", label: "Bisphosphonates (oral, 4 yrs)", severity: "critical" })],
    procedures: [proc("Extraction — simple", 46)],
  });
  assert.equal(finding.id, "mronj-risk");
  assert.match(finding.source, /AAOMS/);
  assert.match(finding.headline, /46|Extraction/);
});

test("denosumab counts as an antiresorptive", () => {
  const found = findSafetyIssues({
    medicalHistory: [hist({ category: "medication", name: "Denosumab (Prolia)" })],
    procedures: [proc("Extraction — surgical", 38)],
  });
  assert.equal(found.length, 1);
  assert.equal(found[0].id, "mronj-risk");
});

test("an antiresorptive with no extraction says nothing", () => {
  // The drug alone is not a finding. It is on the alert banner, where it
  // belongs; a warning on every scaling would be noise.
  assert.deepEqual(
    findSafetyIssues({
      alerts: [alert({ kind: "medication", label: "Alendronate" })],
      procedures: [proc("Scaling and polishing"), proc("Composite restoration", 26)],
    }),
    [],
  );
});

/* -------------------------------------------------------------------------
 * Anticoagulation
 * ---------------------------------------------------------------------- */

test("extraction while anticoagulated tells the dentist NOT to stop the drug", () => {
  // The whole value of this rule. The instinctive response is to interrupt the
  // anticoagulant, and interrupting it causes thromboembolism — a worse outcome
  // than a socket that oozes. A rule that only said "bleeding risk" would push
  // toward the more dangerous choice.
  const [finding] = findSafetyIssues({
    alerts: [alert({ kind: "medication", label: "On warfarin", severity: "critical" })],
    procedures: [proc("Extraction — simple", 48)],
  });
  assert.equal(finding.id, "anticoagulant-extraction");
  assert.match(finding.detail, /Do not interrupt/);
  assert.match(finding.detail, /INR/);
  assert.match(finding.source, /SDCEP/);
});

test("a DOAC counts, and its advice does not mention an INR to check", () => {
  const [finding] = findSafetyIssues({
    medicalHistory: [hist({ category: "medication", name: "Apixaban 5mg" })],
    procedures: [proc("Extraction — third molar", 38)],
  });
  assert.equal(finding.id, "anticoagulant-extraction");
  // The INR sentence is scoped to warfarin in the wording, so a DOAC patient
  // is not sent for a test that does not exist for them.
  assert.match(finding.detail, /where the patient is on warfarin/);
});

test("a filling on an anticoagulated patient is not an extraction", () => {
  assert.deepEqual(
    findSafetyIssues({
      alerts: [alert({ kind: "medication", label: "On warfarin" })],
      procedures: [proc("Composite restoration", 26), proc("Root canal — molar", 36)],
    }),
    [],
  );
});

/* -------------------------------------------------------------------------
 * Pregnancy
 * ---------------------------------------------------------------------- */

test("an NSAID in pregnancy is flagged, and paracetamol is not", () => {
  const [finding] = findSafetyIssues({
    alerts: [alert({ kind: "pregnancy", label: "Pregnant, 2nd trimester" })],
    prescription: [drug("Brufen 400")],
  });
  assert.equal(finding.id, "nsaid-pregnancy");
  assert.match(finding.source, /FDA/);

  assert.deepEqual(
    findSafetyIssues({
      alerts: [alert({ kind: "pregnancy", label: "Pregnant, 2nd trimester" })],
      prescription: [drug("Dolo 650")],
    }),
    [],
    "paracetamol is the alternative this rule points at — it must not fire",
  );
});

test("pregnancy does not warn about radiographs", () => {
  // Deliberately absent, and documented at the top of safety.ts: dental
  // radiography with shielding is below the threshold of concern, and both the
  // ADA and FDA say a clinically necessary film should not be postponed. A
  // "defer" warning would delay diagnosis for no benefit.
  assert.deepEqual(
    findSafetyIssues({
      alerts: [alert({ kind: "pregnancy", label: "Pregnant, 2nd trimester" })],
      procedures: [proc("X-ray — IOPA", 36), proc("X-ray — OPG")],
    }),
    [],
  );
});

/* -------------------------------------------------------------------------
 * Shape
 * ---------------------------------------------------------------------- */

test("a clear record raises nothing at all", () => {
  assert.deepEqual(findSafetyIssues({}), []);
  assert.deepEqual(
    findSafetyIssues({
      alerts: [alert({ kind: "medical", label: "Asthma", severity: "info" })],
      prescription: [drug("Augmentin 625")],
      procedures: [proc("Extraction — simple", 48)],
    }),
    [],
  );
});

test("several risks come back most severe first", () => {
  const found = findSafetyIssues({
    alerts: [
      alert({ kind: "allergy", label: "Penicillin allergy", severity: "critical" }),
      alert({ kind: "medication", label: "On warfarin", severity: "critical" }),
    ],
    prescription: [drug("Augmentin 625")],
    procedures: [proc("Extraction — simple", 48)],
  });
  assert.deepEqual(found.map((f) => f.severity), ["contraindicated", "major"]);
});

test("every finding carries a source", () => {
  // The rule the whole file exists under. A finding without a citation is the
  // thing that got 822 lines deleted.
  const found = findSafetyIssues({
    alerts: [
      alert({ kind: "allergy", label: "Penicillin allergy" }),
      alert({ kind: "medication", label: "Bisphosphonates" }),
      alert({ kind: "medication", label: "Warfarin" }),
      alert({ kind: "pregnancy", label: "Pregnant" }),
    ],
    prescription: [drug("Augmentin 625"), drug("Brufen 400")],
    procedures: [proc("Extraction — simple", 48)],
  });
  assert.equal(found.length, 4, "all four rules fire");
  for (const finding of found) {
    assert.ok(finding.source.trim().length > 10, `${finding.id} has no source`);
    assert.ok(finding.trigger.trim().length > 0, `${finding.id} does not say what raised it`);
  }
});

test("critical and important alerts surface; informational ones do not", () => {
  const shown = criticalAlerts([
    alert({ label: "Penicillin allergy", severity: "critical" }),
    alert({ label: "Diabetic", severity: "important" }),
    alert({ label: "Prefers morning appointments", severity: "info" }),
    alert({ label: "Old note", severity: "critical", is_active: false }),
  ]);
  assert.deepEqual(shown.map((a) => a.label), ["Penicillin allergy", "Diabetic"]);
});
