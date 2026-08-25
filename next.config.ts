import type { NextConfig } from "next";

import { securityHeaders } from "./src/lib/security/headers";

const dev = process.env.NODE_ENV === "development";

/**
 * The proxy (`src/proxy.ts`) is what sets the CSP, because the nonce has to be
 * minted per request. But the proxy's matcher deliberately skips static assets
 * so an icon does not cost an auth round trip — which leaves those responses
 * with no headers at all. This puts the non-nonce half of the policy back on
 * them: a JavaScript chunk served without `nosniff`, or a font served without a
 * cross-origin policy, is still worth closing.
 */
const staticHeaders = Object.entries(securityHeaders({ dev })).map(([key, value]) => ({
  key,
  value,
}));

const nextConfig: NextConfig = {
  // `X-Powered-By: Next.js` tells a scanner which framework and, combined with
  // the chunk layout, roughly which version. Nothing here needs to advertise.
  poweredByHeader: false,

  async headers() {
    return [
      { source: "/_next/static/:path*", headers: staticHeaders },
      { source: "/worklets/:path*", headers: staticHeaders },
      { source: "/favicon.ico", headers: staticHeaders },
    ];
  },
};

export default nextConfig;
