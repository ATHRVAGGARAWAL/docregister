import { PatientWorkspace } from "@/components/practice/patient-workspace";

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PatientWorkspace patientId={id} />;
}

