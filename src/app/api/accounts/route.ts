import { NextResponse } from "next/server";

import { ApiError, readBody, requireString, withDoctor } from "@/lib/api/http";
import { shiftDays, startOfDayInIndia } from "@/lib/analytics";
import { todayInIndia } from "@/lib/format";
import { callWorkflow } from "@/lib/supabase/workflows";
import type { AccountEntry } from "@/lib/types";

export const runtime = "nodejs";

interface AccountRow extends Omit<AccountEntry, "amount_paise"> {
  amount_paise: number | string;
  total_count?: number | string;
}

interface SummaryRow {
  received_paise: number | string;
  pending_paise: number | string;
  expenses_paise: number | string;
  net_paise: number | string;
}

interface CreateAccountEntryBody {
  kind?: unknown;
  status?: unknown;
  amount?: unknown;
  category?: unknown;
  paymentMethod?: unknown;
  counterparty?: unknown;
  note?: unknown;
  occurredAt?: unknown;
  patientId?: unknown;
  encounterId?: unknown;
  idempotencyKey?: unknown;
}

/** GET /api/accounts?days=30&kind=income&status=paid&q=&limit=100&offset=0 */
export const GET = withDoctor(async ({ supabase, request }) => {
  const url = new URL(request.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 30, 1), 365);
  const kind = optionalChoice(url.searchParams.get("kind"), ["income", "expense"] as const, "kind");
  const status = optionalChoice(url.searchParams.get("status"), ["paid", "pending"] as const, "status");
  const query = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 100, 1), 200);
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
  if (query.length > 120) throw new ApiError("That search is too long.");

  const today = todayInIndia();
  const from = startOfDayInIndia(shiftDays(today, -(days - 1)));
  const to = startOfDayInIndia(shiftDays(today, 1));
  const [list, summary] = await Promise.all([
    callWorkflow<AccountRow[]>(supabase, "account_entries_search", {
      p_from: from,
      p_to: to,
      p_kind: kind,
      p_status: status,
      p_query: query || null,
      p_limit: limit,
      p_offset: offset,
    }),
    callWorkflow<SummaryRow[]>(supabase, "account_entries_summary", { p_from: from, p_to: to }),
  ]);

  if (list.error || summary.error) {
    console.error("[accounts/list] workflow failed", list.error ?? summary.error);
    throw new ApiError("Could not load accounts.", 500);
  }

  const rows = list.data ?? [];
  const totals = summary.data?.[0];
  return NextResponse.json({
    entries: rows.map(normaliseRow),
    summary: {
      received_paise: Number(totals?.received_paise ?? 0),
      pending_paise: Number(totals?.pending_paise ?? 0),
      expenses_paise: Number(totals?.expenses_paise ?? 0),
      net_paise: Number(totals?.net_paise ?? 0),
    },
    totalCount: Number(rows[0]?.total_count ?? 0),
    days,
    limit,
    offset,
  });
});

/** POST /api/accounts — add one income or expense ledger entry. */
export const POST = withDoctor(async ({ supabase, request }) => {
  const body = await readBody<CreateAccountEntryBody>(request);
  const kind = requiredChoice(body.kind, ["income", "expense"] as const, "kind");
  const status = requiredChoice(body.status ?? "paid", ["paid", "pending"] as const, "status");
  const amountPaise = parseAmountPaise(body.amount);
  const category = requireString(body.category, "category").trim();
  if (category.length > 120) throw new ApiError("The category is too long.");
  const paymentMethod = optionalChoice(
    body.paymentMethod,
    ["cash", "upi", "card", "bank_transfer", "other"] as const,
    "paymentMethod",
  );
  const counterparty = optionalText(body.counterparty, "counterparty", 300);
  const note = optionalText(body.note, "note", 2_000);
  const occurredAt = parseDate(body.occurredAt);
  const patientId = optionalUuid(body.patientId, "patientId");
  const encounterId = optionalUuid(body.encounterId, "encounterId");
  const idempotencyKey = optionalText(body.idempotencyKey, "idempotencyKey", 120);

  const { data, error } = await callWorkflow<AccountRow | AccountRow[]>(supabase, "create_account_entry", {
    p_kind: kind,
    p_status: status,
    p_amount_paise: amountPaise,
    p_category: category,
    p_payment_method: paymentMethod,
    p_counterparty: counterparty,
    p_note: note,
    p_occurred_at: occurredAt,
    p_patient_id: patientId,
    p_encounter_id: encounterId,
    p_idempotency_key: idempotencyKey,
  });
  if (error) {
    console.error("[accounts/create] workflow failed", error);
    if (error.code === "P0002") throw new ApiError("The linked patient or visit was not found.", 404);
    if (error.code === "23514") throw new ApiError("Check the account entry details.", 422);
    throw new ApiError("Could not save the account entry.", 500);
  }

  const entry = Array.isArray(data) ? data[0] : data;
  if (!entry) throw new ApiError("Could not save the account entry.", 500);
  return NextResponse.json({ entry: normaliseRow(entry) }, { status: 201 });
});

function normaliseRow(row: AccountRow): AccountEntry {
  return { ...row, amount_paise: Number(row.amount_paise) };
}

function parseAmountPaise(value: unknown): number {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new ApiError("Enter a valid amount with up to two decimal places.");
  const [rupees, paise = ""] = text.split(".");
  const amount = Number(rupees) * 100 + Number(paise.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 100_000_000_000) {
    throw new ApiError("Enter an amount greater than zero.");
  }
  return amount;
}

function parseDate(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  const date = text ? new Date(text) : new Date();
  if (Number.isNaN(date.getTime())) throw new ApiError("The entry date is invalid.");
  return date.toISOString();
}

function optionalText(value: unknown, field: string, max: number): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new ApiError(`\`${field}\` must be text.`);
  const text = value.trim();
  if (text.length > max) throw new ApiError(`\`${field}\` is too long.`);
  return text || null;
}

function optionalUuid(value: unknown, field: string): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !UUID.test(value)) throw new ApiError(`\`${field}\` is invalid.`);
  return value;
}

function requiredChoice<const T extends readonly string[]>(value: unknown, choices: T, field: string): T[number] {
  if (typeof value !== "string" || !choices.includes(value)) throw new ApiError(`\`${field}\` is invalid.`);
  return value as T[number];
}

function optionalChoice<const T extends readonly string[]>(value: unknown, choices: T, field: string): T[number] | null {
  if (value == null || value === "" || value === "all") return null;
  return requiredChoice(value, choices, field);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
