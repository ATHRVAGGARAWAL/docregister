import { NextResponse } from "next/server";

import { withDoctor } from "@/lib/api/http";

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
    p_name: name || null,
    p_phone: phone,
    p_limit: limit,
  });

  if (error) {
    console.error("[patients/match]", error);
    return NextResponse.json({ matches: [] });
  }

  return NextResponse.json({ matches: data ?? [] });
}, { rateLimit: "match" });
