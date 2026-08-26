import type { PatientSex } from "../encounters/review.ts";
import { formatINR } from "../format.ts";
import type { VisitPrescriptionItem } from "../types.ts";

/**
 * The prescription a doctor hands to a patient.
 *
 * A printed prescription leaves this system permanently: it is carried to a
 * pharmacy counter, photographed, and read by people who will never see the
 * register it came from. So this module is a pure string builder with no
 * Supabase client and no `server-only` — the escaping and the pagination are
 * the parts that are easy to get wrong and impossible to notice afterwards,
 * and both are directly unit tested.
 *
 * Every value that reaches the document is escaped. A patient name, a diagnosis
 * and a drug instruction are all free text typed or dictated by a person: in a
 * multi-doctor clinic the doctor printing may not be the doctor who entered it,
 * and `<img src=x onerror=...>` in a name field would otherwise become live
 * markup in a document the browser is about to render.
 *
 * The relative `.ts` import specifiers match `src/lib/encounters/review.ts` and
 * keep this module loadable by `node --test`'s type-stripping loader, which
 * resolves no `@/` alias.
 */

export type PrescriptionPaper = "a4" | "a5";

/** One line of the Rx table. */
export interface PrescriptionDrug {
  name: string;
  strength: string | null;
  form: string | null;
  frequency: string | null;
  duration: string | null;
  /** PO, IV, topical. Dropping it from a printed sheet is a clinical error. */
  route: string | null;
  instructions: string | null;
}

export interface PrescriptionSheetData {
  clinic: { name: string; city: string | null };
  doctor: { fullName: string; registrationNo: string | null; speciality: string | null };
  patient: { name: string; ageYears: number | null; sex: PatientSex | string | null };
  /** Timestamp of the visit, as stored. Rendered in the clinic's timezone. */
  occurredAt: string;
  diagnosis: string | null;
  /** The clinical narrative — rest, fluids, warning signs. Not a drug. */
  advice: string | null;
  drugs: PrescriptionDrug[];
  /** Rupees. `null` means no fee was recorded, which is not the same as zero. */
  feeInr: number | null;
  /** ISO date or timestamp for the review visit, when one was agreed. */
  followUpOn: string | null;
}

export interface PrescriptionPaperSpec {
  label: string;
  /** The `size` keyword for the `@page` rule. */
  cssSize: string;
  widthMm: number;
  heightMm: number;
  marginMm: number;
  /**
   * Vertical budget reserved on every sheet for the blocks that repeat: the
   * masthead, the patient strip, the diagnosis, the table head, the advice
   * block and the signature. Held to by `min-height` declarations in the
   * stylesheet, so `slotsPerSheet` below is arithmetic over the same numbers
   * the layout uses rather than a figure typed in from a trial print.
   */
  reservedMm: number;
  /** Base font size, in points. */
  fontPt: number;
  /** How many slots of drug table fit before a new sheet has to start. */
  slotsPerSheet: number;
}

/** The height one line of the Rx table is laid out to occupy. */
const SLOT_MM = 8;

const PAPER_GEOMETRY = {
  a4: { label: "A4", cssSize: "A4", widthMm: 210, heightMm: 297, marginMm: 14, reservedMm: 116, fontPt: 10.5 },
  a5: { label: "A5", cssSize: "A5", widthMm: 148, heightMm: 210, marginMm: 10, reservedMm: 100, fontPt: 9.5 },
} as const;

function slotsPerSheet(paper: PrescriptionPaper): number {
  const spec = PAPER_GEOMETRY[paper];
  const printable = spec.heightMm - 2 * spec.marginMm - spec.reservedMm;
  // At least one, so a paper size whose reserve swallows the page still emits
  // a document rather than looping forever in `paginatePrescription`.
  return Math.max(1, Math.floor(printable / SLOT_MM));
}

