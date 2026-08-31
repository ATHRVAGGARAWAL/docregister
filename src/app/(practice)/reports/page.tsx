import { ReportsWorkspace } from "@/components/practice/reports-workspace";
import { emptyAnalytics, loadDailyStats, shiftDays } from "@/lib/analytics";
import { todayInIndia } from "@/lib/format";
import { getCurrentDoctor, getSupabaseServerClient } from "@/lib/supabase/server";

export default async function ReportsPage() {
  const doctor = await getCurrentDoctor();
  if (!doctor) return null;
  const supabase = await getSupabaseServerClient();
  const to = todayInIndia();
  const analytics = await loadDailyStats(supabase, { doctorId: doctor.id, from: shiftDays(to, -89), to }).catch(() => emptyAnalytics());
  return <ReportsWorkspace analytics={analytics} />;
}
