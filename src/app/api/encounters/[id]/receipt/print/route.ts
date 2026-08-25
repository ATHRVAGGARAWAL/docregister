import { NextResponse } from "next/server";

import { ApiError, withDoctor } from "@/lib/api/http";
import { loadEncounterDetails } from "@/lib/encounter-details";
import { renderReceiptHtml } from "@/lib/outputs/print-html";
import { callWorkflow } from "@/lib/supabase/workflows";

type Params = { id: string };

/** GET /api/encounters/[id]/receipt/print — audited, print-friendly receipt. */
export const runtime = "nodejs";

export const GET = withDoctor<Params>(async ({ doctor, supabase, params }) => {
  if (!isUuid(params.id)) throw new ApiError("Visit id is invalid.");
  let payload;
  try {
    payload = await loadEncounterDetails(supabase, params.id, doctor.clinic_id);
  } catch (error) {
    console.error("[outputs/receipt] lookup failed", error);
    throw new ApiError("Could not prepare the receipt.", 500);
  }
  if (!payload) throw new ApiError("Visit not found.", 404);
  if (payload.encounter.status !== "committed") {
    throw new ApiError("Only saved visits can be printed.", 409);
  }

  const { error: auditError } = await callWorkflow<null>(supabase, "log_sensitive_access", {
    p_action: "export",
    p_entity: "encounter",
    p_entity_id: params.id,
    p_detail: { surface: "receipt_print", format: "html" },
  });
  if (auditError) {
    console.error("[outputs/receipt] audit failed", auditError);
    throw new ApiError("Could not prepare the receipt.", 500);
  }

  return new NextResponse(renderReceiptHtml(payload), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="receipt-${params.id}.html"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
});

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
