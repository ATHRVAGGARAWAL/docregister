import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getCurrentDoctor } from "@/lib/supabase/server";
import { ClinicSetup } from "@/components/auth/clinic-setup";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session.isAuthenticated) redirect("/sign-in");
  if (await getCurrentDoctor()) redirect("/");
  const user = await currentUser();
  return <ClinicSetup initialName={user?.fullName ?? ""} />;
}
