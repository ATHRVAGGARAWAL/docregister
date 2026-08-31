import { NextResponse } from "next/server";

import { ApiError, readBody, requireString, withDoctor } from "@/lib/api/http";
import { callWorkflow } from "@/lib/supabase/workflows";
import { practiceTable } from "@/lib/supabase/practice";

interface ConsentBody {
  consentType?: unknown;
  templateVersion?: unknown;
  contentSnapshot?: unknown;
  languageCode?: unknown;
}

export const GET = withDoctor<{ id: string }>(async ({ doctor, supabase, params }) => {
  await requirePatient(supabase, doctor.clinic_id, params.id, "Could not load consent records.");

  const { data, error } = await practiceTable(supabase, "consent_records")
    .select("id, consent_type, template_version, content_snapshot, language_code, status, signed_name, signed_at, witness_name, revoked_at, created_at, updated_at")
    .eq("clinic_id", doctor.clinic_id)
    .eq("patient_id", params.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[patient-consents] list failed", error);
    throw new ApiError("Could not load consent records.", 500);
  }

  const { error: auditError } = await callWorkflow<null>(supabase, "log_sensitive_access", {
    p_action: "read",
    p_entity: "patient",
    p_entity_id: params.id,
    p_detail: { surface: "patient_consents" },
  });
  if (auditError) {
    console.error("[patient-consents] audit failed", auditError);
    throw new ApiError("Could not load consent records.", 500);
  }

  return NextResponse.json({ consents: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}, { rateLimit: "match" });

export const POST = withDoctor<{ id: string }>(async ({ doctor, supabase, request, params }) => {
  const body = await readBody<ConsentBody>(request);
  await requirePatient(supabase, doctor.clinic_id, params.id, "Could not create the consent draft.");

  const consentType = boundedRequiredText(body.consentType, "consentType", 120);
  const contentSnapshot = boundedRequiredText(body.contentSnapshot, "contentSnapshot", 50_000);
  const templateVersion = optionalText(body.templateVersion, "templateVersion", 80);
  const languageCode = optionalLanguage(body.languageCode) ?? "en-IN";

  const { data, error } = await practiceTable(supabase, "consent_records")
    .insert({
      clinic_id: doctor.clinic_id,
      patient_id: params.id,
      consent_type: consentType,
      template_version: templateVersion,
      content_snapshot: contentSnapshot,
      language_code: languageCode,
      status: "draft",
      created_by: doctor.id,
    })
    .select("id, consent_type, template_version, content_snapshot, language_code, status, signed_name, signed_at, witness_name, revoked_at, created_at, updated_at")
    .single();

  if (error) {
    console.error("[patient-consents] create failed", error);
    throw new ApiError("Could not create the consent draft.", 500);
  }

  return NextResponse.json({ consent: data }, { status: 201 });
});

async function requirePatient(
  supabase: Parameters<typeof practiceTable>[0],
  clinicId: string,
  patientId: string,
  failureMessage: string,
): Promise<void> {
  const { data, error } = await practiceTable(supabase, "patients")
    .select("id")
    .eq("id", patientId)
    .eq("clinic_id", clinicId)
    .maybeSingle();

  if (error) throw new ApiError(failureMessage, 500);
  if (!data) throw new ApiError("Patient chart not found.", 404);
}

function boundedRequiredText(value: unknown, field: string, maxLength: number): string {
  const text = requireString(value, field);
  if (text.length > maxLength) throw new ApiError(`\`${field}\` must be ${maxLength} characters or fewer.`);
  return text;
}

function optionalText(value: unknown, field: string, maxLength: number): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new ApiError(`\`${field}\` must be text.`);
  const text = value.trim();
  if (text.length > maxLength) throw new ApiError(`\`${field}\` must be ${maxLength} characters or fewer.`);
  return text || null;
}

function optionalLanguage(value: unknown): string | null {
  const language = optionalText(value, "languageCode", 35);
  if (language && !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(language)) {
    throw new ApiError("Choose a valid language code.");
  }
  return language;
}
