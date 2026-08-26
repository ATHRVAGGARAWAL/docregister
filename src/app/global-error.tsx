"use client";

import { Geist, Geist_Mono } from "next/font/google";
import { useState } from "react";
import "./globals.css";

import { ErrorScreen } from "@/components/error/error-screen";
import { cn } from "@/lib/utils";
import {
  normalizeThemePreference,
  resolveTheme,
  SYSTEM_THEME_QUERY,
  THEME_KEY,
  type ResolvedTheme,
} from "@/lib/theme";

// This file replaces the root layout when it renders, so everything the layout
// puts on the document has to be re-established here or it is simply absent.
// The fonts are re-declared for that reason: `--font-sans` in globals.css ends
// in `var(--font-geist-sans)`, and with that variable undefined the whole
// `font-family` declaration is invalid at computed-value time — the error page
// would fall back to the browser's default serif.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

/**
 * `THEME_SCRIPT` runs from the root layout's `<head>`, which this file replaces,
 * so the `dark` class it would have set is not on the document. It cannot be
 * re-run here either: the CSP allows an inline script only with the per-request
 * nonce, and a client component has no way to read that nonce. Resolving the
 * preference during the first render and letting React own the class is what is
 * left — and it reuses `lib/theme` rather than restating the storage key, so a
 * change there cannot leave this screen on the wrong theme.
 */
function preferredTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";

  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(THEME_KEY);
  } catch {
    // Storage is unreadable behind some privacy settings. The OS preference is
    // a better answer than refusing to paint.
  }

  return resolveTheme(
    normalizeThemePreference(stored),
    window.matchMedia(SYSTEM_THEME_QUERY).matches,
  );
}

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const [theme] = useState(preferredTheme);

  return (
    <html
      lang="en"
      // The theme is resolved on the client; a server render of this file (the
      // root layout itself failing) has no preference to read and starts light.
      suppressHydrationWarning
      className={cn(
        geistSans.variable,
        geistMono.variable,
        "h-full antialiased",
        theme === "dark" && "dark",
      )}
    >
      <head>
        <meta charSet="utf-8" />
        {/* The layout's `viewport` export does not reach a document this file
            renders, and without this a phone lays the page out at its default
            desktop width. `maximum-scale` matches the register's: pinch-zoom is
            never taken away here either. */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover"
        />
        <title>docregister — the workspace could not start</title>
      </head>
      <body className="flex min-h-full flex-col overflow-x-hidden">
        <ErrorScreen
          scope="global"
          error={error}
          onRetry={retry}
          title="docregister could not start"
          description="This one is not something you can fix from here. Try again, and if it keeps happening, report it with the reference code below — your saved visits are untouched."
        />
      </body>
    </html>
  );
}
