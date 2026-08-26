import { NextResponse } from "next/server";

import { ApiError, readBody, withDoctor } from "@/lib/api/http";
import { callWorkflow } from "@/lib/supabase/workflows";
import type { AccountEntry, AccountEntryStatus } from "@/lib/types";

type Params = { id: string };

interface AccountRow extends Omit<AccountEntry, "amount_paise"> {
  amount_paise: number | string;
}

/** PATCH /api/accounts/[id] — currently limited to payment status changes. */
export const PATCH = withDoctor<Params>(async ({ supabase, request, params }) => {
  if (!UUID.test(params.id)) throw new ApiError("Account entry id is invalid.");
  const body = await readBody<{ status?: unknown }>(request);
  if (body.status !== "paid" && body.status !== "pending") {
    throw new ApiError("Status must be paid or pending.");
  }

  const { data, error } = await callWorkflow<AccountRow | AccountRow[]>(supabase, "update_account_entry_status", {
    p_entry_id: params.id,
    p_status: body.status satisfies AccountEntryStatus,
  });
  if (error) {
    console.error("[accounts/status] workflow failed", error);
    if (error.code === "P0002") throw new ApiError("Account entry not found.", 404);
    throw new ApiError("Could not update the account entry.", 500);
  }
  const entry = Array.isArray(data) ? data[0] : data;
  if (!entry) throw new ApiError("Account entry not found.", 404);
  return NextResponse.json({ entry: { ...entry, amount_paise: Number(entry.amount_paise) } });
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
