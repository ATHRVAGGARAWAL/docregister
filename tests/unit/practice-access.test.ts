import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = process.cwd();

const migration = readFileSync(
  join(ROOT, "supabase/migrations/0035_practice_access_controls.sql"),
  "utf8",
);

test("practice access distinguishes reads from writes and preserves owner authority", () => {
  assert.match(migration, /when p_write is true then/);
  assert.match(migration, /d\.role = 'owner' or is_platform_admin\(\)/);
  assert.match(migration, /d\.membership_status = 'active'/);
  assert.match(migration, /else false/g, "unknown practice areas must fail closed");

  // Representative least-privilege boundaries. The migration validator runs
  // the SQL; these assertions make an accidental matrix broadening visible in
  // the normal unit suite too.
  assert.match(
    migration,
    /when 'clinical' then role in \(\s*'owner', 'dentist', 'hygienist'\s*\)/,
  );
  assert.match(
    migration,
    /when 'treatment' then role in \(\s*'owner', 'dentist'\s*\)/,
  );
  assert.match(
    migration,
    /when 'inventory' then role in \(\s*'owner', 'assistant', 'stock_manager'\s*\)/,
  );
  assert.match(
    migration,
    /when 'finance' then role in \(\s*'owner', 'receptionist', 'accountant'\s*\)/,
  );
});

test("authenticated chart writes can evaluate FDI constraints without exposing the helper", () => {
  assert.match(
    migration,
    /revoke execute on function is_fdi_tooth\(smallint\) from public, anon;/,
  );
  assert.match(
    migration,
    /grant execute on function is_fdi_tooth\(smallint\) to authenticated;/,
  );
});

const policies = [
  ["operatories", "schedule", "settings"],
  ["appointments", "schedule", "schedule"],
  ["patient_alerts", "clinical", "clinical"],
  ["patient_medical_history", "clinical", "clinical"],
  ["tooth_findings", "clinical", "clinical"],
  ["periodontal_measurements", "clinical", "clinical"],
  ["imaging_links", "clinical", "clinical"],
  ["treatment_plans", "treatment", "treatment"],
  ["treatment_plan_items", "treatment", "treatment"],
  ["patient_specialty_records", "clinical", "clinical"],
  ["consent_records", "clinical", "clinical"],
  ["lab_cases", "lab", "lab"],
  ["inventory_items", "inventory", "inventory"],
  ["inventory_batches", "inventory", "inventory"],
  ["estimates", "finance", "finance"],
  ["estimate_items", "finance", "finance"],
  ["invoices", "finance", "finance"],
  ["invoice_items", "finance", "finance"],
  ["payments", "finance", "finance"],
  ["refunds", "finance", "finance"],
] as const;

test("practice tables keep read policies separate and require write access for mutations", () => {
  for (const [table, readArea, writeArea] of policies) {
    const readStart = migration.indexOf(`create policy ${table}_read on ${table}`);
    const writeStart = migration.indexOf(`create policy ${table}_write on ${table}`);
    const nextPolicy = migration.indexOf("\ndrop policy", writeStart);

    assert.notEqual(readStart, -1, `${table}: missing read policy`);
    assert.notEqual(writeStart, -1, `${table}: missing write policy`);
    assert.ok(readStart < writeStart, `${table}: read policy should be separate from writes`);

    const readBlock = migration.slice(readStart, writeStart);
    const writeBlock = migration.slice(
      writeStart,
      nextPolicy === -1 ? migration.length : nextPolicy,
    );

    assert.match(readBlock, /for select to authenticated/);
    assert.match(readBlock, new RegExp(`has_practice_access\\('${readArea}', false\\)`));

    assert.match(writeBlock, /for all to authenticated/);
    assert.doesNotMatch(writeBlock, /has_practice_access\('[^']+', false\)/);
    assert.equal(
      writeBlock.match(new RegExp(`has_practice_access\\('${writeArea}', true\\)`, "g"))?.length,
      2,
      `${table}: USING and WITH CHECK must both require write access`,
    );
  }
});

test("inventory movements are an append-only authenticated ledger", () => {
  assert.match(
    migration,
    /create policy inventory_movements_read on inventory_movements for select to authenticated/,
  );
  assert.match(
    migration,
    /create policy inventory_movements_insert on inventory_movements for insert to authenticated/,
  );
  assert.doesNotMatch(
    migration,
    /create policy inventory_movements_(?:write|update|delete)/,
  );
  assert.match(
    migration,
    /revoke update, delete on inventory_movements from authenticated;/,
  );
  assert.match(
    migration,
    /grant select, insert on inventory_movements to authenticated;/,
  );
});

test("patient summary and clinical chart reads are fail-closed audited", () => {
  for (const [file, surface] of [
    ["src/app/api/patients/[id]/route.ts", "patient_summary"],
    ["src/app/api/patients/[id]/clinical/route.ts", "clinical_chart"],
  ] as const) {
    const source = readFileSync(join(ROOT, file), "utf8");
    assert.match(source, /callWorkflow<null>\(supabase, "log_sensitive_access"/);
    assert.match(source, /p_action: "read"/);
    assert.match(source, /p_entity: "patient"/);
    assert.match(source, /p_entity_id: params\.id/);
    assert.match(source, new RegExp(`p_detail: \\{ surface: "${surface}" \\}`));
    assert.match(source, /if \(auditError\) \{/);
  }
});
