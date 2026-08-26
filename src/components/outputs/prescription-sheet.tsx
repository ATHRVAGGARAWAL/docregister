"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

import { FileTextIcon, TriangleAlertIcon, XIcon } from "@/components/icons";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import {
  formatPatientLine,
  formatPrescriptionDate,
  formatPrescriptionFee,
  formatPrescriptionTime,
  paginatePrescription,
  scriptLang,
  PRESCRIPTION_INK,
  PRESCRIPTION_PAPERS,
  type PrescriptionDrug,
  type PrescriptionPaper,
  type PrescriptionSheetData,
} from "@/lib/outputs/prescription-print";

/**
 * The prescription, on screen and on paper.
 *
 * This is a review surface before it is a print surface: the doctor sees the
 * exact sheet the patient will be handed, and the gaps that would print as an
 * em dash are called out beside it while they can still be fixed.
 *
 * It owns no dashboard state and mounts anywhere — the caller supplies the
 * visit and closes it.
 */

const PAPER_CHOICES: readonly PrescriptionPaper[] = ["a4", "a5"];

/**
 * Repainting the light-theme tokens on the sheet turns it into a light island
 * inside a dark app. Without this, `text-foreground` on a doctor in dark mode
 * resolves to near-white, which prints as a blank page — the browser drops the
 * dark background and keeps the pale ink.
 *
 * A `style` attribute rather than a stylesheet because `style-src` in
 * `src/lib/security/headers.ts` is `'self'` plus a per-request nonce this
 * component has no way to read, while `style-src-attr` is `'unsafe-inline'`.
 */
const SHEET_INK = PRESCRIPTION_INK as CSSProperties;

/**
 * Whether there is a `document.body` to portal into — false through the server
 * render and the hydration pass, true afterwards.
 *
 * Read through `useSyncExternalStore` rather than the `useState(false)` plus
 * `useEffect(() => setMounted(true))` pair that usually expresses this: that
 * version schedules its second render synchronously from inside the first
 * effect, which `react-hooks/set-state-in-effect` rejects.
 */
function subscribeToNothing(): () => void {
  return () => {};
}

const onClient = () => true;
const onServer = () => false;

