import { NextResponse } from "next/server";

import { ApiError, readBody, withDoctor } from "@/lib/api/http";
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

export const POST = withDoctor<Params>(async ({ supabase, request, params }) => {
  const body = await readBody<CommitBody>(request);
  const idempotencyKey = body.idempotencyKey?.trim() || null;
  const amountPaise = optionalAmountPaise(body.consultationFeeInr);

  if ((body.patientId == null) === (body.newPatient == null)) {
    throw new ApiError("Choose an existing patient or add a new one before saving.");
  }

  // Idempotency claim, optional patient creation, patient locking, visit-number
  // assignment and the draft-to-committed transition all happen in this single
  // transaction. A duplicate phone is deliberately a conflict: a number is a
  // search hint, never enough evidence to silently attach a visit to a chart.
  let { data, error } = await callWorkflow<CommitResult[]>(
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

  let fallbackAccountEntryId: string | null = null;
  let accountEntryError = false;

  // Keep rolling deployments safe: Vercel may receive this route a few minutes
  // before migration 0018 reaches Supabase. The existing workflows still
  // complete the visit and create the linked Accounts row; once the migration
  // is installed, the same work happens atomically in PostgreSQL.
  if (error && (error.code === "PGRST202" || error.code === "42883")) {
    ({ data, error } = await callWorkflow<CommitResult[]>(supabase, "commit_encounter_workflow", {
      p_encounter_id: params.id,
      p_patient_id: body.patientId ?? null,
      p_new_patient: body.newPatient ?? null,
      p_idempotency_key: idempotencyKey,
    }));

    const committed = data?.[0];
    if (!error && committed && amountPaise !== null) {
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
          p_patient_id: committed.patient_id,
          p_encounter_id: committed.encounter_id,
          p_idempotency_key: `visit-${committed.encounter_id}`,
        },
      );
      const entry = Array.isArray(account.data) ? account.data[0] : account.data;
      fallbackAccountEntryId = entry?.id ?? null;
      accountEntryError = Boolean(account.error || !entry);
      if (account.error) console.error("[commit] fallback account entry failed", account.error);
    }
  }

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

  return NextResponse.json({
    encounterId: result.encounter_id,
    patientId: result.patient_id,
    visitNumber: result.visit_number,
    isNewPatient: result.is_new_patient,
    alreadyCommitted: result.already_committed,
    accountEntryId: result.account_entry_id ?? fallbackAccountEntryId,
    accountEntryError,
  });
}, { rateLimit: "commit" });

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
