import "server-only";
import { currentUser } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { callWorkflow } from "@/lib/supabase/workflows";
import type { Database } from "@/lib/supabase/database.types";

/** Elevated credentials are used only for verified identity provisioning. */
export async function provisionClerkDoctor(clinicName?: string, fullName?: string) {
  const user = await currentUser();
  if (!user) throw new Error("Sign in to continue.");
  const email = user.primaryEmailAddress;
  if (!email || email.verification?.status !== "verified") {
    throw new Error("Verify your primary email in your account before opening a clinic.");
  }
  const admin = createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const result = await callWorkflow<Database["public"]["Tables"]["doctors"]["Row"]>(admin, "provision_clerk_doctor", {
    p_clerk_user_id: user.id,
    p_email: email.emailAddress,
    p_full_name: fullName?.trim() || user.fullName || email.emailAddress.split("@")[0],
    p_clinic_name: clinicName?.trim() || null,
  });
  if (result.error) {
    console.error("[clerk provisioning]", result.error.code);
    throw new Error("Could not set up your clinic. Please try again.");
  }
  return result.data;
}
