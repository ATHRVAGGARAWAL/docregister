/**
 * Public liveness endpoint for Vercel and external uptime checks.
 *
 * It intentionally does not query Supabase or any model provider. Those
 * dependencies have their own failure modes, while this route answers the
 * narrower question an operator needs first: can the deployed web process
 * receive a request and run a Route Handler?
 *
 * Keep the response free of build metadata, environment names and dependency
 * errors. This endpoint is public by design.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    {
      status: "ok",
      checkedAt: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
