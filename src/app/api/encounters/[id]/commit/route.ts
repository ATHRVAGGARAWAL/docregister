import { NextResponse } from "next/server";

import { ApiError, readBody, withDoctor } from "@/lib/api/http";
import { isFdiTooth, sortSurfaces } from "@/lib/dental/tooth";
import type { ReviewToothFinding } from "@/lib/encounters/review";
import { callWorkflow } from "@/lib/supabase/workflows";

/**
 * POST /api/encounters/[id]/commit
 * body: { patientId } | { newPatient: { full_name, phone?, age_years?, sex? } }
 * -> { encounterId, patientId, visitNumber, isNewPatient }
 *
 * Step 3 of 3, and the only place a dictated visit enters the register.
 *
 * This route exists as a distinct, explicit action because a human has to stand
 * behind every row. Everything upstream — the recogniser, the extractor, the
 * dosage table — is a suggestion engine. This is the signature.
 */

export const runtime = "nodejs";

type Params = { id: string };

interface CommitBody {
  patientId?: string;
  newPatient?: {
    full_name?: string;
    phone?: string | null;
    age_years?: number | null;
    sex?: string | null;
  };
  /** Client-generated, stable across retries. Guards double-taps on flaky 3G. */
  idempotencyKey?: string;
  /** Reviewed consultation amount. Written to Accounts, never the clinical row. */
  consultationFeeInr?: unknown;
  toothFindings?: unknown;
}

interface CommitResult {
  encounter_id: string;
  patient_id: string;
  visit_number: number | null;
  is_new_patient: boolean | null;
  already_committed: boolean;
  account_entry_id?: string | null;
}

interface AccountEntryResult {
  id: string;
}

export const POST = withDoctor<Params>(async ({ doctor, supabase, request, params }) => {
  const body = await readBody<CommitBody>(request);
  const idempotencyKey = body.idempotencyKey?.trim() || null;
  const amountPaise = optionalAmountPaise(body.consultationFeeInr);
  const toothFindings = parseToothFindings(body.toothFindings);

  if ((body.patientId == null) === (body.newPatient == null)) {
    throw new ApiError("Choose an existing patient or add a new one before saving.");
  }

  // Commit the clinical record first through the established patient-scoped
  // workflow. Accounts is deliberately attempted afterwards: a ledger problem
  // must never prevent a reviewed prescription reaching the correct chart.
  // The idempotency key makes a retry safe if the response is lost.
  const { data, error } = await callWorkflow<CommitResult[]>(
    supabase,
    "commit_encounter_workflow",
    {
      p_encounter_id: params.id,
      p_patient_id: body.patientId ?? null,
      p_new_patient: body.newPatient ?? null,
      p_idempotency_key: idempotencyKey,
    },
  );

  if (error) {
    console.error("[commit] workflow failed", error);
    if (error.code === "P0002") throw new ApiError("Encounter or patient not found.", 404);
    if (error.code === "23505" && error.details === "duplicate_phone_requires_confirmation") {
      throw new ApiError(
        "A patient with that phone already exists. Choose that chart explicitly or correct the number.",
        409,
      );
    }
    if (error.code === "23514") {
      throw new ApiError(
        error.message.includes("provisional")
          ? "The final transcript is still being saved. Try again in a moment."
          : "This draft can no longer be committed.",
        409,
      );
    }
    if (error.code === "40001") {
      throw new ApiError("That visit is already being saved. Give it a moment.", 409);
    }
    throw new ApiError("Could not save this visit to the register.", 500);
  }

  const result = data?.[0];
  if (!result) throw new ApiError("Could not save this visit to the register.", 500);

  const { data: savedEncounter, error: verificationError } = await supabase
    .from("encounters")
    .select("id, patient_id, status")
    .eq("id", result.encounter_id)
    .eq("doctor_id", doctor.id)
    .eq("clinic_id", doctor.clinic_id)
    .maybeSingle();
  const expectedPatientId = body.patientId ?? result.patient_id;
  if (
    verificationError ||
    !savedEncounter ||
    savedEncounter.id !== params.id ||
    savedEncounter.status !== "committed" ||
    savedEncounter.patient_id !== result.patient_id ||
    result.patient_id !== expectedPatientId
  ) {
    console.error("[commit] ownership verification failed", {
      code: verificationError?.code,
      requestedEncounterMatches: result.encounter_id === params.id,
      selectedPatientMatches: result.patient_id === expectedPatientId,
      rowVerified: Boolean(savedEncounter),
    });
    throw new ApiError("The saved visit could not be verified against the selected patient.", 503);
  }

  let accountEntryId: string | null = null;
  let accountEntryError = false;
  let toothFindingError = false;

  if (amountPaise !== null) {
    // Migration 0018 owns the visit-income source and clears the temporary fee
    // from the clinical JSON. Running it after the clinical commit makes an
    // Accounts failure non-fatal while retaining its idempotent behaviour.
    const income = await callWorkflow<CommitResult[]>(
      supabase,
      "commit_encounter_with_income_workflow",
      {
        p_encounter_id: params.id,
        p_patient_id: body.patientId ?? null,
        p_new_patient: body.newPatient ?? null,
        p_idempotency_key: idempotencyKey,
        p_amount_paise: amountPaise,
      },
    );
    const incomeResult = income.data?.[0];
    accountEntryId = incomeResult?.account_entry_id ?? null;

    if (income.error || !accountEntryId) {
      if (income.error) console.error("[commit] visit income workflow failed", income.error);
      const account = await callWorkflow<AccountEntryResult | AccountEntryResult[]>(
        supabase,
        "create_account_entry",
        {
          p_kind: "income",
          p_status: "paid",
          p_amount_paise: amountPaise,
          p_category: "Consultation",
          p_payment_method: null,
          p_counterparty: body.newPatient?.full_name?.trim() || null,
          p_note: "Captured from the reviewed visit amount",
          p_occurred_at: new Date().toISOString(),
          p_patient_id: result.patient_id,
          p_encounter_id: result.encounter_id,
          p_idempotency_key: `visit-${result.encounter_id}`,
        },
      );
      const entry = Array.isArray(account.data) ? account.data[0] : account.data;
      accountEntryId = entry?.id ?? null;
      accountEntryError = Boolean(account.error || !entry);
      if (account.error) console.error("[commit] fallback account entry failed", account.error);
    }
  }

  if (toothFindings.length > 0) {
    const table = supabase.from("tooth_findings");
    const { data: existing, error: existingError } = await table
      .select("id")
      .eq("encounter_id", result.encounter_id)
      .limit(1);

    if (existingError) {
      toothFindingError = true;
      console.error("[commit] tooth finding lookup failed", existingError);
    } else if (!existing?.length) {
      const observedAt = new Date().toISOString();
      const { error: findingError } = await table.insert(
        toothFindings.map((finding) => ({
          clinic_id: doctor.clinic_id,
          patient_id: result.patient_id,
          encounter_id: result.encounter_id,
          tooth_fdi: finding.tooth_fdi,
          surfaces: finding.surfaces,
          finding: finding.finding,
          state: finding.state,
          severity: finding.severity,
          note: finding.note,
          observed_at: observedAt,
          resolved_at: finding.state === "resolved" ? observedAt : null,
          recorded_by: doctor.id,
        })),
      );
      if (findingError) {
        toothFindingError = true;
        console.error("[commit] tooth findings save failed", findingError);
      }
    }
  }

  return NextResponse.json({
    encounterId: result.encounter_id,
    patientId: result.patient_id,
    visitNumber: result.visit_number,
    isNewPatient: result.is_new_patient,
    alreadyCommitted: result.already_committed,
    accountEntryId,
    accountEntryError,
    toothFindingError,
  });
}, { rateLimit: "commit" });

