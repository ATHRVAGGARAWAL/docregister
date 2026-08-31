import { TodayWorkspace } from "@/components/practice/today-workspace";
import { emptyAnalytics, loadDailyStats } from "@/lib/analytics";
import { loadTodayRegister } from "@/lib/register";
import { getCurrentDoctor, getSupabaseServerClient } from "@/lib/supabase/server";

export default async function TodayPage() {
  const doctor = await getCurrentDoctor();
  if (!doctor) return null;
  const supabase = await getSupabaseServerClient();
  const [analytics, entries] = await Promise.all([
    loadDailyStats(supabase, { doctorId: doctor.id }).catch(() => emptyAnalytics()),
    loadTodayRegister(supabase, doctor.id).catch(() => []),
  ]);
  return <TodayWorkspace doctorName={doctor.full_name} analytics={analytics} entries={entries} />;
}

