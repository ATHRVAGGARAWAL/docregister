import { redirect } from "next/navigation";

import { PendingApproval } from "@/components/clinic/pending-approval";
import { Dashboard } from "@/components/dashboard/dashboard";
import { emptyAnalytics, loadDailyStats } from "@/lib/analytics";
import { liveProxyUrl } from "@/lib/env";
import { loadTodayRegister } from "@/lib/register";
import {
  getCurrentDoctor,
  getPendingClinicName,
  getSupabaseServerClient,
} from "@/lib/supabase/server";
import { parseDashboardUrlState, type RawSearchParams } from "@/lib/url-state";

/**
 * The register.
 *
 * Rendered on the server so the first paint already carries real numbers — a
 * doctor opening this between patients on a clinic's mobile connection should
 * not watch four skeletons resolve. The interactive layer (voice capture, range
 * filters, recall) hydrates on top.
 */

// Every read here is per-doctor PHI behind RLS, so there is nothing to cache
// and a stale register would be actively wrong.
export const dynamic = "force-dynamic";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const doctor = await getCurrentDoctor();
  if (!doctor) redirect("/login");

  // Before anything is loaded, not after. Every query below resolves through
  // `auth_clinic_id()`, which is NULL until an owner admits this doctor — so
  // rendering the dashboard here would spend the round trips only to paint an
  // empty register that looks broken rather than pending.
  if (doctor.membership_status === "pending") {
    return (
      <PendingApproval
        clinicName={await getPendingClinicName(doctor.clinic_id)}
        doctorName={doctor.full_name}
        email={doctor.email}
      />
    );
  }

  // Parsed here rather than in the client, so the server renders the same view
  // the URL asks for. Reading it after hydration meant a deep link to
  // `?view=patients` painted the overview first and then threw it away.
  const urlState = parseDashboardUrlState(await searchParams);

  const supabase = await getSupabaseServerClient();

  // Independent queries, so they run together rather than in sequence.
  const [analytics, entries] = await Promise.all([
    loadDailyStats(supabase, { doctorId: doctor.id }).catch((error) => {
      console.error("[dashboard] analytics failed", error);
      // An analytics outage must not take down the register itself.
      return emptyAnalytics();
    }),
    loadTodayRegister(supabase, doctor.id),
  ]);

  return (
    <Dashboard
      initialProfile={{
        fullName: doctor.full_name,
        email: doctor.email,
        speciality: doctor.speciality,
        registrationNo: doctor.registration_no,
        role: doctor.role,
        dictationLangs: doctor.dictation_langs ?? ["hi-IN", "en-IN"],
      }}
      initialAnalytics={analytics}
      initialEntries={entries}
      initialUrlState={urlState}
      liveProxyUrl={liveProxyUrl}
    />
  );
}
