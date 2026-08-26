"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  FileClock,
  Loader2,
  ShieldCheck,
  UserPlus,
} from "lucide-react";

import { PatientHistorySheet } from "@/components/patients/patient-history-sheet";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { PatientMatch, ReviewDraft, ReviewMedication, PatientSex } from "@/lib/encounters/review";
import {
  buildReviewChecklist,
  normalisePatientPhone,
  patientPhoneError,
  reviewFieldId,
} from "@/lib/encounters/review";
import { PATIENT_SEX_OPTIONS } from "@/lib/encounters/review";
import { formatVisitDay, maskPhone } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MedicationEditor } from "@/components/voice/medication-editor";

/**
 * The confirmation step — the only place a dictated visit becomes a record.
 *
 * Everything upstream is a suggestion engine. The recogniser can mishear a
 * drug, and neither system knows which Sunita
 * Devi this is. So this sheet is not a formality to click through: uncertain
 * fields are visibly marked, the patient is chosen rather than guessed, and
 * nothing is written until the doctor presses save.
 *
 * It opens as a sheet rather than a modal dialog because it is the natural
 * continuation of a gesture that started at the bottom of the screen — and it
 * is built on Radix Dialog, so focus is trapped and restored, the register
 * behind it is inert, and Escape discards. Tabbing out of a half-reviewed visit
 * into the list underneath is how a doctor signs off on the wrong patient.
 */
