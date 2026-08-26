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
  title: "docregister — voice clinical intelligence",
  description:
    "Dictate a consultation in Hindi, Punjabi or English and it becomes a structured register entry, with patient history from your phone.",
  applicationName: "docregister",
  // Installed to the home screen, the register runs without the URL bar — which
  // is the band the bottom-fixed voice dock was competing with on a handset.
  manifest: "/manifest.webmanifest",
  // A doctor's register is not something to hand to a crawler.
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "docregister", statusBarStyle: "black" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  // Keep browser chrome aligned with the exact page background in either mode.
  // This pair, not the manifest's `theme_color`, is what colours the installed
  // standalone window: a manifest holds one static colour and has no media form,
  // so it can only stand in for the splash screen shown before this document
  // paints. Both follow the OS, which THEME_SCRIPT does not have to — a stored
  // light/dark override still leaves the status bar on the system scheme until
  // that script also rewrites this tag.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
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
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Blocking and inline, so the theme is on `<html>` before the first
            paint. A deferred script or a `useEffect` both run after the browser
            has already painted, and that paint is the flash. */}
        <InlineScript html={THEME_SCRIPT} nonce={nonce} />
      </head>
      <body className="flex min-h-full flex-col overflow-x-hidden">
        <ThemeSync />
        {/* One switch covers every `motion/react` transition; the CSS media
            query handles stylesheet animation and the waveform has its own
            reduced-motion level meter. */}
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </body>
    </html>
  );
}
