import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildPrescriptionHtml,
  escapeHtml,
  formatPatientLine,
  formatPrescriptionFee,
  paginatePrescription,
  prescriptionDrugFromItem,
  prescriptionFileName,
  PRESCRIPTION_PAPERS,
  scriptLang,
  type PrescriptionDrug,
  type PrescriptionSheetData,
} from "../../src/lib/outputs/prescription-print.ts";

/**
 * A prescription is the one artefact this app produces that a patient carries
 * out of the clinic. Nobody re-reads it against the register, so a name that
 * came out as mojibake or a drug that fell off page two is a defect that is
 * only ever discovered at a pharmacy counter.
 *
 * Everything asserted here is a property of the printed document — what the
 * browser will be handed — rather than of the code that assembled it.
 */

/** 10:45 IST on 14 July 2026. */
const OCCURRED_AT = "2026-07-14T05:15:00Z";

function drug(overrides: Partial<PrescriptionDrug> = {}): PrescriptionDrug {
  return {
    name: "Paracetamol",
    strength: "650 mg",
    form: "Tablet",
    frequency: "Twice a day",
    duration: "5 days",
    route: null,
    instructions: null,
    ...overrides,
  };
}

function sheet(overrides: Partial<PrescriptionSheetData> = {}): PrescriptionSheetData {
  return {
    clinic: { name: "Sharma Clinic", city: "Ludhiana" },
    doctor: {
      fullName: "Dr. Anil Sharma",
      registrationNo: "PMC/12345",
      speciality: "MBBS, MD (Medicine)",
    },
    patient: { name: "Sunita Devi", ageYears: 42, sex: "female" },
    occurredAt: OCCURRED_AT,
    diagnosis: "Viral fever",
    advice: "Rest and fluids.",
    drugs: [drug()],
    feeInr: 300,
    followUpOn: null,
    ...overrides,
  };
}

