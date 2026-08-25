import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { env } from "@/lib/env";

/**
 * Request-scoped Supabase client that carries the caller's session.
 *
 * Always use this for anything touching PHI: it runs as the signed-in doctor,
 * so the Row Level Security policies in `supabase/migrations/0001_init.sql`
 * enforce clinic isolation at the database rather than relying on every query
 * remembering its own `where clinic_id = ...`.
 *
 * `cookies()` is async in Next 16 — synchronous access was removed.
 */
export async function getSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. Session refresh is handled
          // in proxy.ts, so ignoring this here is safe.
        }
      },
    },
  });
}

/** The signed-in doctor plus their clinic, or null when unauthenticated. */
export async function getCurrentDoctor() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("doctors")
    .select("id, clinic_id, full_name, speciality, role, dictation_langs")
    .eq("id", user.id)
    .single();

  if (error || !data) return null;
  return { ...data, email: user.email ?? null };
}

export type CurrentDoctor = NonNullable<
  Awaited<ReturnType<typeof getCurrentDoctor>>
>;
