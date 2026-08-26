import type { Metadata, Viewport } from "next";
import { MotionConfig } from "motion/react";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { InlineScript } from "@/components/inline-script";
import { ThemeSync } from "@/components/theme-sync";
import { THEME_SCRIPT } from "@/lib/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

// Every figure in this app is a ledger figure and every ledger figure is
// monospaced, so this is load-bearing rather than decorative.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "docregister — voice register for clinics",
  description:
    "Dictate a consultation in Hindi, Punjabi or English and it becomes a structured register entry, with patient history from your phone.",
  applicationName: "docregister",
  // A doctor's register is not something to hand to a crawler.
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "docregister", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  // Matches `--background` in each theme so the browser chrome does not leave a
  // mismatched strip above the page.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2efe9" },
    { media: "(prefers-color-scheme: dark)", color: "#111318" },
  ],
  // The dock sits on the home-indicator edge and reads env(safe-area-inset-*),
  // which stays 0 unless the viewport covers the display cutouts.
  viewportFit: "cover",
  // Clinical numbers get pinch-zoomed. Never disable that.
  maximumScale: 5,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Minted by the proxy, one per request. Reading it opts every route into
  // dynamic rendering, which costs this app nothing: the register is already
  // `force-dynamic` because it is per-doctor PHI, and there is no page here
  // worth serving from a CDN.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Blocking and inline, so the theme is on `<html>` before the first
            paint. A deferred script or a `useEffect` both run after the browser
            has already painted, and that paint is the flash. */}
        <InlineScript html={THEME_SCRIPT} nonce={nonce} />
      </head>
      <body className="flex min-h-full flex-col">
        <ThemeSync />
        {/* One switch for every `motion/react` animation in the app.
            `globals.css` has a `prefers-reduced-motion` block, but it only
            throttles *CSS* animation — Motion animates from JavaScript, so it
            sailed straight past. `voice-dock`, `waveform` and `click-spark` each
            check the preference by hand; `Reveal`, `AnimatedItem` and the
            dashboard hero did not, which meant a doctor who asked their phone for
            less motion still got a slide and a scale on every register row. */}
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </body>
    </html>
  );
}
