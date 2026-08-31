import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const route = readFileSync("src/app/api/patients/[id]/consents/route.ts", "utf8");
const workspace = readFileSync("src/components/practice/patient-workspace.tsx", "utf8");

test("patient consent reads are clinic-scoped and audited", () => {
  assert.match(route, /withDoctor<\{ id: string \}>/);
  assert.match(route, /\.eq\("clinic_id", doctor\.clinic_id\)/);
  assert.match(route, /log_sensitive_access/);
  assert.match(route, /surface: "patient_consents"/);
});

test("new consent records are immutable wording snapshots created as drafts", () => {
  assert.match(route, /content_snapshot: contentSnapshot/);
  assert.match(route, /status: "draft"/);
  assert.match(route, /created_by: doctor\.id/);
});

test("the patient workspace exposes the consent workflow", () => {
  assert.match(workspace, /PatientConsentsPanel/);
  assert.doesNotMatch(workspace, /Versioned consent snapshots are available in the new schema/);
});
