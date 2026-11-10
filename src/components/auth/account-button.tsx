"use client";

import dynamic from "next/dynamic";

function AccountPlaceholder() {
  return <span aria-hidden="true" className="block size-7 shrink-0 rounded-full bg-muted" />;
}

// Clerk's host element depends on whether its browser SDK has loaded. Keep
// that timing-dependent markup outside hydration, including on warm reloads.
const ClientUserButton = dynamic(
  () => import("@clerk/nextjs").then(({ UserButton }) => UserButton),
  { ssr: false, loading: AccountPlaceholder },
);

export function AccountButton() {
  return <ClientUserButton fallback={<AccountPlaceholder />} />;
}
