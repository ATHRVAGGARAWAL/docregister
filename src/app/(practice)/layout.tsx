import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { PendingApproval } from "@/components/clinic/pending-approval";
import { PracticeShell } from "@/components/practice/practice-shell";
import { getCurrentDoctor, getPendingClinicName } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PracticeLayout({ children }: { children: ReactNode }) {
  const doctor = await getCurrentDoctor();
  if (!doctor) redirect("/login");

  if (doctor.membership_status === "pending") {
    return (
      <PendingApproval
        clinicName={await getPendingClinicName(doctor.clinic_id)}
        doctorName={doctor.full_name}
        email={doctor.email}
      />
    );
  }

  return (
    <PracticeShell
      profile={{
        fullName: doctor.full_name,
        speciality: doctor.speciality,
        role: doctor.role,
      }}
    >
      {children}
    </PracticeShell>
  );
}

