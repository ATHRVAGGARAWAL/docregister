import { NextResponse } from "next/server";

import { withDoctor } from "@/lib/api/http";
import { loadRegister } from "@/lib/register";

export const GET = withDoctor(async ({ doctor, supabase, request }) => {
  const url = new URL(request.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 30, 1), 365);
  const query = (url.searchParams.get("q") ?? "").trim().toLocaleLowerCase("en-IN");
  const status = url.searchParams.get("status");

  let entries = await loadRegister(supabase, doctor.id, { days });

  if (status === "draft" || status === "committed") {
    entries = entries.filter((entry) => entry.status === status);
  }

  if (query) {
    entries = entries.filter((entry) =>
      [entry.patient_name, entry.diagnosis, entry.treatment, ...entry.drugs]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase("en-IN").includes(query)),
    );
  }

  return NextResponse.json({ entries, days });
});
