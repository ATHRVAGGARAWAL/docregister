import { redirect } from "next/navigation";

import { Dashboard } from "@/components/dashboard/dashboard";
import { emptyAnalytics, loadDailyStats } from "@/lib/analytics";
import { liveProxyUrl } from "@/lib/env";
import { loadTodayRegister } from "@/lib/register";
import { getCurrentDoctor, getSupabaseServerClient } from "@/lib/supabase/server";

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

export default async function RegisterPage() {
  const doctor = await getCurrentDoctor();
  if (!doctor) redirect("/login");

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
      doctorName={shortName(doctor.full_name)}
      initialAnalytics={analytics}
      initialEntries={entries}
      liveProxyUrl={liveProxyUrl}
      dictationLangs={doctor.dictation_langs ?? ["hi-IN", "en-IN"]}
    />
  );
}

/** "Dr. Arjun Mehta" -> "Dr. Mehta". A greeting, not a nameplate. */
function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const honorific = /^(dr\.?|prof\.?)$/i.test(parts[0]) ? parts.shift() : null;
  const last = parts.at(-1) ?? fullName;
  return honorific ? `${honorific.replace(/\.?$/, ".")} ${last}` : last;
}