function sheetCount(html: string): number {
  return html.split('class="rx-sheet"').length - 1;
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** Only what is printed. The `<title>` repeats the patient name off-paper. */
function printed(html: string): string {
  return html.slice(html.indexOf("<body>"), html.indexOf("</body>"));
}

// ---------------------------------------------------------------------------
// Escaping
// ---------------------------------------------------------------------------

test("the five characters that change how markup parses are all escaped", () => {
  assert.equal(
    escapeHtml(`& < > " '`),
    "&amp; &lt; &gt; &quot; &#39;",
  );
});

test("a patient name is never markup", () => {
  // Names, diagnoses and drug instructions are free text typed or dictated by a
  // person, and in a multi-doctor clinic the doctor printing is often not the
  // one who entered them.
  const html = buildPrescriptionHtml(
    sheet({
      patient: {
        name: `<img src=x onerror="alert(1)">`,
        ageYears: 30,
        sex: "male",
      },
    }),
  );

  assert.equal(html.includes("<img"), false, "the tag must not survive as markup");
  assert.equal(html.includes('onerror="'), false, "the quotes that would open a handler are gone");
  assert.equal(html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"), true);
});

test("an apostrophe cannot close an attribute the builder opened", () => {
  // `lang="hi"` is written by hand next to interpolated text, so a value
  // carrying a quote is the one that could reach outside its own attribute.
  const html = buildPrescriptionHtml(
    sheet({ clinic: { name: `O'Brien's "Family" Clinic`, city: null } }),
  );

  assert.equal(html.includes("&#39;Brien&#39;s &quot;Family&quot;"), true);
  assert.equal(html.includes(`O'Brien`), false);
});

test("the document title carries the patient name escaped, not raw", () => {
  const html = buildPrescriptionHtml(sheet({ patient: { name: "A </title><b>", ageYears: null, sex: null } }));

  assert.equal(occurrences(html, "</title>"), 1, "only the builder's own closing tag");
  assert.equal(html.includes("&lt;/title&gt;&lt;b&gt;"), true);
});

test("a nonce is escaped before it becomes an attribute", () => {
  const html = buildPrescriptionHtml(sheet(), { nonce: `x" onload="y` });

  assert.equal(html.includes(`onload="`), false);
  assert.equal(html.includes(`<style nonce="x&quot; onload=&quot;y">`), true);
});

test("no nonce means no nonce attribute rather than an empty one", () => {
  // An empty `nonce=""` matches nothing in a CSP and would read, wrongly, as
  // though the stylesheet had been authorised.
  assert.equal(buildPrescriptionHtml(sheet()).includes("<style>\n"), true);
});

// ---------------------------------------------------------------------------
// Devanagari and Gurmukhi
// ---------------------------------------------------------------------------

test("Devanagari reaches the document as itself", () => {
  const name = "सुनीता देवी";
  const diagnosis = "वायरल बुखार";
  const medicine = "पैरासिटामोल";
  const instruction = "खाने के बाद";

  const html = buildPrescriptionHtml(
    sheet({
      patient: { name, ageYears: 42, sex: "female" },
      diagnosis,
      drugs: [drug({ name: medicine, instructions: instruction })],
    }),
  );

  for (const value of [name, diagnosis, medicine, instruction]) {
    assert.equal(html.includes(value), true, `${value} must survive verbatim`);
  }
  // Numeric character references would render identically and make the file
  // unreadable to anyone opening it, so the escaper must stay ASCII-only.
  assert.equal(/&#\d{4};/.test(html), false, "no character escaped into a numeric reference");
});

test("combining vowel signs are not dropped or reordered", () => {
  // "सुनीता" is स + ु + न + ी + त + ा. An escaper or a truncation that worked on
  // anything other than whole code points would silently eat a matra and change
  // the name — which is exactly the kind of damage nobody notices on paper.
  const name = "सुनीता देवी";
  const html = buildPrescriptionHtml(sheet({ patient: { name, ageYears: 42, sex: "female" } }));

  const start = html.indexOf(name);
  assert.notEqual(start, -1);
  assert.deepEqual(
    [...html.slice(start, start + name.length)].map((char) => char.codePointAt(0)),
    [...name].map((char) => char.codePointAt(0)),
  );
});

test("Gurmukhi is carried too, because Punjabi is a dictation language here", () => {
  const html = buildPrescriptionHtml(
    sheet({ patient: { name: "ਸੁਨੀਤਾ ਦੇਵੀ", ageYears: 42, sex: "female" } }),
  );

  assert.equal(html.includes("ਸੁਨੀਤਾ ਦੇਵੀ"), true);
  assert.equal(html.includes('lang="pa"'), true);
});

test("a run of Indic text is tagged with the language it is in", () => {
  assert.equal(scriptLang("सुनीता"), "hi");
  assert.equal(scriptLang("ਸੁਨੀਤਾ"), "pa");
  assert.equal(scriptLang("Sunita"), null);
  assert.equal(scriptLang(null), null);

  const html = buildPrescriptionHtml(
    sheet({ patient: { name: "सुनीता देवी", ageYears: 42, sex: "female" } }),
  );
  assert.equal(html.includes('lang="hi">सुनीता देवी'), true);
});

test("the encoding is declared before any text the browser has to decode", () => {
  // A sheet saved to a phone's Downloads folder and reopened has no
  // Content-Type; without this the browser falls back to a single-byte legacy
  // encoding and every Devanagari name in it becomes mojibake.
  const html = buildPrescriptionHtml(sheet());

  assert.equal(html.indexOf('<meta charset="utf-8">') < html.indexOf("<title>"), true);
});

test("no rule in the sheet asks for a monospace face", () => {
  // The app's mono family is subset to Latin. Putting a Devanagari drug name in
  // front of it produces tofu, so digits are aligned with tabular-nums on the
  // one sans stack instead.
  const html = buildPrescriptionHtml(sheet());

  assert.equal(html.includes("monospace"), false);
  assert.equal(html.includes("font-variant-numeric: tabular-nums"), true);
});

test("the font stack names families that actually cover the scripts used", () => {
  const html = buildPrescriptionHtml(sheet());

  for (const family of ["Noto Sans Devanagari", "Noto Sans Gurmukhi", "Nirmala UI"]) {
    assert.equal(html.includes(family), true, `${family} missing from the font stack`);
  }
});

// ---------------------------------------------------------------------------
// The empty prescription
// ---------------------------------------------------------------------------

test("a visit that prescribed nothing still prints one sheet", () => {
  // Rest, fluids and a review date is a real clinical output. A blank page
  // where the table should be reads as a printing failure.
  assert.deepEqual(paginatePrescription([], "a4"), [[]]);

  const html = buildPrescriptionHtml(sheet({ drugs: [], advice: "Rest and fluids." }));

  assert.equal(sheetCount(html), 1);
  assert.equal(html.includes("No medicines prescribed."), true);
  assert.equal(html.includes("<table"), false, "no empty table shell");
  assert.equal(html.includes("Rest and fluids."), true);
  assert.equal(html.includes("Sunita Devi"), true);
  assert.equal(html.includes("Signature"), true);
});

test("a sheet with nothing but a patient on it is still a valid document", () => {
  const html = buildPrescriptionHtml(
    sheet({
      clinic: { name: "Sharma Clinic", city: null },
      doctor: { fullName: "Dr. Anil Sharma", registrationNo: null, speciality: null },
      patient: { name: "Sunita Devi", ageYears: null, sex: null },
      diagnosis: null,
      advice: null,
      drugs: [],
      feeInr: null,
      followUpOn: null,
    }),
  );

  assert.equal(html.includes("null"), false, "no nullish value reached the page");
  assert.equal(html.includes("undefined"), false);
  assert.equal(html.includes("Reg. No."), false, "a missing council number prints nothing at all");
  assert.equal(html.includes("Diagnosis"), false);
  assert.equal(sheetCount(html), 1);
});

// ---------------------------------------------------------------------------
// The fee
// ---------------------------------------------------------------------------

test("a fee nobody recorded is not printed as zero", () => {
  const html = buildPrescriptionHtml(sheet({ feeInr: null }));

  assert.equal(html.includes("Consultation fee"), false);
  assert.equal(html.includes("₹"), false);
  assert.equal(formatPrescriptionFee(null), null);
  assert.equal(formatPrescriptionFee(undefined), null);
  assert.equal(formatPrescriptionFee(Number.NaN), null);
});

test("a fee recorded as zero is a waived fee and does print", () => {
  const html = buildPrescriptionHtml(sheet({ feeInr: 0 }));

  assert.equal(html.includes("Consultation fee ₹0"), true);
});

test("the fee is grouped the way Indian currency is read", () => {
  // 2-2-3, so ₹1,25,000 rather than ₹125,000.
  assert.equal(formatPrescriptionFee(125000), "₹1,25,000");
  assert.equal(formatPrescriptionFee(300), "₹300");
});

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

test("a drug list that fits stays on one sheet", () => {
  const drugs = Array.from({ length: PRESCRIPTION_PAPERS.a4.slotsPerSheet }, (_, index) =>
    drug({ name: `Drug ${index + 1}` }),
  );

  assert.equal(paginatePrescription(drugs, "a4").length, 1);
  assert.equal(sheetCount(buildPrescriptionHtml({ ...sheet(), drugs }, { paper: "a4" })), 1);
});

test("a long drug list is split, and no drug is lost or duplicated", () => {
  const drugs = Array.from({ length: 40 }, (_, index) => drug({ name: `Drug ${index + 1}` }));
  const pages = paginatePrescription(drugs, "a5");

  assert.equal(pages.length > 1, true, "40 drugs cannot fit one A5 sheet");
  assert.deepEqual(pages.flat(), drugs, "order and membership are preserved exactly");
  for (const page of pages) {
    assert.equal(page.length <= PRESCRIPTION_PAPERS.a5.slotsPerSheet, true);
    assert.equal(page.length > 0, true, "no empty sheet once there are drugs to place");
  }
});

test("an instruction line costs a row, so a page holds fewer of those drugs", () => {
  const plain = Array.from({ length: 40 }, () => drug());
  const annotated = Array.from({ length: 40 }, () => drug({ instructions: "After food" }));

  assert.equal(
    paginatePrescription(annotated, "a4").length >
      paginatePrescription(plain, "a4").length,
    true,
  );
  // A route occupies the same sub-line, so it costs the same.
  assert.deepEqual(
    paginatePrescription(
      Array.from({ length: 40 }, () => drug({ route: "Topical" })),
      "a4",
    ).map((page) => page.length),
    paginatePrescription(annotated, "a4").map((page) => page.length),
  );
});

test("every sheet identifies the clinic, the doctor and the patient on its own", () => {
  // Sheets are separated the moment a pharmacist keeps one and the patient
  // keeps the other, so a continuation page must stand alone.
  const drugs = Array.from({ length: 40 }, (_, index) => drug({ name: `Drug ${index + 1}` }));
  const html = buildPrescriptionHtml({ ...sheet(), drugs }, { paper: "a5" });
  const pages = paginatePrescription(drugs, "a5");

  const paper = printed(html);

  assert.equal(sheetCount(html), pages.length);
  assert.equal(occurrences(paper, "Sharma Clinic"), pages.length);
  assert.equal(occurrences(paper, "Sunita Devi"), pages.length);
  assert.equal(occurrences(paper, "PMC/12345"), pages.length * 2, "masthead and signature");
  assert.equal(occurrences(paper, "Signature"), pages.length);
  assert.equal(occurrences(paper, `1 of ${pages.length}`), 1);
  assert.equal(occurrences(paper, `${pages.length} of ${pages.length}`), 1);
});

test("drug numbering runs on across the split", () => {
  const drugs = Array.from({ length: 40 }, (_, index) => drug({ name: `Drug ${index + 1}` }));
  const html = buildPrescriptionHtml({ ...sheet(), drugs }, { paper: "a5" });

  const numbers = [...html.matchAll(/<td class="rx-index">(\d+)<\/td>/g)].map((match) =>
    Number(match[1]),
  );

  assert.deepEqual(
    numbers,
    drugs.map((_, index) => index + 1),
    "a patient counting medicines must not find two number ones",
  );
});

test("a single sheet does not label itself sheet 1 of 1", () => {
  assert.equal(buildPrescriptionHtml(sheet()).includes("Sheet"), false);
});

// ---------------------------------------------------------------------------
// Paper
// ---------------------------------------------------------------------------

test("each paper size sets its own page box", () => {
  assert.equal(
    buildPrescriptionHtml(sheet(), { paper: "a4" }).includes("@page { size: A4 portrait; margin: 14mm; }"),
    true,
  );
  assert.equal(
    buildPrescriptionHtml(sheet(), { paper: "a5" }).includes("@page { size: A5 portrait; margin: 10mm; }"),
    true,
  );
  // The default has to be the one a clinic printer is loaded with.
  assert.equal(buildPrescriptionHtml(sheet()).includes("size: A4 portrait"), true);
});

test("the row budget is arithmetic over the declared page geometry", () => {
  for (const paper of ["a4", "a5"] as const) {
    const spec = PRESCRIPTION_PAPERS[paper];
    assert.equal(spec.slotsPerSheet >= 1, true);
    assert.equal(
      spec.slotsPerSheet <= (spec.heightMm - 2 * spec.marginMm - spec.reservedMm) / 8,
      true,
      `${paper} budgets more rows than its own geometry leaves room for`,
    );
  }
  assert.equal(
    PRESCRIPTION_PAPERS.a4.slotsPerSheet > PRESCRIPTION_PAPERS.a5.slotsPerSheet,
    true,
  );
});

test("the sheet reserves the signature space it says it does", () => {
  const html = buildPrescriptionHtml(sheet(), { paper: "a5" });

  assert.equal(html.includes("min-height: 190mm"), true, "A5 content box is 210mm less two 10mm margins");
  assert.equal(html.includes("break-inside: avoid"), true, "a drug row must not be cut in half");
});

// ---------------------------------------------------------------------------
// Dates and identity
// ---------------------------------------------------------------------------

test("the visit stamp is the clinic's clock, not the server's", () => {
  const html = buildPrescriptionHtml(sheet());

  assert.equal(html.includes("14 July 2026, 10:45 am"), true);
});

test("a follow-up date does not slip a day into the previous evening", () => {
  // A bare YYYY-MM-DD parses as UTC midnight, which is 05:30 the previous
  // evening in IST — every review date would print one day early.
  const html = buildPrescriptionHtml(sheet({ followUpOn: "2026-07-21" }));

  assert.equal(html.includes("Review on 21 July 2026"), true);
});

test("an unparseable timestamp costs the date, not the prescription", () => {
  const html = buildPrescriptionHtml(sheet({ occurredAt: "not a date", followUpOn: "also not" }));

  assert.equal(sheetCount(html), 1);
  assert.equal(html.includes("Paracetamol"), true);
  assert.equal(html.includes("Invalid Date"), false);
  assert.equal(html.includes("Review on"), false);
});

test("age and sex print only what is actually known", () => {
  assert.equal(formatPatientLine(42, "female"), "42 years · Female");
  assert.equal(formatPatientLine(1, "male"), "1 year · Male");
  assert.equal(formatPatientLine(42, null), "42 years");
  assert.equal(formatPatientLine(null, "male"), "Male");
  assert.equal(formatPatientLine(null, null), null);
  // "Not recorded" beside a patient's name fills the line without telling a
  // pharmacist anything.
  assert.equal(formatPatientLine(42, "not_recorded"), "42 years");
  // `patients.sex` is a free-text column, so a value outside the union is
  // passed through rather than dropped.
  assert.equal(formatPatientLine(null, "transgender"), "transgender");
});

// ---------------------------------------------------------------------------
// The stored row
// ---------------------------------------------------------------------------

test("the printed frequency is the canonical label, never the spoken form", () => {
  // "1-0-1" is a note to the doctor who said it. "Twice a day" is what the
  // patient follows.
  const mapped = prescriptionDrugFromItem({
    drug_name: "Paracetamol",
    strength: "650mg",
    form: "Tablet",
    frequency_spoken: "1-0-1",
    frequency_code: "BD",
    frequency_label: "Twice a day",
    duration: "5 days",
    route: "PO",
    instructions: "After food",
    position: 0,
  });

  assert.deepEqual(mapped, {
    name: "Paracetamol",
    strength: "650mg",
    form: "Tablet",
    frequency: "Twice a day",
    duration: "5 days",
    route: "PO",
    instructions: "After food",
  });
});

test("a frequency the rule table could not place prints a gap, not a guess", () => {
  const mapped = prescriptionDrugFromItem({
    drug_name: "Paracetamol",
    strength: null,
    form: null,
    frequency_spoken: "whenever he feels like it",
    frequency_label: null,
    needs_review: true,
    duration: null,
    instructions: null,
    position: 0,
  });

  assert.equal(mapped.frequency, null);

  const html = buildPrescriptionHtml(sheet({ drugs: [mapped] }));
  assert.equal(html.includes("whenever he feels like it"), false);
  assert.equal(html.includes("&mdash;"), true);
});

// ---------------------------------------------------------------------------
// The filename
// ---------------------------------------------------------------------------

test("a patient name cannot rewrite the response headers through the filename", () => {
  assert.equal(
    prescriptionFileName(sheet({ patient: { name: `a"; b\r\nX-Evil: 1`, ageYears: null, sex: null } })),
    "prescription-a-b-x-evil-1-2026-07-14.html",
  );
});

test("a name with no ASCII in it still yields a usable filename", () => {
  // The common case in this clinic. The date alone tells two downloads apart.
  assert.equal(
    prescriptionFileName(sheet({ patient: { name: "सुनीता देवी", ageYears: null, sex: null } })),
    "prescription-2026-07-14.html",
  );
});

test("a prescription with no usable timestamp is still downloadable", () => {
  assert.equal(
    prescriptionFileName(sheet({ patient: { name: "Sunita", ageYears: null, sex: null }, occurredAt: "" })),
    "prescription-sunita-undated.html",
  );
});
