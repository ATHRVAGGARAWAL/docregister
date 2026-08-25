import { NextResponse } from "next/server";

import { ApiError, withDoctor } from "@/lib/api/http";
import { loadEncounterDetails } from "@/lib/encounter-details";
import { renderPrescriptionHtml } from "@/lib/outputs/print-html";
import { callWorkflow } from "@/lib/supabase/workflows";

type Params = { id: string };

/**
 * GET /api/encounters/[id]/prescription/print
 *
 * Returns a self-contained, print-friendly HTML document. The source encounter
 * is still immutable; this output replays append-only corrections first and
 * records the export in the clinic audit log.
 */
export const runtime = "nodejs";

export const GET = withDoctor<Params>(async ({ doctor, supabase, params }) => {
  if (!isUuid(params.id)) throw new ApiError("Visit id is invalid.");
  const payload = await loadOutput(supabase, params.id, doctor.clinic_id);
  const { error: auditError } = await callWorkflow<null>(supabase, "log_sensitive_access", {
    p_action: "export",
    p_entity: "encounter",
    p_entity_id: params.id,
    p_detail: { surface: "prescription_print", format: "html" },
  });
  if (auditError) {
    console.error("[outputs/prescription] audit failed", auditError);
    throw new ApiError("Could not prepare the prescription.", 500);
  }

  return new NextResponse(renderPrescriptionHtml(payload), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="prescription-${params.id}.html"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
});

async function loadOutput(
  supabase: Parameters<typeof loadEncounterDetails>[0],
  encounterId: string,
  clinicId: string,
) {
  let payload;
  try {
    payload = await loadEncounterDetails(supabase, encounterId, clinicId);
  } catch (error) {
    console.error("[outputs/prescription] lookup failed", error);
    throw new ApiError("Could not prepare the prescription.", 500);
  }
  if (!payload) throw new ApiError("Visit not found.", 404);
  if (payload.encounter.status !== "committed") {
    throw new ApiError("Only saved visits can be printed.", 409);
  }
  return payload;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