export function PrescriptionSheet({
  data,
  onClose,
  defaultPaper = "a4",
  nonce,
}: {
  data: PrescriptionSheetData;
  onClose: () => void;
  defaultPaper?: PrescriptionPaper;
  /**
   * The request's CSP nonce, from `headers().get("x-nonce")`.
   *
   * Worth threading through: it is what lets the two print rules below into the
   * document. Without it the sheet still prints, on whatever paper the dialog is
   * set to and with the app chrome cut by the `beforeprint` handler instead.
   */
  nonce?: string;
}) {
  const [paper, setPaper] = useState<PrescriptionPaper>(defaultPaper);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const headingId = useId();
  const warningsId = useId();
  const mounted = useSyncExternalStore(subscribeToNothing, onClient, onServer);

  const sheets = useMemo(() => paginatePrescription(data.drugs, paper), [data.drugs, paper]);

  const warnings = useMemo(() => prePrintWarnings(data), [data]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const siblings = [...document.body.children].filter(
      (child): child is HTMLElement => child instanceof HTMLElement && !child.contains(root),
    );

    /**
     * `inert` does the whole job of a modal: it takes the rest of the app out
     * of the tab order and out of the accessibility tree in one attribute, so
     * there is no hand-rolled focus trap here to get subtly wrong.
     */
    const previouslyInert = siblings.map((element) => element.inert);
    for (const element of siblings) element.inert = true;

    /**
     * Printing hides the app around the sheet. Toggled through the `style`
     * attribute rather than a class for the same CSP reason `SHEET_INK` is:
     * this component cannot author a stylesheet. `beforeprint` also covers the
     * doctor reaching for Ctrl+P instead of the button.
     */
    let hidden: { element: HTMLElement; display: string }[] = [];

    const hideChrome = () => {
      if (hidden.length) return;
      hidden = siblings.map((element) => ({ element, display: element.style.display }));
      for (const { element } of hidden) element.style.display = "none";
    };

    const showChrome = () => {
      for (const { element, display } of hidden) element.style.display = display;
      hidden = [];
    };

    window.addEventListener("beforeprint", hideChrome);
    window.addEventListener("afterprint", showChrome);

    return () => {
      window.removeEventListener("beforeprint", hideChrome);
      window.removeEventListener("afterprint", showChrome);
      // Order matters: a cancelled print leaves `hidden` populated, and
      // unmounting without restoring would leave the doctor on a blank page.
      showChrome();
      siblings.forEach((element, index) => {
        element.inert = previouslyInert[index];
      });
    };
    // `mounted` is a dependency and not a value this effect reads: the render
    // that flips it is the one that puts the overlay in the DOM, so it is the
    // only point at which `rootRef` has something to compare siblings against.
  }, [mounted]);

  useEffect(() => {
    // Focus lands on Close rather than Print: the destructive-by-omission
    // mistake here is printing before reading, and a stray Enter should not
    // send paper through a printer.
    closeRef.current?.focus();
  }, [mounted]);

  useEffect(() => {
    const opener = document.activeElement;
    return () => {
      // Returning focus to whatever opened this is the difference between a
      // keyboard user carrying on and being dropped at the top of the document.
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    },
    [onClose],
  );

  if (!mounted) return null;

  const spec = PRESCRIPTION_PAPERS[paper];
  const sheetSummary = `${spec.label} · ${sheets.length} ${sheets.length === 1 ? "sheet" : "sheets"}`;

  const overlay = (
    <div
      ref={rootRef}
      data-slot="prescription-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      aria-describedby={warnings.length > 0 ? warningsId : undefined}
      onKeyDown={handleKeyDown}
      className="bg-background fixed inset-0 z-50 flex flex-col overflow-y-auto print:static print:block print:overflow-visible print:bg-transparent"
    >
      {nonce ? (
        /**
         * The two rules no Tailwind utility can express: the page box, which
         * preselects the paper in the print dialog, and the cut that leaves
         * only this overlay on the page.
         *
         * `beforeprint` below performs the same cut and is what covers a render
         * with no nonce to hand — but it does not fire on iOS Safari, where
         * printing goes through the share sheet. On a phone, the primary target
         * here, this rule is the one that runs.
         */
        <style nonce={nonce}>{`@page { size: ${spec.cssSize} portrait; margin: ${spec.marginMm}mm; }
@media print { body > *:not([data-slot="prescription-overlay"]) { display: none !important; } }`}</style>
      ) : null}

      <div className="border-border bg-background sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b px-4 py-3 print:hidden">
        <h2 id={headingId} className="mr-auto text-sm font-semibold tracking-[-0.01em]">
          Prescription
        </h2>

        <SegmentedControl aria-label="Paper size">
          {PAPER_CHOICES.map((choice) => (
            <SegmentedControlItem
              key={choice}
              selected={paper === choice}
              onClick={() => setPaper(choice)}
            >
              {PRESCRIPTION_PAPERS[choice].label}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>

        <Button type="button" onClick={() => window.print()}>
          <FileTextIcon className="size-4" aria-hidden />
          Print
        </Button>

        <Button
          ref={closeRef}
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close prescription"
        >
          <XIcon className="size-4" aria-hidden />
        </Button>
      </div>

      <div className="mx-auto w-full max-w-[210mm] px-4 py-4 print:max-w-none print:p-0">
        <p role="status" aria-live="polite" className="text-muted-foreground mb-3 text-xs print:hidden">
          {sheetSummary}
        </p>

        <Warnings id={warningsId} notes={warnings} />

        <div className="grid gap-4 print:block">
          {sheets.map((drugs, index) => (
            <Sheet
              key={index}
              data={data}
              drugs={drugs}
              firstIndex={sheets.slice(0, index).reduce((total, page) => total + page.length, 1)}
              pageNumber={index + 1}
              pageCount={sheets.length}
            />
          ))}
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

/**
 * What the sheet cannot say, said on screen while it is still fixable.
 *
 * Computed outside the banner so the dialog can point `aria-describedby` at it:
 * these notes are read out as the dialog opens, which is the only moment a
 * doctor who is not looking at the banner would hear them.
 */
function prePrintWarnings(data: PrescriptionSheetData): string[] {
  const notes: string[] = [];

  if (!(data.doctor.registrationNo ?? "").trim()) {
    notes.push(
      "Your medical registration number is not on your profile, so it is missing from this prescription. Add it under Settings.",
    );
  }

  const missingFrequency = data.drugs.filter((drug) => !(drug.frequency ?? "").trim()).length;
  if (missingFrequency === 1) {
    notes.push(
      "One medicine has no frequency and will print as a dash. Set it on the visit before printing.",
    );
  } else if (missingFrequency > 1) {
    notes.push(
      `${missingFrequency} medicines have no frequency and will print as a dash. Set them on the visit before printing.`,
    );
  }

  return notes;
}

function Warnings({ id, notes }: { id: string; notes: string[] }) {
  if (notes.length === 0) return null;

  // No live region: `aria-describedby` on the dialog already announces these,
  // and a polite region on the same text would say all of it twice.
  return (
    <Alert id={id} variant="destructive" className="mb-4 print:hidden">
      <TriangleAlertIcon className="size-4" aria-hidden />
      <AlertTitle>Check before printing</AlertTitle>
      <AlertDescription>
        {notes.map((note) => (
          <p key={note}>{note}</p>
        ))}
      </AlertDescription>
    </Alert>
  );
}

/** `lang` so the browser reaches for a Devanagari or Gurmukhi face per cell. */
function lang(value: string | null | undefined): string | undefined {
  return scriptLang(value) ?? undefined;
}

function Sheet({
  data,
  drugs,
  firstIndex,
  pageNumber,
  pageCount,
}: {
  data: PrescriptionSheetData;
  drugs: PrescriptionDrug[];
  firstIndex: number;
  pageNumber: number;
  pageCount: number;
}) {
  const visitDate = formatPrescriptionDate(data.occurredAt);
  const visitTime = formatPrescriptionTime(data.occurredAt);
  const stamp = visitDate && visitTime ? `${visitDate}, ${visitTime}` : visitDate;
  const fee = formatPrescriptionFee(data.feeInr);
  const followUp = formatPrescriptionDate(data.followUpOn);
  const registration = (data.doctor.registrationNo ?? "").trim();

  return (
    <article
      style={SHEET_INK}
      className="border-border bg-card text-foreground flex flex-col rounded-lg border p-5 text-[13px] leading-[1.55] shadow-flat print:break-after-page print:rounded-none print:border-0 print:p-0 print:shadow-none print:last:break-after-auto"
    >
      <header className="border-foreground flex items-start justify-between gap-6 border-b-2 pb-2">
        <div className="min-w-0">
          <p lang={lang(data.clinic.name)} className="text-lg font-bold tracking-[-0.01em]">
            {data.clinic.name}
          </p>
          {data.clinic.city ? (
            <p lang={lang(data.clinic.city)} className="text-muted-foreground text-xs">
              {data.clinic.city}
            </p>
          ) : null}
        </div>
        <div className="min-w-0 text-right">
          <p lang={lang(data.doctor.fullName)} className="font-semibold">
            {data.doctor.fullName}
          </p>
          {data.doctor.speciality ? (
            <p className="text-muted-foreground text-xs">{data.doctor.speciality}</p>
          ) : null}
          {registration ? (
            <p className="text-muted-foreground text-xs">Reg. No. {registration}</p>
          ) : null}
        </div>
      </header>

      <section className="border-border flex flex-wrap gap-x-8 gap-y-2 border-b py-2.5">
        <Field label="Patient" value={data.patient.name.trim() || null} />
        <Field label="Age / Sex" value={formatPatientLine(data.patient.ageYears, data.patient.sex)} />
        <Field label="Date" value={stamp} />
        {pageCount > 1 ? <Field label="Sheet" value={`${pageNumber} of ${pageCount}`} /> : null}
      </section>

      {data.diagnosis?.trim() ? <Block label="Diagnosis" value={data.diagnosis} /> : null}

      <section className="flex-1 pt-3">
        <p className="mb-1.5 text-base font-bold">Rx</p>
        {drugs.length === 0 ? (
          <p className="text-muted-foreground">No medicines prescribed.</p>
        ) : (
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-foreground border-b">
                  {["#", "Medicine", "Strength", "Frequency", "Duration"].map((column) => (
                    <th
                      key={column}
                      scope="col"
                      className="text-muted-foreground pr-2 pb-1.5 text-[10px] font-semibold tracking-[0.08em] uppercase"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {drugs.map((drug, offset) => (
                  <DrugRows key={offset} drug={drug} index={firstIndex + offset} first={offset === 0} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {data.advice?.trim() ? <Block label="Advice" value={data.advice} /> : null}

      <footer className="flex items-end justify-between gap-6 break-inside-avoid pt-6">
        <div className="text-muted-foreground min-w-0 text-xs">
          {followUp ? <p>Review on {followUp}</p> : null}
          {fee ? <p className="tabular-nums">Consultation fee {fee}</p> : null}
        </div>
        <div className="min-w-[45mm] text-center">
          {/* The doctor signs here, so nothing may be laid out inside it. */}
          <div className="border-foreground mb-1.5 h-[14mm] border-t-2" />
          <p lang={lang(data.doctor.fullName)} className="font-semibold">
            {data.doctor.fullName}
          </p>
          {registration ? (
            <p className="text-muted-foreground text-xs">Reg. No. {registration}</p>
          ) : null}
          <p className="text-muted-foreground text-xs">Signature</p>
        </div>
      </footer>
    </article>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-muted-foreground text-[10px] font-semibold tracking-[0.08em] uppercase">
        {label}
      </span>
      <span lang={lang(value)} className="font-semibold tabular-nums">
        {value}
      </span>
    </div>
  );
}

function Block({ label, value }: { label: string; value: string }) {
  return (
    <section className="border-border border-b py-2.5">
      <span className="text-muted-foreground text-[10px] font-semibold tracking-[0.08em] uppercase">
        {label}
      </span>
      <p lang={lang(value)} className="mt-1">
        {value}
      </p>
    </section>
  );
}

function DrugRows({
  drug,
  index,
  first,
}: {
  drug: PrescriptionDrug;
  index: number;
  first: boolean;
}) {
  const form = (drug.form ?? "").trim();
  const route = (drug.route ?? "").trim();
  const instructions = (drug.instructions ?? "").trim();
  const note = route || instructions;
  const edge = first ? "" : "border-border border-t";

  return (
    <>
      <tr className="break-inside-avoid">
        <td className={`text-muted-foreground w-8 py-1.5 pr-2 align-top tabular-nums ${edge}`}>
          {index}
        </td>
        <td lang={lang(drug.name)} className={`py-1.5 pr-2 align-top font-semibold ${edge}`}>
          {form ? `${drug.name.trim()} (${form})` : drug.name.trim()}
        </td>
        <Cell value={drug.strength} edge={edge} />
        <Cell value={drug.frequency} edge={edge} />
        <Cell value={drug.duration} edge={edge} />
      </tr>
      {note ? (
        <tr className="break-inside-avoid">
          <td />
          <td colSpan={4} lang={lang(note)} className="text-muted-foreground pb-1.5">
            {route ? (
              <>
                <span className="font-semibold">Route:</span> {route}
              </>
            ) : null}
            {route && instructions ? " · " : null}
            {instructions ? (
              <>
                <span className="font-semibold">Instructions:</span> {instructions}
              </>
            ) : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}

/** An em dash, never a guess: a blank cell reads as "nothing was prescribed". */
function Cell({ value, edge }: { value: string | null; edge: string }) {
  const text = (value ?? "").trim();
  return (
    <td lang={lang(text)} className={`py-1.5 pr-2 align-top ${edge}`}>
      {text || "—"}
    </td>
  );
}
