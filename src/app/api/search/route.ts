import { NextResponse } from "next/server";

import { ApiError, withDoctor } from "@/lib/api/http";
import {
  searchEverything,
  SEARCH_GROUP_CAP,
  SEARCH_GROUP_CAP_MAX,
  SEARCH_QUERY_MAX_LENGTH,
} from "@/lib/search";

export const runtime = "nodejs";

/**
 * GET /api/search?q=&limit=8
 * -> { query, groups: [{ key, hits, totalCount, truncated, unavailable }],
 *      totalCount, truncated, unavailable }
 *
 * The whole clinic behind one box: charts, visits and the ledger, ranked by
 * type and then by recency, capped per group. `groups` is always all three in
 * rank order, so the interface can render fixed sections instead of guessing
 * which ones came back.
 *
 * `rateLimit: "match"` rather than a bucket of its own, for the reason
 * `/api/patients` gives: the action names are a closed set, and a new one
 * without a matching `rate_limit_policies` row falls to `consume_rate_limit`'s
 * conservative default and starts refusing this route after ten requests an
 * hour — which for a search box is one sentence of typing. Sharing the lookup
 * bucket is also honest, since this enumerates the same tables `match` covers.
 *
 * The token is spent by `withDoctor` before this runs, so a client should not
 * call with an empty `q`: it answers with empty groups either way, but the
 * request is not free. Debounce, and skip the call when the box is cleared.
 */
export const GET = withDoctor(async ({ doctor, supabase, request }) => {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";

  // `Number(null)` is 0 and `Number("abc")` is NaN; both fall to the default
  // through `||`. `Math.min` is what stops "1e999", which parses to Infinity.
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit")) || SEARCH_GROUP_CAP, 1),
    SEARCH_GROUP_CAP_MAX,
  );

  if (query.length > SEARCH_QUERY_MAX_LENGTH) {
    throw new ApiError("That search is too long.");
  }

  return NextResponse.json(await searchEverything(supabase, doctor.id, { query, limit }));
}, { rateLimit: "match" });
