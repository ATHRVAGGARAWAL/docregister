"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client. Only ever sees the anon key, and every table it can
 * reach is guarded by RLS — a stolen anon key still cannot read another
 * clinic's patients.
 */
export function getSupabaseBrowserClient() {
  // Both key names are supported: Supabase renamed "anon" to "publishable",
  // and which one a project uses depends on when it was created.
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key!);
}
