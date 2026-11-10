import "server-only";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { cache } from "react";
import type { Database } from "@/lib/supabase/database.types";
import { env } from "@/lib/env";
import { provisionClerkDoctor } from "@/lib/auth/clerk-doctor";

/** Native Clerk token; every clinical query still runs under database RLS. */
export const getSupabaseServerClient = cache(async () => {
  const session = await auth();
  return createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    accessToken: async () => session.isAuthenticated ? session.getToken() : null,
  });
});

export const getCurrentDoctor = cache(async () => {
  const session = await auth();
  if (!session.isAuthenticated) return null;
  const supabase = await getSupabaseServerClient();
  const select = () => supabase.from("doctors").select(
    "id, clinic_id, full_name, email, registration_no, speciality, role, dictation_langs, membership_status",
  ).eq("clerk_user_id", session.userId).maybeSingle();
  let result = await select();
  if (result.error) throw new Error("Could not load your clinic membership.");
  if (!result.data) {
    // Link an existing, verified legacy identity without creating a practice.
    await provisionClerkDoctor();
    result = await select();
    if (result.error) throw new Error("Could not load your clinic membership.");
  }
  return result.data;
});

export async function getPendingClinicName(clinicId: string): Promise<string | null> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.rpc("pending_clinic_name", { p_clinic_id: clinicId });
  return typeof data === "string" && data.length > 0 ? data : null;
}

export type CurrentDoctor = NonNullable<Awaited<ReturnType<typeof getCurrentDoctor>>>;