export const PRESCRIPTION_PAPERS: Record<PrescriptionPaper, PrescriptionPaperSpec> = {
  a4: { ...PAPER_GEOMETRY.a4, slotsPerSheet: slotsPerSheet("a4") },
  a5: { ...PAPER_GEOMETRY.a5, slotsPerSheet: slotsPerSheet("a5") },
};

export const PRESCRIPTION_PAPER_ORDER: readonly PrescriptionPaper[] = ["a4", "a5"];

// ---------------------------------------------------------------------------
// Escaping
// ---------------------------------------------------------------------------

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Escape text for both element content and a double- or single-quoted attribute
 * value.
 *
 * The character class is deliberately ASCII-only. Escaping non-ASCII into
 * numeric references would "work" and would also turn every Devanagari and
 * Gurmukhi name in this clinic into an unreadable wall of `&#2360;` — the
 * document declares UTF-8, so those characters travel as themselves.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/** `null`, `undefined` and blank all collapse to "nothing to print". */
function text(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed ? escapeHtml(trimmed) : "";
}

const DEVANAGARI = /[\u0900-\u097F]/;
const GURMUKHI = /[\u0A00-\u0A7F]/;

/**
 * The BCP 47 tag for a run of text, or null when it is plain Latin.
 *
 * Worth the few bytes: a `lang` a browser can see is what makes it reach for a
 * Devanagari face for one cell and leave the rest on the Latin one, and it is
 * what stops a screen reader from spelling out a Hindi drug name in English
 * phonemes. `<html lang="en">` alone tells it the opposite of the truth.
 */
export function scriptLang(value: string | null | undefined): "hi" | "pa" | null {
  if (!value) return null;
  if (DEVANAGARI.test(value)) return "hi";
  if (GURMUKHI.test(value)) return "pa";
  return null;
}

function langAttribute(value: string | null | undefined): string {
  const lang = scriptLang(value);
  return lang ? ` lang="${lang}"` : "";
}

/** Escaped content plus the `lang` its script asks for. */
function cell(tag: string, value: string | null | undefined, className?: string): string {
  const classAttribute = className ? ` class="${className}"` : "";
  return `<${tag}${classAttribute}${langAttribute(value)}>${text(value) || "&mdash;"}</${tag}>`;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Hoisted because `Intl.DateTimeFormat` construction is the expensive part and
 * a paginated prescription formats the same date once per sheet.
 */
const sheetDate = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "long",
  year: "numeric",
});

const sheetTime = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const fileDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * `Intl.DateTimeFormat.format()` throws a RangeError on an Invalid Date. A
 * prescription is printed with a patient waiting, so an unparseable timestamp
 * prints a sheet with no date on it rather than no sheet at all.
 */
