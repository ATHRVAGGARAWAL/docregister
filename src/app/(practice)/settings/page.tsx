import { PracticeSettings } from "@/components/practice/practice-settings";
import { getCurrentDoctor } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const doctor = await getCurrentDoctor();
  if (!doctor) return null;
  return <PracticeSettings initialProfile={{ fullName: doctor.full_name, email: doctor.email, speciality: doctor.speciality, registrationNo: doctor.registration_no, role: doctor.role, dictationLangs: doctor.dictation_langs ?? ["hi-IN", "en-IN"] }} />;
}

