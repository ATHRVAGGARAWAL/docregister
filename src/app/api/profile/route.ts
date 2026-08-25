import { NextResponse } from "next/server";

import { ApiError, readBody, requireString, withDoctor } from "@/lib/api/http";

const ALLOWED_LANGUAGES = new Set(["en-IN", "hi-IN", "pa-IN"]);

interface ProfileBody {
  fullName?: unknown;
  registrationNo?: unknown;
  speciality?: unknown;
  dictationLangs?: unknown;
}

export const PATCH = withDoctor(async ({ doctor, supabase, request }) => {
  const body = await readBody<ProfileBody>(request);
  const fullName = requireString(body.fullName, "fullName");
  const registrationNo = optionalText(body.registrationNo, "registrationNo", 80);
  const speciality = optionalText(body.speciality, "speciality", 100);

  if (!Array.isArray(body.dictationLangs) || body.dictationLangs.length === 0) {
    throw new ApiError("Choose at least one dictation language.");
  }

  const dictationLangs = [...new Set(body.dictationLangs)].filter(
    (language): language is string =>
      typeof language === "string" && ALLOWED_LANGUAGES.has(language),
  );
  if (dictationLangs.length !== body.dictationLangs.length) {
    throw new ApiError("One or more dictation languages are not supported.");
  }

  const { data, error } = await supabase
    .from("doctors")
    .update({
      full_name: fullName.slice(0, 120),
      registration_no: registrationNo,
      speciality,
      dictation_langs: dictationLangs,
    })
    .eq("id", doctor.id)
    .select("full_name, registration_no, speciality, role, dictation_langs")
    .single();

  if (error || !data) throw new ApiError("Could not update your profile.", 500);

  return NextResponse.json({
    fullName: data.full_name,
    registrationNo: data.registration_no,
    speciality: data.speciality,
    role: data.role,
    dictationLangs: data.dictation_langs,
  });
});

function optionalText(value: unknown, field: string, maxLength: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new ApiError(`\`${field}\` must be text.`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new ApiError(`\`${field}\` must be ${maxLength} characters or fewer.`);
  }
  return trimmed || null;
}