function formatWith(formatter: Intl.DateTimeFormat, iso: string | null | undefined): string | null {
  if (!iso) return null;
  // A bare `YYYY-MM-DD` is parsed as UTC midnight, which is the previous
  // evening in IST — every follow-up date would print one day early.
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00+05:30` : iso);
  return Number.isNaN(date.getTime()) ? null : formatter.format(date);
}

export function formatPrescriptionDate(iso: string | null | undefined): string | null {
  return formatWith(sheetDate, iso);
}

export function formatPrescriptionTime(iso: string | null | undefined): string | null {
  return formatWith(sheetTime, iso);
}

/**
 * `PatientSex` is imported rather than restated so that adding a value to the
 * review layer's union fails to compile here instead of printing a raw
 * `not_recorded` on a patient's prescription.
 *
 * A prescription states what is known, so `not_recorded` maps to nothing:
 * printing "Not recorded" beside a patient's name fills the line without
 * adding anything a pharmacist can act on.
 */
const SEX_LABELS = new Map<PatientSex, string>([
  ["female", "Female"],
  ["male", "Male"],
  ["intersex", "Intersex"],
  ["not_recorded", ""],
]);

function formatSex(sex: PatientSex | string | null | undefined): string | null {
  if (!sex) return null;
  // Anything outside the union came straight from `patients.sex`, which is a
  // free-text column. Pass it through rather than dropping a fact on the floor.
  const known = SEX_LABELS.get(sex as PatientSex);
  return known === undefined ? sex : known || null;
}

/** "42 years · Female", with whichever half is actually known. */
export function formatPatientLine(
  ageYears: number | null | undefined,
  sex: PatientSex | string | null | undefined,
): string | null {
  const parts: string[] = [];
  if (typeof ageYears === "number" && Number.isFinite(ageYears) && ageYears >= 0) {
    parts.push(`${Math.round(ageYears)} ${Math.round(ageYears) === 1 ? "year" : "years"}`);
  }
  const sexLabel = formatSex(sex);
  if (sexLabel) parts.push(sexLabel);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * A recorded fee of zero is a fact — the doctor waived it — and prints. An
 * absent fee prints nothing, because a sheet that says "₹0" when nobody
 * recorded anything is a claim this app cannot support.
 */
export function formatPrescriptionFee(feeInr: number | null | undefined): string | null {
  if (typeof feeInr !== "number" || !Number.isFinite(feeInr)) return null;
  return formatINR(feeInr);
}

/** "Paracetamol (Tablet)" — the form only when there is one. */
function drugTitle(drug: PrescriptionDrug): string {
  const form = (drug.form ?? "").trim();
  return form ? `${drug.name.trim()} (${form})` : drug.name.trim();
}

/** Map the stored prescription row onto the sheet's own shape. */
export function prescriptionDrugFromItem(item: VisitPrescriptionItem): PrescriptionDrug {
  return {
    name: item.drug_name,
    strength: item.strength,
    form: item.form,
    // The canonical label, never the raw `frequency_spoken`: "1-0-1" is a note
    // to the doctor who said it, and "Twice a day" is what the patient follows.
    // A frequency the rule table could not place has no label, and the sheet
    // then shows an em dash rather than a guess.
    frequency: item.frequency_label,
    duration: item.duration,
    route: item.route ?? null,
    instructions: item.instructions,
  };
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/** The drug line, plus a second slot when it carries a route or instructions. */
function drugSlots(drug: PrescriptionDrug): number {
  return drugNote(drug) ? 2 : 1;
}

/**
 * Route and instructions share one full-width line under the drug.
 *
 * They are the two cells that actually wrap — "apply thinly twice a day and
 * stop if the rash spreads" — and giving them the width keeps the five
 * scannable columns above from collapsing to two words each on A5.
 */
function drugNote(drug: PrescriptionDrug): { route: string; instructions: string } | null {
  const route = (drug.route ?? "").trim();
  const instructions = (drug.instructions ?? "").trim();
  return route || instructions ? { route, instructions } : null;
}

/**
 * Split the drug list into sheets.
 *
 * The browser would happily paginate one long `<table>` by itself, and repeat
 * the `<thead>` while doing it — but not the masthead or the patient strip. A
 * prescription's sheets are separated the moment a pharmacist keeps one and the
 * patient keeps the other, so every sheet has to name the clinic, the doctor
 * and the patient on its own. That is what forces an explicit split here.
 *
 * An empty prescription yields one empty sheet: a visit that ends in rest and
 * fluids is a real clinical output, and it still needs a page to print on.
 */
export function paginatePrescription(
  drugs: PrescriptionDrug[],
  paper: PrescriptionPaper,
): PrescriptionDrug[][] {
  const capacity = PRESCRIPTION_PAPERS[paper].slotsPerSheet;
  const sheets: PrescriptionDrug[][] = [[]];
  let used = 0;

  for (const drug of drugs) {
    const cost = drugSlots(drug);
    // `>` not `>=`: a single drug costing more than a whole sheet still has to
    // go somewhere, and the guard below only starts a new sheet once the
    // current one has something on it.
    if (used > 0 && used + cost > capacity) {
      sheets.push([]);
      used = 0;
    }
    sheets[sheets.length - 1].push(drug);
    used += cost;
  }

  return sheets;
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

/**
 * The sheet's palette, taken from the light-theme tokens in
 * `src/app/globals.css`.
 *
 * Held as literal values rather than `var(--foreground)` because a prescription
 * is rendered twice from two very different places: this standalone document,
 * which is opened with none of the app's stylesheets loaded, and the in-app
 * preview, where the doctor may well have dark mode on — and near-white ink on
 * white paper prints as a blank page. Exported so both renderers use one
 * definition.
 *
 * Paper is white and ink is expensive, so there are no fills and no gradients,
 * which is also what the design contract requires.
 */
export const PRESCRIPTION_INK: Readonly<Record<string, string>> = {
  "--background": "#ffffff",
  "--card": "#ffffff",
  "--foreground": "#1d1d1f",
  "--muted-foreground": "#4f4f54",
  "--border": "#d2d2d7",
};

const INK = PRESCRIPTION_INK["--foreground"];
const MUTED_INK = PRESCRIPTION_INK["--muted-foreground"];
const HAIRLINE = PRESCRIPTION_INK["--border"];
const PAPER = PRESCRIPTION_INK["--background"];

/**
 * Devanagari and Gurmukhi faces are named ahead of the Latin ones so that a
 * machine which has them uses them. Browsers fall back per character, so Latin
 * text is unaffected by their position in the list.
 *
 * There is deliberately no monospace family anywhere in this document, not even
 * for the fee. `--font-mono` in the app is Geist Mono, subset to Latin; a
 * tabular-nums rule on the same sans stack lines the digits up without ever
 * putting a Devanagari string in front of a font that has no glyphs for it.
 */
const FONT_STACK = [
  '"Noto Sans"',
  '"Noto Sans Devanagari"',
  '"Noto Sans Gurmukhi"',
  '"Nirmala UI"',
  '"Kohinoor Devanagari"',
  '"Kohinoor Gurmukhi"',
  '"Lohit Devanagari"',
  '"Mukta"',
  '"Segoe UI"',
  "system-ui",
  "-apple-system",
  '"Helvetica Neue"',
  "Arial",
  "sans-serif",
].join(", ");

function stylesheet(paper: PrescriptionPaper): string {
  const spec = PRESCRIPTION_PAPERS[paper];
  const contentHeightMm = spec.heightMm - 2 * spec.marginMm;

  return `
@page { size: ${spec.cssSize} portrait; margin: ${spec.marginMm}mm; }

*, *::before, *::after { box-sizing: border-box; }

html { -webkit-text-size-adjust: 100%; }

body {
  margin: 0;
  background: ${PAPER};
  color: ${INK};
  font-family: ${FONT_STACK};
  font-size: ${spec.fontPt}pt;
  /* Devanagari and Gurmukhi hang matras above and below the baseline. At the
     1.2 a browser defaults to, the top matra of one line collides with the
     bottom of the line above and both get clipped by the row box. */
  line-height: 1.55;
}

.rx-sheet {
  display: flex;
  flex-direction: column;
  min-height: ${contentHeightMm}mm;
}

.rx-sheet + .rx-sheet { break-before: page; page-break-before: always; }

.rx-masthead {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8mm;
  min-height: ${paper === "a4" ? 20 : 17}mm;
  padding-bottom: 2.5mm;
  border-bottom: 0.6mm solid ${INK};
}

.rx-clinic { font-size: 1.5em; font-weight: 700; letter-spacing: -0.01em; margin: 0; }
.rx-clinic-city { color: ${MUTED_INK}; margin: 0.5mm 0 0; }

.rx-prescriber { text-align: right; }
.rx-doctor { font-weight: 600; margin: 0; }
.rx-doctor-line { color: ${MUTED_INK}; margin: 0.5mm 0 0; }

.rx-identity {
  display: flex;
  flex-wrap: wrap;
  gap: 2mm 8mm;
  min-height: ${paper === "a4" ? 13 : 11}mm;
  padding: 2.5mm 0;
  border-bottom: 0.2mm solid ${HAIRLINE};
}

.rx-field { display: flex; flex-direction: column; gap: 0.5mm; }
.rx-field-label {
  color: ${MUTED_INK};
  font-size: 0.72em;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.rx-field-value { font-weight: 600; }
.rx-field-value.rx-num { font-variant-numeric: tabular-nums; }

.rx-block { padding: 2.5mm 0; border-bottom: 0.2mm solid ${HAIRLINE}; }
.rx-block-label {
  color: ${MUTED_INK};
  font-size: 0.72em;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.rx-block-body { margin: 1mm 0 0; }

.rx-body { flex: 1 1 auto; padding-top: 3mm; }

.rx-mark { font-size: 1.3em; font-weight: 700; margin: 0 0 1.5mm; }

.rx-table { width: 100%; border-collapse: collapse; }
.rx-table th {
  color: ${MUTED_INK};
  font-size: 0.72em;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-align: left;
  text-transform: uppercase;
  padding: 0 2mm 1.5mm 0;
  border-bottom: 0.2mm solid ${INK};
}
.rx-table td { padding: 1.6mm 2mm 1.6mm 0; vertical-align: top; }
.rx-drug { break-inside: avoid; page-break-inside: avoid; }
.rx-drug > td { border-top: 0.2mm solid ${HAIRLINE}; }
.rx-drug:first-child > td { border-top: 0; }
.rx-index { width: 8mm; font-variant-numeric: tabular-nums; color: ${MUTED_INK}; }
.rx-name { font-weight: 600; }
.rx-note > td {
  padding-top: 0;
  padding-bottom: 1.6mm;
  color: ${MUTED_INK};
}
.rx-note-label { font-weight: 600; }

.rx-empty { color: ${MUTED_INK}; padding: 2mm 0; margin: 0; }

.rx-footer {
  margin-top: auto;
  padding-top: 4mm;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8mm;
  break-inside: avoid;
  page-break-inside: avoid;
}

.rx-footer-notes { max-width: 60%; }
.rx-footer-note { color: ${MUTED_INK}; margin: 0 0 1mm; }
.rx-footer-note:last-child { margin-bottom: 0; }
.rx-fee { font-variant-numeric: tabular-nums; }

.rx-signature { text-align: center; min-width: 45mm; }
.rx-signature-rule {
  border-top: 0.3mm solid ${INK};
  margin-bottom: 1.5mm;
  /* The doctor signs here. Nothing may be laid out inside it. */
  height: 14mm;
}
.rx-signature-name { font-weight: 600; margin: 0; }
.rx-signature-line { color: ${MUTED_INK}; margin: 0.5mm 0 0; }

@media screen {
  body { background: ${HAIRLINE}; padding: 6mm 0; }
  .rx-sheet {
    width: ${spec.widthMm}mm;
    padding: ${spec.marginMm}mm;
    margin: 0 auto 6mm;
    background: ${PAPER};
    border: 1px solid ${HAIRLINE};
  }
}
`.trim();
}

function mastheadHtml(data: PrescriptionSheetData): string {
  const doctorLines = [data.doctor.speciality, registrationLine(data.doctor.registrationNo)]
    .filter((line): line is string => Boolean(line && line.trim()))
    .map((line) => `<p class="rx-doctor-line"${langAttribute(line)}>${text(line)}</p>`)
    .join("");

  const city = text(data.clinic.city);

  return `<header class="rx-masthead">
  <div>
    <p class="rx-clinic"${langAttribute(data.clinic.name)}>${text(data.clinic.name)}</p>
    ${city ? `<p class="rx-clinic-city"${langAttribute(data.clinic.city)}>${city}</p>` : ""}
  </div>
  <div class="rx-prescriber">
    <p class="rx-doctor"${langAttribute(data.doctor.fullName)}>${text(data.doctor.fullName)}</p>
    ${doctorLines}
  </div>
</header>`;
}

function registrationLine(registrationNo: string | null): string | null {
  const trimmed = (registrationNo ?? "").trim();
  // Silence rather than "Reg. No. —". A missing council number is a gap in the
  // doctor's profile, and the place to say so is the screen they can fix it on.
  return trimmed ? `Reg. No. ${trimmed}` : null;
}

function field(label: string, value: string | null, numeric = false): string {
  if (!value) return "";
  return `<div class="rx-field">
    <span class="rx-field-label">${escapeHtml(label)}</span>
    <span class="rx-field-value${numeric ? " rx-num" : ""}"${langAttribute(value)}>${text(value)}</span>
  </div>`;
}

function identityHtml(
  data: PrescriptionSheetData,
  pageNumber: number,
  pageCount: number,
): string {
  const visitDate = formatPrescriptionDate(data.occurredAt);
  const visitTime = formatPrescriptionTime(data.occurredAt);
  const stamp = visitDate && visitTime ? `${visitDate}, ${visitTime}` : visitDate;

  return `<section class="rx-identity">
  ${field("Patient", data.patient.name.trim() || null)}
  ${field("Age / Sex", formatPatientLine(data.patient.ageYears, data.patient.sex), true)}
  ${field("Date", stamp, true)}
  ${pageCount > 1 ? field("Sheet", `${pageNumber} of ${pageCount}`, true) : ""}
</section>`;
}

function block(label: string, value: string | null): string {
  const body = text(value);
  if (!body) return "";
  return `<section class="rx-block">
  <span class="rx-block-label">${escapeHtml(label)}</span>
  <p class="rx-block-body"${langAttribute(value)}>${body}</p>
</section>`;
}

const TABLE_COLUMNS = ["#", "Medicine", "Strength", "Frequency", "Duration"] as const;

function drugRowsHtml(drugs: PrescriptionDrug[], firstIndex: number): string {
  return drugs
    .map((drug, offset) => {
      const title = drugTitle(drug);
      const row = `<tr class="rx-drug">
      <td class="rx-index">${firstIndex + offset}</td>
      ${cell("td", title, "rx-name")}
      ${cell("td", drug.strength)}
      ${cell("td", drug.frequency)}
      ${cell("td", drug.duration)}
    </tr>`;

      const note = drugNote(drug);
      if (!note) return row;

      const parts = [
        note.route ? `<span class="rx-note-label">Route:</span> ${text(note.route)}` : "",
        note.instructions
          ? `<span class="rx-note-label">Instructions:</span> ${text(note.instructions)}`
          : "",
      ].filter(Boolean);

      return `${row}
    <tr class="rx-note">
      <td></td>
      <td colspan="${TABLE_COLUMNS.length - 1}"${langAttribute(`${note.route} ${note.instructions}`)}>${parts.join(" &middot; ")}</td>
    </tr>`;
    })
    .join("\n");
}

function bodyHtml(drugs: PrescriptionDrug[], firstIndex: number): string {
  if (drugs.length === 0) {
    return `<section class="rx-body">
  <p class="rx-mark">Rx</p>
  <p class="rx-empty">No medicines prescribed.</p>
</section>`;
  }

  return `<section class="rx-body">
  <p class="rx-mark">Rx</p>
  <table class="rx-table">
    <thead>
      <tr>${TABLE_COLUMNS.map((column) => `<th scope="col">${escapeHtml(column)}</th>`).join("")}</tr>
    </thead>
    <tbody>
${drugRowsHtml(drugs, firstIndex)}
    </tbody>
  </table>
</section>`;
}

function footerHtml(data: PrescriptionSheetData): string {
  const followUp = formatPrescriptionDate(data.followUpOn);
  const fee = formatPrescriptionFee(data.feeInr);

  const notes = [
    followUp ? `<p class="rx-footer-note">Review on ${escapeHtml(followUp)}</p>` : "",
    fee ? `<p class="rx-footer-note rx-fee">Consultation fee ${escapeHtml(fee)}</p>` : "",
  ]
    .filter(Boolean)
    .join("");

  const registration = registrationLine(data.doctor.registrationNo);

  return `<footer class="rx-footer">
  <div class="rx-footer-notes">${notes}</div>
  <div class="rx-signature">
    <div class="rx-signature-rule"></div>
    <p class="rx-signature-name"${langAttribute(data.doctor.fullName)}>${text(data.doctor.fullName)}</p>
    ${registration ? `<p class="rx-signature-line">${text(registration)}</p>` : ""}
    <p class="rx-signature-line">Signature</p>
  </div>
</footer>`;
}

function sheetHtml(
  data: PrescriptionSheetData,
  drugs: PrescriptionDrug[],
  firstIndex: number,
  pageNumber: number,
  pageCount: number,
): string {
  return `<article class="rx-sheet">
${mastheadHtml(data)}
${identityHtml(data, pageNumber, pageCount)}
${block("Diagnosis", data.diagnosis)}
${bodyHtml(drugs, firstIndex)}
${block("Advice", data.advice)}
${footerHtml(data)}
</article>`;
}

export interface PrescriptionHtmlOptions {
  paper?: PrescriptionPaper;
  /**
   * The request's CSP nonce.
   *
   * `style-src` in `src/lib/security/headers.ts` is `'self'` plus a per-request
   * nonce, so the stylesheet below is exactly the inline style that policy
   * exists to block. Serve this document from a route that reads `x-nonce` and
   * passes it here, or the prescription arrives as unstyled running text.
   */
  nonce?: string;
}

/**
 * Build the complete printable document.
 *
 * `<meta charset>` leads the head on purpose: a browser opening a saved copy of
 * this file from a phone's Downloads folder has no `Content-Type` to go on, and
 * without the declaration it falls back to a legacy single-byte encoding — which
 * turns every Devanagari and Gurmukhi name in it into mojibake.
 */
export function buildPrescriptionHtml(
  data: PrescriptionSheetData,
  options: PrescriptionHtmlOptions = {},
): string {
  const paper = options.paper ?? "a4";
  const sheets = paginatePrescription(data.drugs, paper);
  const visitDate = formatPrescriptionDate(data.occurredAt);
  const title = ["Prescription", data.patient.name.trim(), visitDate]
    .filter((part): part is string => Boolean(part))
    .join(" — ");

  const nonceAttribute = options.nonce ? ` nonce="${escapeHtml(options.nonce)}"` : "";

  let printed = 0;
  const body = sheets
    .map((drugs, index) => {
      const html = sheetHtml(data, drugs, printed + 1, index + 1, sheets.length);
      printed += drugs.length;
      return html;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<style${nonceAttribute}>
${stylesheet(paper)}
</style>
</head>
<body>
${body}
</body>
</html>
`;
}

/**
 * The `filename` for a `Content-Disposition` on a download of this document.
 *
 * Stripped to ASCII letters, digits and dashes. A filename is the one part of
 * that header built from patient data, and a quote, a newline or a `;` in a
 * name would let the rest of the header be rewritten. A name with no ASCII at
 * all — which is the common case here — leaves only the date, and the date is
 * enough to tell two downloads apart.
 */
export function prescriptionFileName(data: PrescriptionSheetData): string {
  const slug = data.patient.name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 40);
  const day = formatWith(fileDate, data.occurredAt) ?? "undated";
  return ["prescription", slug, day].filter(Boolean).join("-") + ".html";
}
