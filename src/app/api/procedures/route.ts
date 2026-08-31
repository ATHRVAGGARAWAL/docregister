import { NextResponse } from "next/server";

import { withDoctor } from "@/lib/api/http";
import { callWorkflow } from "@/lib/supabase/workflows";

export interface CatalogueProcedure {
  id: string;
  code: string;
  name: string;
  default_scope: string;
  default_price_paise: number;
  default_sittings: number;
  tooth_effect: string;
}

/**
 * GET /api/procedures — the clinic's procedure list.
 *
 * Seeds on first read. 0024 chose lazy seeding over doing it at clinic creation
 * because the alternative meant editing `handle_new_doctor()`'s SECURITY DEFINER
 * body at three separate call sites in 0023 — but lazy seeding only works if
 * something actually reads, and until this route existed nothing did. A clinic
 * would have had an empty catalogue forever, every procedure would have been
 * stored with a null `catalogue_id`, and the dental chart would have shown an
 * unmarked mouth no matter how much work was recorded, because `tooth_effect`
 * is read through that link.
 *
 * `ensure` and `list` are two calls on purpose: `list_procedure_catalogue` is
 * declared `stable`, which is a promise that it does not write, and folding the
 * seed into it would make that promise false — a `stable` function that writes
 * is accepted by PostgreSQL and then miscompiles under a plan that calls it
 * fewer times than written.
 */
export const GET = withDoctor(async ({ supabase }) => {
  const { error: seedError } = await callWorkflow<null>(
    supabase,
    "ensure_procedure_catalogue",
    {},
  );
  if (seedError) {
    // Non-fatal. An established clinic already has its rows, and a clinic that
    // does not gets an empty list it can still type past — the procedure name
    // is free text and the catalogue is a convenience, not a gate.
    console.error("[procedures] seed failed", seedError);
  }

  const { data, error } = await callWorkflow<CatalogueProcedure[]>(
    supabase,
    "list_procedure_catalogue",
    { p_include_inactive: false },
  );
  if (error) {
    console.error("[procedures] list failed", error);
    return NextResponse.json({ procedures: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json(
    { procedures: data ?? [] },
    { headers: { "Cache-Control": "no-store" } },
  );
});
