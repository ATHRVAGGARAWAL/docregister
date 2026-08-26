import { NextResponse } from "next/server";

import { ApiError, withDoctor } from "@/lib/api/http";

/**
 * GET /api/patients/match?name=…&phone=…&limit=…
 * -> { matches: [{ id, full_name, phone, age_years, last_visit, visit_count, score }] }
 *
 * Powers the "is this the same Sunita Devi?" step in the review sheet.
 *
 * The ranking lives in Postgres (`match_patients`), not here: an exact phone
 * match outranks any name similarity, and trigram similarity handles the rest.
 * Spoken names arrive transliterated and inconsistent — Sunita/Suneeta,
 * Rajesh/Rajeshji — which is exactly what pg_trgm is good at and exactly what
 * an equality check is not.
 */

export const GET = withDoctor(async ({ supabase, request }) => {
  const url = new URL(request.url);
  const name = url.searchParams.get("name")?.trim() ?? "";
  const phone = url.searchParams.get("phone")?.trim() || null;
  const limit = Math.min(Number(url.searchParams.get("limit")) || 8, 25);

  if (!name && !phone) return NextResponse.json({ matches: [] });

  const { data, error } = await supabase.rpc("match_patients", {
    p_name: name,
    p_phone: phone ?? undefined,
    p_limit: limit,
  });

  if (error) {
    console.error("[patients/match]", error);
    // An empty list is a real answer here — "nobody by that name is on file" —
    // and it is the answer the caller acts on by starting a new chart. Handing
    // it back for a search that never ran means a failed lookup ends as a
    // duplicate chart for a patient the clinic already has, with the visit
    // history split across two records. A caller cannot recover from what it
    // cannot see, so the failure is reported as one.
    throw new ApiError("Could not search the patient list. Try again.", 500);
  }

  return NextResponse.json({ matches: data ?? [] });
}, { rateLimit: "match" });
