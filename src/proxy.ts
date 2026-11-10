import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";
import { buildCsp, securityHeaders } from "@/lib/security/headers";

const withClerk = clerkMiddleware();

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const dev = process.env.NODE_ENV === "development";
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, { dev });
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", csp);
  // Health checks still answer when the identity provider is unavailable.
  const response = request.nextUrl.pathname === "/api/health"
    ? NextResponse.next({ request: { headers: request.headers } })
    : await withClerk(request, event) ?? NextResponse.next();
  // Clerk forwards auth headers using a rewrite to the same URL. Next 16.3
  // may treat that absolute URL as an external proxy target. Resume locally
  // while retaining Clerk's request-header overrides.
  if (response.headers.get("x-middleware-rewrite") === request.url) {
    response.headers.delete("x-middleware-rewrite");
    response.headers.set("x-middleware-next", "1");
  }
  response.headers.set("Content-Security-Policy", csp);
  for (const [key, value] of Object.entries(securityHeaders({ dev }))) {
    response.headers.set(key, value);
  }
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|worklets|models|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?|webmanifest)$).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
