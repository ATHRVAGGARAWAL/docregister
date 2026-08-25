import assert from "node:assert/strict";
import { test } from "node:test";

import { escapeHtml, renderPrescriptionHtml, renderReceiptHtml } from "../../src/lib/outputs/print-html.ts";

const payload = {
  encounter: {
    id: "11111111-1111-4111-8111-111111111111",
    status: "committed" as const,
    occurred_at: "2026-08-24T14:05:00Z",
    patient_id: "22222222-2222-4222-8222-222222222222",
    patient: { id: "22222222-2222-4222-8222-222222222222", full_name: "Asha <script>", phone: null, age_years: 42, sex: "female" },
    clinician: { id: "33333333-3333-4333-8333-333333333333", full_name: "Dr. Rao & Co", speciality: "General medicine" },
    patient_name_spoken: "Asha",
    age_years: 42,
    diagnosis: "Fever & cough",
    treatment: "Rest",
    fees_inr: 600,
    visit_number: 2,
    is_new_patient: false,
    prescription: [],
    transcript: null,
    effective: {
      patient_name_spoken: "Asha",
      age_years: 42,
      diagnosis: "Fever & cough",
      treatment: "Rest",
      fees_inr: 600,
      prescription: [{
        id: "44444444-4444-4444-8444-444444444444",
        drug_name: "Amox <bad>",
        strength: "500 mg",
        form: "tab",
        frequency_spoken: "1-0-1",
        frequency_label: "Twice daily",
        duration: "5 days",
        route: null,
        instructions: "After meals & water",
        position: 0,
      }],
    },
  },
  amendments: [],
};

test("print HTML escapes clinical values", () => {
  assert.equal(escapeHtml("<Asha> & \"x\""), "&lt;Asha&gt; &amp; &quot;x&quot;");
  const html = renderPrescriptionHtml(payload);
  assert.match(html, /Asha &lt;script&gt;/);
  assert.match(html, /Amox &lt;bad&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test("print outputs include the browser print control and receipt amount", () => {
  assert.match(renderPrescriptionHtml(payload), /window\.print\(\)/);
  assert.match(renderReceiptHtml(payload), /₹600\.00/);
  assert.match(renderReceiptHtml(payload), /Cache-Control|Visit receipt/);
});