export function ReviewSheet({
  draft,
  onCommitted,
  onDiscard,
}: {
  draft: ReviewDraft;
  onCommitted: () => void;
  onDiscard: () => void;
}) {
  const [name, setName] = useState(draft.extraction.patient_name ?? "");
  const [age, setAge] = useState(draft.extraction.age_years?.toString() ?? "");
  const [diagnosis, setDiagnosis] = useState(draft.extraction.diagnosis ?? "");
  const [treatment, setTreatment] = useState(draft.extraction.treatment ?? "");
  const [phone, setPhone] = useState(draft.patientIdentity?.phone ?? "");
  const [sex, setSex] = useState<PatientSex | "">(draft.patientIdentity?.sex ?? "");
  const [drugs, setDrugs] = useState<ReviewMedication[]>(draft.extraction.prescription);
  const [patient, setPatient] = useState<PatientMatch | null>(null);
  const [patientCandidates, setPatientCandidates] = useState(draft.suggestedPatients);
  const [matching, setMatching] = useState(false);
  const [historyPatient, setHistoryPatient] = useState<PatientMatch | null>(null);
  const [asNew, setAsNew] = useState(draft.suggestedPatients.length === 0);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [draftVersion, setDraftVersion] = useState<number>(() => {
    const version = (draft as ReviewDraft & { version?: number }).version;
    return Number.isInteger(version) && version! > 0 ? version! : 1;
  });
  const [autosaveState, setAutosaveState] = useState<"saved" | "saving" | "error" | "conflict">("saved");
  const autosaveStateRef = useRef<"saved" | "saving" | "error" | "conflict">("saved");
  const skipNextAutosaveRef = useRef(false);
  const firstAutosave = useRef(true);

  // Stable across retries so a double-tap on a slow connection commits once.
  //
  // Generated in a lazy initialiser rather than during render, and with a
  // fallback. `crypto.randomUUID` is gated on a secure context, so on
  // http://<lan-ip>:3000 — the origin this repo's own README documents for
  // testing on a phone — calling it at render time threw inside render, with no
  // error boundary above it, and white-screened the sheet *after* the doctor had
  // already finished dictating. The value only has to be unique per mount, not
  // unguessable, so a non-crypto fallback is the right trade against losing the
  // consultation.
  const [idempotencyKey] = useState(newIdempotencyKey);
  const [uncertain, setUncertain] = useState(() =>
    new Set(buildReviewChecklist(draft.extraction).map((item) => item.key)),
  );
  const [reviewedKeys, setReviewedKeys] = useState<Set<string>>(new Set());
  const checklist = useMemo(
    () => buildReviewChecklist({ ...draft.extraction, uncertain_fields: [...uncertain] }),
    [draft.extraction, uncertain],
  );
  const [reviewIndex, setReviewIndex] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [rawText, setRawText] = useState(draft.rawText);
  const [romanText, setRomanText] = useState(draft.romanText);
  const [degraded, setDegraded] = useState(draft.degraded);

  // Has the doctor put anything of their own into this sheet? Only used to
  // decide whether an accidental dismissal is allowed to throw the visit away
  // without asking — picking a chart counts, because that is a decision the
  // extraction did not make for them.
  const isDirty =
    name !== (draft.extraction.patient_name ?? "") ||
    age !== (draft.extraction.age_years?.toString() ?? "") ||
    diagnosis !== (draft.extraction.diagnosis ?? "") ||
    treatment !== (draft.extraction.treatment ?? "") ||
    drugs !== draft.extraction.prescription ||
    phone !== (draft.patientIdentity?.phone ?? "") ||
    sex !== (draft.patientIdentity?.sex ?? "") ||
    patient !== null;

  // Re-run matching whenever the doctor changes the identity evidence. A
  // selected chart is cleared if the new shortlist no longer contains it;
  // this prevents a stale selection surviving a phone/name correction.
  useEffect(() => {
    const query = name.trim();
    const normalisedPhone = normalisePatientPhone(phone);
    if (!query && !normalisedPhone) {
      const timer = setTimeout(() => {
        setPatientCandidates([]);
        setPatient(null);
        setAsNew(true);
      }, 0);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(async () => {
      setMatching(true);
      try {
        const params = new URLSearchParams();
        if (query) params.set("name", query);
        if (normalisedPhone) params.set("phone", normalisedPhone);
        const response = await fetch(`/api/patients/match?${params.toString()}`);
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error ?? "Could not search patient charts.");
        const next = Array.isArray(body.matches) ? (body.matches as PatientMatch[]) : [];
        setPatientCandidates(next);
        // Identity evidence changed, so require an explicit re-selection even
        // when the old chart remains in the new shortlist.
        setPatient(null);
        setAsNew(next.length === 0);
      } catch {
        // Keep the last shortlist visible; save still requires an explicit
        // choice, so a failed lookup cannot silently link a chart.
      } finally {
        setMatching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [name, phone]);

  function markReviewed(key: string) {
    if (!uncertain.has(key)) return;
    setReviewedKeys((current) => new Set(current).add(key));
  }

  function focusReviewItem(index: number) {
    const item = checklist[index];
    if (!item) return;
    setReviewIndex(index);
    markReviewed(item.key);
    requestAnimationFrame(() => document.getElementById(item.targetId)?.focus());
  }

  async function retryFromAudio() {
    if (!draft.transcriptId || retrying) return;
    setRetrying(true);
    setRetryError(null);
    try {
      const response = await fetch(`/api/drafts/${draft.encounterId}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error ?? "Could not retry transcription.");
      setRawText(body.rawText ?? rawText);
      setRomanText(body.romanText ?? null);
      setDegraded(Boolean(body.degraded));
      if (body.extraction) {
        setName(body.extraction.patient_name ?? "");
        setAge(body.extraction.age_years?.toString() ?? "");
        setDiagnosis(body.extraction.diagnosis ?? "");
        setTreatment(body.extraction.treatment ?? "");
        setDrugs(body.extraction.prescription ?? []);
        const nextUncertain = new Set(
          buildReviewChecklist(body.extraction).map((item) => item.key),
        );
        setUncertain(nextUncertain);
        setReviewedKeys(new Set());
        setReviewIndex(0);
      }
    } catch (error) {
      setRetryError(error instanceof Error ? error.message : "Could not retry transcription.");
    } finally {
      setRetrying(false);
    }
  }

  const draftPayload = useMemo(
    () => ({
      expectedVersion: draftVersion,
      patient_name_spoken: name.trim(),
      age_years: parseNumber(age),
      diagnosis: diagnosis.trim() || null,
      treatment: treatment.trim() || null,
      prescription: drugs,
    }),
    [age, diagnosis, draftVersion, drugs, name, treatment],
  );

  // Voice capture already creates the draft server-side. Once a doctor starts
  // correcting it, keep a recoverable copy every 600ms; a phone call or tab
  // switch should not erase ten careful field edits.
  useEffect(() => {
    if (firstAutosave.current) {
      firstAutosave.current = false;
      return;
    }
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return;
    }
    if (!isDirty || autosaveStateRef.current === "conflict") return;
    const timer = setTimeout(async () => {
      autosaveStateRef.current = "saving";
      setAutosaveState("saving");
      try {
        const response = await fetch(`/api/drafts/${draft.encounterId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draftPayload),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (response.status === 409) {
            autosaveStateRef.current = "conflict";
            setAutosaveState("conflict");
          }
          throw new Error(body?.error ?? "Could not autosave this draft.");
        }
        skipNextAutosaveRef.current = true;
        setDraftVersion(Number(body.version ?? draftVersion + 1));
        autosaveStateRef.current = "saved";
        setAutosaveState("saved");
      } catch {
        if (autosaveStateRef.current !== "conflict") {
          autosaveStateRef.current = "error";
          setAutosaveState("error");
        }
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [draft.encounterId, draftPayload, draftVersion, isDirty]);

  async function save() {
    if (!name.trim()) {
      setFailure("A patient name is required.");
      return;
    }
    if (!patient && !asNew) {
      setFailure("Choose the patient, or add them as new.");
      return;
    }
    if (!isNumericField(age)) {
      setFailure("Age must be a number, or left blank.");
      return;
    }
    const phoneIssue = patientPhoneError(phone);
    if (phoneIssue) {
      setFailure(phoneIssue);
      return;
    }

    setSaving(true);
    setFailure(null);

    try {
      const patch = await fetch(`/api/drafts/${draft.encounterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftPayload),
      });
      if (!patch.ok) throw new Error(await errorMessage(patch, "Could not save edits."));
      const saved = await patch.json().catch(() => ({}));
      skipNextAutosaveRef.current = true;
      setDraftVersion(Number(saved.version ?? draftVersion + 1));

      const commit = await fetch(`/api/encounters/${draft.encounterId}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: patient?.id,
          newPatient: patient
            ? undefined
            : {
                full_name: name.trim(),
                phone: normalisePatientPhone(phone),
                age_years: parseNumber(age),
                sex: sex || null,
              },
          idempotencyKey,
        }),
      });
      if (!commit.ok) throw new Error(await errorMessage(commit, "Could not save the visit."));

      navigator.vibrate?.([8, 40, 8]);
      onCommitted();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Could not save the visit.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Sheet
        open
        onOpenChange={(next) => {
          if (next || historyPatient) return;
          // Radix closes on Escape and on an outside pointer-down by default,
          // and closing routes straight to `onDiscard`, which DELETEs the
          // encounter. On a phone that put an irreversible delete one mistimed
          // tap beside the sheet away, with no confirm and no undo, on a visit
          // the doctor had already reviewed. Dismissing is now only a discard
          // when there is nothing to lose.
          if (!isDirty || confirmDiscard()) onDiscard();
        }}
      >
      {/* No `aria-label` here: the sheet has a real `SheetTitle`, and an
          aria-label on the container would win over it and announce a second,
          slightly different name for the same dialog. */}
      <SheetContent
        className="sm:max-w-2xl"
        // Escape and an outside tap are the two accidental paths to losing a
        // reviewed visit; the explicit Discard button in the footer is
        // unaffected by either. Outside-tap is refused outright rather than
        // prompted: on a phone the sheet occupies most of the screen and the
        // strip beside it is exactly where a thumb lands by mistake.
        onEscapeKeyDown={(event) => {
          if (isDirty && !confirmDiscard()) event.preventDefault();
        }}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <SheetHeader>
          <SheetTitle>Review &amp; confirm</SheetTitle>
          <SheetDescription>Check the clinical details before they enter the register.</SheetDescription>
        </SheetHeader>

        <Alert variant="default" role="note" className="mx-5 mb-3 w-auto shrink-0">
          <ShieldCheck className="mt-0.5 size-4 text-primary" aria-hidden />
          <AlertTitle>Not saved yet</AlertTitle>
          <AlertDescription>
            Transcription and extraction are suggestions. You remain the final reviewer.
          </AlertDescription>
        </Alert>

        {(draft.warnings.length > 0 || degraded || retryError) && (
          /* Warning stock: solid tinted card, full-strength border, and an icon.
             The three cues are redundant on purpose — this banner is the only
             thing standing between a bad transcription and a medical record. */
          <div className="border-warning/35 bg-warning/10 mx-5 mb-3 flex shrink-0 gap-2.5 rounded-lg border px-3.5 py-2.5">
            <AlertTriangle className="text-warning mt-0.5 size-4 shrink-0" aria-hidden />
            <ul className="text-foreground space-y-0.5 text-xs">
              {degraded && (
                <li>
                  Transcribed by the backup engine — accuracy on mixed-language speech
                  is lower than usual.
                </li>
              )}
              {draft.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
              {retryError && <li>{retryError}</li>}
            </ul>
          </div>
        )}

        {draft.transcriptId && (
          <div className="mx-5 mb-3 flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
            <p className="text-xs text-muted-foreground">
              Audio is retained temporarily if the transcription needs another pass.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={retryFromAudio} disabled={retrying}>
              {retrying ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
              {retrying ? "Retrying…" : "Retry from audio"}
            </Button>
          </div>
        )}

        {checklist.length > 0 && (
          <ReviewNavigator
            items={checklist}
            activeIndex={reviewIndex}
            reviewedKeys={reviewedKeys}
            onFocus={focusReviewItem}
          />
        )}

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-4">
          {/* ---- Patient ---------------------------------------------------- */}
          <Field label="Patient" flagged={uncertain.has("patient_name")}>
            <Input
              id={reviewFieldId("patient_name")}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                markReviewed("patient_name");
              }}
              autoComplete="off"
            />
          </Field>

          {(patientCandidates.length > 0 || asNew || matching) && (
            <PatientPicker
              candidates={patientCandidates}
              selectedId={patient?.id ?? null}
              asNew={asNew}
              onSelect={(match) => {
                setPatient(match);
                setAsNew(false);
              }}
              onSelectNew={() => {
                setAsNew(true);
                setPatient(null);
              }}
              onViewHistory={(match) => {
                setPatient(match);
                setAsNew(false);
                setHistoryPatient(match);
              }}
              matching={matching}
            />
          )}

          {asNew && (
            <div className="grid gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 sm:grid-cols-2">
              <Field label="New chart phone">
                <Input
                  id="review-new-patient-phone"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="Optional, helps avoid duplicate charts"
                />
              </Field>
              <Field label="Sex">
                <select
                  id="review-new-patient-sex"
                  value={sex}
                  onChange={(event) => setSex(event.target.value as PatientSex | "")}
                  className="well text-foreground h-10 w-full px-3 text-sm outline-none"
                >
                  <option value="">Not stated</option>
                  {PATIENT_SEX_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </Field>
            </div>
          )}

          <div className="max-w-48">
            <Field label="Age" flagged={uncertain.has("age_years")}>
              <Input
                id={reviewFieldId("age_years")}
                value={age}
                onChange={(event) => {
                  setAge(event.target.value);
                  markReviewed("age_years");
                }}
                inputMode="numeric"
                className="tnum"
              />
            </Field>
          </div>

          {/* A textarea, not an input, because this is the confirmation screen.
              A real spoken diagnosis — "Type 2 diabetes mellitus, poorly
              controlled; hypertension" — overflows a single line on a phone and
              a one-line input hides the overflow, so the doctor would be signing
              off on text they cannot see. It grows instead of scrolling. */}
          <Field label="Diagnosis" flagged={uncertain.has("diagnosis")}>
            <Textarea
              id={reviewFieldId("diagnosis")}
              value={diagnosis}
              onChange={(event) => {
                setDiagnosis(event.target.value);
                markReviewed("diagnosis");
              }}
              rows={2}
              className="resize-none"
            />
          </Field>

          <Field label="Treatment" flagged={uncertain.has("treatment")}>
            <Textarea
              id={reviewFieldId("treatment")}
              value={treatment}
              onChange={(event) => {
                setTreatment(event.target.value);
                markReviewed("treatment");
              }}
              rows={2}
              className="resize-none"
            />
          </Field>

          {/* ---- Prescription ------------------------------------------------ */}
          <MedicationEditor
            value={drugs}
            onChange={setDrugs}
            flaggedKeys={uncertain}
            reviewedKeys={reviewedKeys}
            onFieldChange={markReviewed}
          />

          {/* The evidence behind every field above. Provider output, never
              rewritten by the model that produced the structure. */}
          <div>
            <button
              type="button"
              onClick={() => setShowTranscript((open) => !open)}
              aria-expanded={showTranscript}
              className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
            >
              {showTranscript ? "Hide" : "Show"} what you said
            </button>
            <AnimatePresence>
              {showTranscript && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <p className="well text-foreground mt-2 p-3 text-xs leading-relaxed">
                    {rawText}
                    {romanText && romanText !== rawText && (
                      <span className="text-muted-foreground mt-2 block">{romanText}</span>
                    )}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <SheetFooter className="flex-col items-stretch gap-2">
          <p className="text-muted-foreground text-[11px]" aria-live="polite">
            {autosaveState === "saving" && "Saving draft…"}
            {autosaveState === "saved" && "Draft saved for recovery"}
            {autosaveState === "error" && "Autosave failed — your edits remain on screen"}
            {autosaveState === "conflict" && "This draft changed elsewhere — reload before saving"}
          </p>
          {failure && (
            <p role="alert" className="text-destructive text-xs">
              {failure}
            </p>
          )}
          <div className="flex gap-3">
            <Button variant="outline" size="lg" onClick={onDiscard}>
              Discard
            </Button>
            <Button size="lg" onClick={save} disabled={saving} className="flex-1">
              {saving ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Check className="size-4" aria-hidden />
              )}
              Confirm &amp; save
            </Button>
          </div>
        </SheetFooter>
        </SheetContent>
      </Sheet>

      <PatientHistorySheet
        patient={historyPatient}
        open={historyPatient !== null}
        onOpenChange={(open) => {
          if (!open) setHistoryPatient(null);
        }}
        onUsePatient={(match) => {
          setPatient(match);
          setAsNew(false);
          setHistoryPatient(null);
        }}
        onPatientUpdated={(updated) => {
          const applyUpdate = (match: PatientMatch): PatientMatch =>
            match.id === updated.id
              ? {
                  ...match,
                  full_name: updated.full_name,
                  phone: updated.phone,
                  age_years: updated.age_years,
                }
              : match;
          setPatientCandidates((current) => current.map(applyUpdate));
          setPatient((current) => (current ? applyUpdate(current) : current));
          setHistoryPatient((current) => (current ? applyUpdate(current) : current));
        }}
      />
    </>
  );
}

/**
 * Which chart does this visit belong to?
 *
 * This is the most dangerous control in the app. Everything else on this sheet
 * is a field the doctor can see is wrong — a misheard drug name looks like a
 * misheard drug name. Picking the wrong chart looks like picking the right one,
 * and the failure surfaces months later as a patient with someone else's
 * allergy history.
 *
 * It was a row of chips reading "Rajesh Kumar · last 24 Aug". In a clinic where
 * five Kumars were seen the same week, every chip says almost exactly that, and
 * the doctor is choosing between five identical labels. So each candidate now
 * carries the things that actually separate two people — age, the tail of their
 * phone number, how many times they have been in — and when two candidates
 * genuinely share a name, the sheet says so out loud instead of letting the
 * doctor discover it by squinting.
 *
 * Built on native radios rather than buttons. One choice out of a set is what a
 * radio group *is*: it gets arrow-key navigation, a single tab stop, and the
 * "3 of 6" announcement from the browser, none of which a row of
 * `aria-pressed` buttons provides. "New patient" is a member of the same group
 * because it is the same decision, and modelling it as a separate toggle is how
 * a sheet ends up with both a chart selected and "new" selected at once.
 */
function PatientPicker({
  candidates,
  selectedId,
  asNew,
  onSelect,
  onSelectNew,
  onViewHistory,
  matching,
}: {
  candidates: PatientMatch[];
  selectedId: string | null;
  asNew: boolean;
  onSelect: (match: PatientMatch) => void;
  onSelectNew: () => void;
  onViewHistory: (match: PatientMatch) => void;
  matching?: boolean;
}) {
  // Names that appear more than once in this shortlist. These are the rows
  // where a wrong pick is most likely and least visible.
  const collisions = useMemo(() => {
    const seen = new Map<string, number>();
    for (const candidate of candidates) {
      const key = candidate.full_name.trim().toLowerCase();
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    return new Set(
      [...seen.entries()].filter(([, count]) => count > 1).map(([name]) => name),
    );
  }, [candidates]);

  // The worst case: two charts with the same name and nothing on file to tell
  // them apart. Worth interrupting for, because no amount of detail in the rows
  // below can resolve it.
  const indistinguishable = useMemo(
    () =>
      [...collisions].some((name) =>
        candidates
          .filter((candidate) => candidate.full_name.trim().toLowerCase() === name)
          .every((candidate) => !candidate.phone && candidate.age_years == null),
      ),
    [candidates, collisions],
  );

  return (
    <fieldset>
      <legend className="text-muted-foreground text-xs">
        Which chart is this? Nothing is linked until you choose.
      </legend>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Open a chart to review the patient&rsquo;s complete recorded history before linking this visit.
        {matching && <span className="ml-2">Searching…</span>}
      </p>

      {indistinguishable && (
        <p
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-foreground mt-2 flex gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed"
        >
          <AlertTriangle className="text-destructive mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            Two charts share this name and neither has a phone number or age on file.
            Confirm with the patient before saving, or start a new chart.
          </span>
        </p>
      )}

      <ul className="mt-2 space-y-2">
        {candidates.map((match) => (
          <li key={match.id}>
            <PatientOption
              checked={selectedId === match.id}
              onSelect={() => onSelect(match)}
              title={match.full_name}
              collides={collisions.has(match.full_name.trim().toLowerCase())}
              detail={describe(match)}
              onOpenHistory={() => onViewHistory(match)}
            />
          </li>
        ))}
        <li>
          <PatientOption
            checked={asNew}
            onSelect={onSelectNew}
            title="Add as a new patient"
            detail="No existing chart — this starts one."
            icon={<UserPlus className="size-3.5" aria-hidden />}
          />
        </li>
      </ul>
    </fieldset>
  );
}

function ReviewNavigator({
  items,
  activeIndex,
  reviewedKeys,
  onFocus,
}: {
  items: { key: string; label: string }[];
  activeIndex: number;
  reviewedKeys: ReadonlySet<string>;
  onFocus: (index: number) => void;
}) {
  const nextIndex = items.findIndex((item) => !reviewedKeys.has(item.key));
  const targetIndex = nextIndex >= 0 ? nextIndex : Math.min(activeIndex, items.length - 1);
  return (
    <section aria-label="Fields to review" className="mx-5 mb-3 rounded-lg border border-warning/35 bg-warning/10 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium">Review flagged details</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {reviewedKeys.size} of {items.length} checked
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => onFocus(targetIndex)}>
          {nextIndex >= 0 ? "Review next" : "Review again"}
        </Button>
      </div>
      <ol className="mt-2 flex flex-wrap gap-1.5">
        {items.map((item, index) => (
          <li key={item.key}>
            <button
              type="button"
              onClick={() => onFocus(index)}
              className={cn(
                "rounded-full border px-2 py-1 text-[11px]",
                reviewedKeys.has(item.key)
                  ? "border-primary/30 text-primary"
                  : "border-warning/45 text-warning",
              )}
            >
              {reviewedKeys.has(item.key) ? "✓ " : ""}{item.label}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** "42 · ·····43210 · 7 visits · last 24 Aug", skipping whatever is unknown. */
function describe(match: PatientMatch): string {
  const parts: string[] = [];
  if (match.age_years != null) parts.push(`${match.age_years}y`);

  const phone = maskPhone(match.phone);
  if (phone) parts.push(phone);

  const visits = match.visit_count ?? 0;
  if (visits > 0) parts.push(`${visits} visit${visits === 1 ? "" : "s"}`);

  const last = formatVisitDay(match.last_visit);
  if (last) parts.push(`last ${last}`);

  return parts.length ? parts.join("  ·  ") : "No details on file";
}

/**
 * One row of the group.
 *
 * Selection is depth, not tint: the chosen row is pressed *into* the sheet and
 * the others stand proud of it. That is the same physical logic as the
 * segmented control on the dashboard, and it means "which patient did I pick"
 * survives being read in greyscale, in sunlight, on a cracked screen.
 */
function PatientOption({
  checked,
  onSelect,
  title,
  detail,
  collides,
  icon,
  onOpenHistory,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
  collides?: boolean;
  icon?: React.ReactNode;
  onOpenHistory?: () => void;
}) {
  const patientDetails = (
    <span className="min-w-0 flex-1">
      <span className="text-foreground flex items-center gap-1.5 text-sm font-medium">
        {icon}
        <span className="truncate">{title}</span>
        {collides && (
          <span className="border-warning/40 text-warning shrink-0 rounded-sm border px-1.5 py-0.5 text-[0.6875rem] leading-none font-normal">
            same name
          </span>
        )}
      </span>
      {/* Tabular figures so the ages and phone tails line up down the column
          and two rows can be compared by scanning rather than by reading. */}
      <span className="text-muted-foreground tnum mt-0.5 block text-xs">{detail}</span>
    </span>
  );

  return (
    <div
      className={cn(
        "pressable flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 transition-colors",
        // `:has()` rather than a JS focus handler: the ring belongs to the row,
        // the focus belongs to the input inside it, and the browser already
        // knows how to connect the two.
        "has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background",
        checked
          ? "border-primary/45 bg-primary/12 shadow-press"
          : "border-border bg-card shadow-flat hover:bg-secondary",
      )}
    >
      <label
        className={cn(
          "flex cursor-pointer items-center gap-3",
          onOpenHistory ? "shrink-0" : "min-w-0 flex-1",
        )}
      >
        <input
          type="radio"
          name="patient-chart"
          className="sr-only"
          checked={checked}
          onChange={onSelect}
          aria-label={`Select ${title}`}
        />

        {/* A real radio dial, drawn rather than borrowed, so it matches the
            material of everything around it. `aria-hidden` because the input it
            shadows is already announcing the state. */}
        <span
          aria-hidden
          className={cn(
            "grid size-4 shrink-0 place-items-center rounded-full border transition-colors",
            checked ? "border-primary bg-primary" : "border-border",
          )}
        >
          {checked && <span className="bg-primary-foreground size-1.5 rounded-full" />}
        </span>
        {!onOpenHistory && patientDetails}
      </label>

      {onOpenHistory && (
        <button
          type="button"
          onClick={() => {
            onSelect();
            onOpenHistory();
          }}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {patientDetails}
          <span className="hidden shrink-0 items-center gap-1 text-xs font-medium text-primary sm:flex">
            <FileClock className="size-4" aria-hidden />
            View chart
          </span>
          <ChevronRight className="size-4 shrink-0 text-primary" aria-hidden />
        </button>
      )}
    </div>
  );
}

function Field({
  label,
  flagged,
  children,
}: {
  label: string;
  flagged?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <Label
        asChild
        className="text-muted-foreground mb-1.5 text-[11px] tracking-[0.12em] uppercase"
      >
        <span>
          {label}
          {/* Flagged fields get a dot and a word — never colour alone. */}
          {flagged && (
            <span className="text-warning flex items-center gap-1 tracking-normal normal-case">
              <span className="bg-warning size-1.5 rounded-full" aria-hidden />
              check this
            </span>
          )}
        </span>
      </Label>
      {children}
    </label>
  );
}

/**
 * Unique per mount, and never throws.
 *
 * `crypto.randomUUID` only exists in a secure context. This app is documented
 * as testable over http on a LAN address, where it is undefined — so the
 * fallback is not defensive padding, it is the documented configuration.
 */
function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Blank means "not stated"; anything else has to be a real, finite number. */
function isNumericField(value: string): boolean {
  return value.trim() === "" || Number.isFinite(Number(value));
}

function parseNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A failed request does not promise a JSON body — a proxy 502 or an offline
 * browser returns HTML, and `.json()` then throws a SyntaxError that replaces
 * the message the doctor should have seen with a parser error.
 */
async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    return typeof body?.error === "string" ? body.error : fallback;
  } catch {
    return fallback;
  }
}

/**
 * The one place a reviewed visit can be thrown away by accident.
 *
 * `window.confirm` rather than a second nested dialog: this fires from inside
 * a Radix dismiss handler, where opening another Radix dialog fights the first
 * one's focus trap for ownership of the same unmount. A native confirm is
 * synchronous, which is exactly what a `preventDefault()` decision needs.
 */
function confirmDiscard(): boolean {
  if (typeof window === "undefined") return true;
  return window.confirm("Discard this visit? What you have entered will be lost.");
}
