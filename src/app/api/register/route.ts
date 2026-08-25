import { NextResponse } from "next/server";

import { ApiError, withDoctor } from "@/lib/api/http";
import { searchRegister } from "@/lib/register";

/**
 * GET /api/register?days=30&q=&status=committed|draft&limit=50&offset=0
 * -> { entries, totalCount, totalFees, committed/draft totals, pagination }
 *
 * Filtering happens in Postgres. An earlier version loaded a capped page and
 * filtered it here, so a search silently never looked past the newest 300
 * encounters and the workspace's rupee total was the sum of that page rather
 * than of the query.
 */
export const GET = withDoctor(async ({ doctor, supabase, request }) => {
  const url = new URL(request.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 30, 1), 365);
  const query = url.searchParams.get("q") ?? "";
  const status = url.searchParams.get("status");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 100);
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

  if (status !== null && status !== "draft" && status !== "committed") {
    throw new ApiError("`status` must be `draft` or `committed`.");
  }
  if (query.length > 120) {
    throw new ApiError("That search is too long.");
  }

  const result = await searchRegister(supabase, doctor.id, { days, query, status, limit, offset });

  return NextResponse.json({
    ...result,
    days,
    hasMore: offset + result.entries.length < result.totalCount,
  });
}, { rateLimit: "match" });
