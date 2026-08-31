import { TreatmentsWorkspace } from "@/components/practice/treatments-workspace";

export default async function TreatmentsPage({ searchParams }: { searchParams: Promise<{ patient?: string | string[] }> }) {
  const value = (await searchParams).patient;
  return <TreatmentsWorkspace initialPatientId={typeof value === "string" ? value : undefined} />;
}

