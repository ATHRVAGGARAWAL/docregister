/**
 * A blocking inline `<script>` that React will not complain about.
 *
 * React warns when a render produces a script tag, because a script inserted by
 * the client renderer is inert — it never executes. That warning is correct in
 * general and wrong here: this tag only ever needs to run during the initial
 * HTML parse, which is the one case React's warning does not cover.
 *
 * The fix, from the Next.js guide on preventing a flash before hydration, is to
 * ship the tag as executable JavaScript from the server and as inert text from
 * the client. The browser has already parsed and run the server's copy by the
 * time React hydrates, so the client type costs nothing. `suppressHydrationWarning`
 * covers the deliberate mismatch on that one attribute.
 *
 * The `nonce` is not optional in practice. Next stamps its own script tags with
 * the request nonce automatically, but this tag is hand-written, so under the
 * CSP in `src/lib/security/headers.ts` it is exactly the kind of inline script
 * the policy exists to block — and blocking it brings back the theme flash.
 */
export function InlineScript({ html, nonce }: { html: string; nonce?: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      nonce={nonce}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
