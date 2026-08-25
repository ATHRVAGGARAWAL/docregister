/**
 * The HTTP security header set.
 *
 * Split out of `proxy.ts` so the policy is one readable object rather than a
 * template literal buried in a request handler, and so it can be asserted
 * against in `demo/_security-check.mjs` without booting the proxy.
 *
 * This app holds identifiable patient records — names, ages, diagnoses,
 * prescriptions — under India's DPDP Act and the ABDM Health Data Management
 * Policy. That raises the bar from "reasonable defaults" to "a doctor's clinic
 * network, a shared phone, and a browser extension the doctor installed for
 * something else are all in the threat model".
 */

/** Origins the browser is allowed to open a connection to. */
function connectOrigins(): string[] {
  const origins = new Set<string>(["'self'"]);

  // Supabase: PostgREST and GoTrue over https, realtime over wss. Derived from
  // the configured URL rather than a wildcard, so a compromised bundle cannot
  // exfiltrate to some other project on the same provider.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl) {
    try {
      const { host, protocol } = new URL(supabaseUrl);
      origins.add(`${protocol}//${host}`);
      origins.add(`${protocol === "https:" ? "wss:" : "ws:"}//${host}`);
    } catch {
      // A malformed URL is the app's problem to report elsewhere; here it just
      // means one fewer allowed origin, which fails closed.
    }
  }

  // The live-transcription proxy. It is a separate process on its own port, so
  // it is never covered by 'self'.
  const proxyUrl = process.env.NEXT_PUBLIC_STT_PROXY_URL ?? "ws://localhost:8787";
  try {
    const { host, protocol } = new URL(proxyUrl);
    origins.add(`${protocol}//${host}`);
  } catch {
    /* same as above */
  }

  return [...origins];
}

export function buildCsp(nonce: string, { dev }: { dev: boolean }): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],

    // 'strict-dynamic' makes the allow-list irrelevant for scripts: only a
    // nonce'd script runs, plus whatever it loads itself. That covers Next's
    // own chunk loader without having to enumerate chunk URLs.
    //
    // 'unsafe-eval' is development-only and is React's doing — it evals to
    // rebuild server stack traces in the error overlay. Production never needs
    // it, and shipping it would undo most of the value of the rest of this.
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(dev ? ["'unsafe-eval'"] : []),
    ],

    // Next injects a nonce'd <style> for the critical CSS. Turbopack's dev
    // pipeline injects un-nonced ones too, hence the dev branch.
    "style-src": ["'self'", dev ? "'unsafe-inline'" : `'nonce-${nonce}'`],

    // Distinct from `style-src` on purpose. A CSP with a nonce on `style-src`
    // and no `style-src-attr` blocks every `style="..."` attribute — which
    // would kill the dock key's transform, every Motion animation, and every
    // Recharts bar. Inline *attributes* cannot execute script in any browser
    // this app supports, so allowing them costs nothing that `script-src` is
    // not already defending.
    "style-src-attr": ["'unsafe-inline'"],

    // blob: is the recorded dictation before upload. data: is the canvas
    // waveform readback.
    "img-src": ["'self'", "blob:", "data:"],
    "media-src": ["'self'", "blob:"],

    // next/font/google self-hosts at build time, so no Google origin here.
    "font-src": ["'self'"],

    "connect-src": connectOrigins(),

    // The AudioWorklet module is served from /worklets on this origin.
    "worker-src": ["'self'", "blob:"],

    "object-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "frame-src": ["'none'"],
  };

  // An HTTP page in production would leak session cookies and PHI on the wire.
  // Omitted in development, where the dev server is plain HTTP by design.
  if (!dev) directives["upgrade-insecure-requests"] = [];

  return Object.entries(directives)
    .map(([name, values]) => (values.length ? `${name} ${values.join(" ")}` : name))
    .join("; ");
}

/**
 * Everything that is not the CSP.
 *
 * `dev` gates HSTS only: sending it from a localhost dev server pins the
 * developer's browser to https on localhost, which then breaks every other
 * project on port 3000.
 */
export function securityHeaders({ dev }: { dev: boolean }): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",

    // Not `strict-origin-when-cross-origin`. Patient and encounter ids appear
    // in this app's paths, and a referrer is the classic way an identifier
    // ends up in a third party's access log.
    "Referrer-Policy": "no-referrer",

    // Redundant with `frame-ancestors` for modern browsers, kept for the older
    // Android WebViews that are still common on clinic handsets.
    "X-Frame-Options": "DENY",

    // The microphone is the entire product, so it is granted — to this origin
    // only, and to nothing embedded. Everything else is denied outright rather
    // than left at the browser default.
    "Permissions-Policy": [
      "microphone=(self)",
      "camera=()",
      "geolocation=()",
      "payment=()",
      "usb=()",
      "midi=()",
      "magnetometer=()",
      "accelerometer=()",
      "gyroscope=()",
      "interest-cohort=()",
      "browsing-topics=()",
    ].join(", "),

    // Severs the window.opener relationship, so a link out of the app cannot
    // reach back into this document.
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",

    // DNS prefetching hands a doctor's browsing shape to their resolver.
    "X-DNS-Prefetch-Control": "off",

    ...(dev
      ? {}
      : { "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload" }),
  };
}
