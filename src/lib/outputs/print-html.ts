import type { VisitDetailsPayload, VisitPrescriptionItem } from "../types";

/** Escape every value that crosses from a clinical record into an HTML document. */
export function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatPrintDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Date not recorded";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function shell(title: string, body: string, filename: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { color: #1d1d1f; margin: 0; background: #fff; }
    main { width: min(760px, calc(100% - 32px)); margin: 32px auto; padding: 32px; background: #fff; border: 1px solid #d2d2d7; border-radius: 14px; }
    header { border-bottom: 1px solid #1d1d1f; padding-bottom: 18px; margin-bottom: 22px; }
    .brand { display: flex; align-items: center; gap: 10px; }
    .mark { width: 32px; height: 32px; padding: 5px; border-radius: 8px; color: #fff; background: #1d1d1f; }
    h1 { margin: 0; font-size: 24px; letter-spacing: -.02em; }
    h2 { font-size: 15px; margin: 24px 0 8px; }
    p { margin: 5px 0; line-height: 1.45; }
    .muted { color: #6e6e73; font-size: 12px; }
    .row { display: flex; justify-content: space-between; gap: 24px; }
    .rule { border-top: 1px solid #d2d2d7; margin: 20px 0; }
    table { border-collapse: collapse; width: 100%; font-size: 13px; }
    th, td { border-bottom: 1px solid #d2d2d7; padding: 9px 6px; text-align: left; vertical-align: top; }
    th { color: #6e6e73; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
    td:last-child, th:last-child { text-align: right; }
    .toolbar { display: flex; justify-content: flex-end; gap: 8px; margin: 0 auto 14px; width: min(760px, calc(100% - 32px)); }
    button { min-height: 40px; border: 1px solid #0071e3; background: #0071e3; color: #fff; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-weight: 600; }
    @media print {
      body { background: #fff; }
      main { width: auto; margin: 0; padding: 0; border: 0; }
      .toolbar { display: none; }
      @page { margin: 14mm; }
    }
  </style>
</head>
<body>
  <div class="toolbar"><button type="button" onclick="window.print()">Print</button></div>
  <main data-output-file="${escapeHtml(filename)}">${body}</main>
</body>
</html>`;
}

function header(payload: VisitDetailsPayload, heading: string): string {
  const encounter = payload.encounter;
  const patient = encounter.patient;
  const clinician = encounter.clinician;
  return `<header>
    <div class="row">
      <div class="brand"><svg class="mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5v4h4"/><path d="M3 13h4l1.6-3 2.3 6 2-4 1.8 2.6 1.7-3.1L18 13h3"/></svg><div><h1>${escapeHtml(heading)}</h1><p class="muted">docregister · clinical record</p></div></div>
      <div style="text-align:right"><p><strong>${escapeHtml(clinician?.full_name || "Clinic doctor")}</strong></p><p class="muted">${escapeHtml(clinician?.speciality || "")}</p></div>
    </div>
    <div class="rule"></div>
    <div class="row"><div><p><strong>Patient</strong></p><p>${escapeHtml(patient?.full_name || encounter.patient_name_spoken || "Patient")}</p><p class="muted">${patient?.age_years == null ? "Age not recorded" : `Age ${escapeHtml(patient.age_years)}`}${patient?.sex ? ` · ${escapeHtml(patient.sex)}` : ""}</p></div><div style="text-align:right"><p><strong>Visit</strong></p><p>${escapeHtml(formatPrintDate(encounter.occurred_at))}</p><p class="muted">${encounter.visit_number == null ? "" : `Visit ${escapeHtml(encounter.visit_number)}`}</p></div></div>
  </header>`;
}

function medicationDetail(item: VisitPrescriptionItem): string {
  return [item.form, item.frequency_label || item.frequency_spoken, item.duration, item.route, item.instructions]
    .filter(Boolean)
    .map((value) => escapeHtml(value))
    .join(" · ") || "Instructions not recorded";
}

function prescriptionRows(items: VisitPrescriptionItem[]): string {
  if (items.length === 0) return `<tr><td colspan="3" class="muted">No medicines recorded.</td></tr>`;
  return items
    .map((item, index) => `<tr><td>${escapeHtml(index + 1)}</td><td><strong>${escapeHtml(item.drug_name)}${item.strength ? ` · ${escapeHtml(item.strength)}` : ""}</strong><br><span class="muted">${medicationDetail(item)}</span></td><td></td></tr>`)
    .join("");
}

export function renderPrescriptionHtml(payload: VisitDetailsPayload): string {
  const { encounter } = payload;
  const body = `${header(payload, "Prescription")}<section><h2>Prescription</h2><table><thead><tr><th>#</th><th>Medicine and instructions</th><th></th></tr></thead><tbody>${prescriptionRows(encounter.effective.prescription)}</tbody></table></section>${encounter.effective.diagnosis ? `<section><h2>Diagnosis</h2><p>${escapeHtml(encounter.effective.diagnosis)}</p></section>` : ""}${encounter.effective.treatment ? `<section><h2>Treatment notes</h2><p>${escapeHtml(encounter.effective.treatment)}</p></section>` : ""}<p class="muted" style="margin-top:32px">Printed from the signed register on ${escapeHtml(formatPrintDate(new Date().toISOString()))}. Verify instructions with the clinician.</p>`;
  return shell("Prescription", body, `prescription-${encounter.id}.html`);
}
