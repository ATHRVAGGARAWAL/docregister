import "server-only";

import { createServerClient } from "@supabase/ssr";

import type { Database } from "@/lib/supabase/database.types";
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

  return createServerClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
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
    .select(
      "id, clinic_id, full_name, registration_no, speciality, role, dictation_langs, membership_status",
    )
    .eq("id", user.id)
    .single();

  if (error || !data) return null;

  // `membership_status` rides along because a pending member is a real,
  // signed-in doctor who can read exactly one row — their own. Everything
  // clinic-scoped resolves through `auth_clinic_id()`, which returns NULL until
  // an owner admits them, so they would otherwise reach a register that is
  // empty for a reason nothing on screen explains.
  return { ...data, email: user.email ?? null };
}

/**
 * The clinic a pending member asked to join, for the waiting screen.
 *
 * Read through the caller's own session rather than a service-role client: the
 * `clinic_read` policy is `id = auth_clinic_id()`, which is NULL while pending,
 * so this deliberately uses the doctor's `clinic_id` — the one row they are
 * allowed to know about because they typed its name themselves.
 */
export async function getPendingClinicName(clinicId: string): Promise<string | null> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.rpc("pending_clinic_name", { p_clinic_id: clinicId });
  return typeof data === "string" && data.length > 0 ? data : null;
}

export type CurrentDoctor = NonNullable<
  Awaited<ReturnType<typeof getCurrentDoctor>>
>;
