import type { Metadata, Viewport } from "next";
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
    "Dictate a consultation in Hindi, Punjabi or English and it becomes a structured register entry. Revenue, patient volume and history, from your phone.",
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
        {/* The dot-ruled pad belongs to the register, not to every route — it
            is there to give a dense page of figures a surface to sit on, and
            behind a single sign-in field it is just texture. It is rendered by
            the dashboard instead. */}
        {children}
      </body>
    </html>
  );
}