const FINDINGS = new Set([
  "sound", "caries", "fracture", "wear", "mobility", "periapical", "impacted",
  "missing", "restoration", "crown", "implant", "root_canal", "sealant", "other",
]);
const FINDING_STATES = new Set(["existing", "planned", "completed", "resolved"]);
const FINDING_SEVERITIES = new Set(["mild", "moderate", "severe"]);

function parseToothFindings(value: unknown): Array<{
  tooth_fdi: number;
  surfaces: string[];
  finding: ReviewToothFinding["finding"];
  state: ReviewToothFinding["state"];
  severity: ReviewToothFinding["severity"];
  note: string | null;
}> {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 64) {
    throw new ApiError("Tooth findings are invalid.");
  }

  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new ApiError(`Finding ${index + 1} is invalid.`);
    }
    const item = entry as Record<string, unknown>;
    const tooth = Number(item.tooth_fdi);
    if (!isFdiTooth(tooth)) throw new ApiError(`Finding ${index + 1} needs a valid tooth.`);
    if (typeof item.finding !== "string" || !FINDINGS.has(item.finding)) {
      throw new ApiError(`Finding ${index + 1} needs a valid condition.`);
    }
    const state = typeof item.state === "string" ? item.state : "existing";
    if (!FINDING_STATES.has(state)) throw new ApiError(`Finding ${index + 1} has an invalid status.`);
    const severity = item.severity == null || item.severity === "" ? null : String(item.severity);
    if (severity !== null && !FINDING_SEVERITIES.has(severity)) {
      throw new ApiError(`Finding ${index + 1} has an invalid severity.`);
    }
    const note = typeof item.note === "string" ? item.note.trim() : "";
    if (note.length > 1500) throw new ApiError(`Finding ${index + 1} note is too long.`);
    return {
      tooth_fdi: tooth,
      surfaces: sortSurfaces(Array.isArray(item.surfaces) ? item.surfaces.map(String) : []),
      finding: item.finding as ReviewToothFinding["finding"],
      state: state as ReviewToothFinding["state"],
      severity: severity as ReviewToothFinding["severity"],
      note: note || null,
    };
  });
}

function optionalAmountPaise(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
    throw new ApiError("Enter the consultation amount with up to two decimal places.");
  }
  const [rupees, paise = ""] = text.split(".");
  const amount = Number(rupees) * 100 + Number(paise.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 100_000_000) {
    throw new ApiError("Consultation amount must be between ₹0.01 and ₹10,00,000.");
  }
  return amount;
}
