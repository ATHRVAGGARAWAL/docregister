import { NextResponse } from "next/server";

import { ApiError, readBody, requireString, withDoctor } from "@/lib/api/http";

interface PatientUpdateBody {
  fullName?: unknown;
  phone?: unknown;
  ageYears?: unknown;
  sex?: unknown;
  abhaId?: unknown;
  notes?: unknown;
}

export const PATCH = withDoctor<{ id: string }>(async ({ doctor, supabase, request, params }) => {
  const body = await readBody<PatientUpdateBody>(request);
  const fullName = requireString(body.fullName, "fullName");
  if (fullName.length > 120) throw new ApiError("Patient name is too long.");

  const ageYears = optionalAge(body.ageYears);
  const phone = optionalText(body.phone, "phone", 30);
  const sex = optionalText(body.sex, "sex", 30);
  const abhaId = optionalText(body.abhaId, "abhaId", 80);
  const notes = optionalText(body.notes, "notes", 2_000);

  const { data, error } = await supabase
    .from("patients")
    .update({
      full_name: fullName,
      phone,
      age_years: ageYears,
      sex,
      abha_id: abhaId,
      notes,
    })
    .eq("id", params.id)
    .eq("clinic_id", doctor.clinic_id)
    .select("id, full_name, phone, age_years, sex, abha_id, notes, first_seen_at")
    .maybeSingle();

  if (error?.code === "23505") {
    throw new ApiError("Another patient chart already uses this phone number.", 409);
  }
  if (error) {
    console.error("[patient] update failed", error);
    throw new ApiError("Could not update this patient chart.", 500);
  }
  if (!data) throw new ApiError("Patient chart not found.", 404);

  return NextResponse.json(data);
}, { rateLimit: "match" });

function optionalText(value: unknown, field: string, maxLength: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new ApiError(`\`${field}\` must be text.`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new ApiError(`\`${field}\` must be ${maxLength} characters or fewer.`);
  }
  return trimmed || null;
}

function optionalAge(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const age = Number(value);
  if (!Number.isInteger(age) || age < 0 || age > 130) {
    throw new ApiError("Age must be a whole number between 0 and 130.");
  }
  return age;
}
