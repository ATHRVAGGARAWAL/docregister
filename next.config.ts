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

  // Dev only. Next blocks cross-origin requests to dev assets, so opening the
  // Network URL that `next dev` prints — the obvious way to try the app on a
  // real phone — serves the SSR HTML but 403s every `/_next/static/chunks/*`.
  // React then never hydrates: the page looks right and every control is dead,
  // including the record key, which fails with no error because no handler is
  // attached to fail. Private ranges only; this list is not consulted in a
  // production build.
  allowedDevOrigins: [
    "192.168.*.*",
    "172.16.*.*",
    "172.17.*.*",
    "172.18.*.*",
    "172.19.*.*",
    "10.*.*.*",
    "*.local",
  ],

  async headers() {
    return [
      { source: "/_next/static/:path*", headers: staticHeaders },
      { source: "/worklets/:path*", headers: staticHeaders },
      { source: "/favicon.ico", headers: staticHeaders },
      // The manifest and its icons are now excluded from the auth proxy so a
      // browser can read them uncredentialed. That exclusion also means they no
      // longer inherit the proxy's security headers, so they are given them
      // here rather than being the only unprotected responses on the origin.
      { source: "/manifest.webmanifest", headers: staticHeaders },
      { source: "/icons/:path*", headers: staticHeaders },
    ];
  },
};

export default nextConfig;
