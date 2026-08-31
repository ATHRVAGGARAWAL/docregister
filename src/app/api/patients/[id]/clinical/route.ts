import { NextResponse } from "next/server";

import { ApiError, readBody, requireString, withDoctor } from "@/lib/api/http";
import { isFdiTooth, sortSurfaces } from "@/lib/dental/tooth";
import { callWorkflow } from "@/lib/supabase/workflows";

export const GET = withDoctor<{ id: string }>(async ({ doctor, supabase, params }) => {
  const { data: patient, error: patientError } = await supabase
    .from("patients")
    .select("id")
    .eq("id", params.id)
    .eq("clinic_id", doctor.clinic_id)
    .maybeSingle();
  if (patientError) throw new ApiError("Could not load the clinical chart.", 500);
  if (!patient) throw new ApiError("Patient chart not found.", 404);

  const [alerts, history, findings, perio, imaging] = await Promise.all([
    supabase.from("patient_alerts").select("id, kind, label, severity, note, is_active, created_at").eq("patient_id", params.id).eq("is_active", true).order("severity", { ascending: false }),
    supabase.from("patient_medical_history").select("id, category, name, status, detail, onset_date, resolved_date, created_at").eq("patient_id", params.id).order("created_at", { ascending: false }),
    supabase.from("tooth_findings").select("id, tooth_fdi, surfaces, finding, state, severity, note, observed_at, resolved_at").eq("patient_id", params.id).order("observed_at", { ascending: false }),
    supabase.from("periodontal_measurements").select("id, tooth_fdi, site, pocket_depth_mm, recession_mm, bleeding, suppuration, mobility, furcation, measured_at").eq("patient_id", params.id).order("measured_at", { ascending: false }).limit(192),
    supabase.from("imaging_links").select("id, label, modality, url, taken_at, note, created_at").eq("patient_id", params.id).order("taken_at", { ascending: false, nullsFirst: false }),
  ]);

  const failed = [alerts, history, findings, perio, imaging].find((result) => result.error);
  if (failed?.error) {
    console.error("[clinical-chart] list failed", failed.error);
    throw new ApiError("Could not load the structured clinical chart.", 500);
  }

  const { error: auditError } = await callWorkflow<null>(supabase, "log_sensitive_access", {
    p_action: "read",
    p_entity: "patient",
    p_entity_id: params.id,
    p_detail: { surface: "clinical_chart" },
  });
  if (auditError) {
    console.error("[clinical-chart] audit failed", auditError);
    throw new ApiError("Could not load the structured clinical chart.", 500);
  }

  return NextResponse.json({
    alerts: alerts.data ?? [],
    medicalHistory: history.data ?? [],
    findings: findings.data ?? [],
    periodontal: perio.data ?? [],
    imaging: imaging.data ?? [],
  }, { headers: { "Cache-Control": "no-store" } });
});

export const POST = withDoctor<{ id: string }>(async ({ doctor, supabase, request, params }) => {
  const body = await readBody<Record<string, unknown>>(request);
  const kind = requireString(body.kind, "kind");

  const { data: patient, error: patientError } = await supabase
    .from("patients")
    .select("id")
    .eq("id", params.id)
    .eq("clinic_id", doctor.clinic_id)
    .maybeSingle();
  if (patientError) throw new ApiError("Could not update the clinical chart.", 500);
  if (!patient) throw new ApiError("Patient chart not found.", 404);

  let table: string;
  let row: Record<string, unknown>;

  if (kind === "finding") {
    const tooth = Number(body.toothFdi);
    if (!isFdiTooth(tooth)) throw new ApiError("Choose a valid FDI tooth number.");
    const finding = requireString(body.finding, "finding");
    row = {
      clinic_id: doctor.clinic_id,
      patient_id: params.id,
      tooth_fdi: tooth,
      surfaces: sortSurfaces(Array.isArray(body.surfaces) ? body.surfaces.map(String) : []),
      finding,
      state: optionalChoice(body.state, ["existing", "planned", "completed", "resolved"]) ?? "existing",
      severity: optionalChoice(body.severity, ["mild", "moderate", "severe"]),
      note: optionalText(body.note, 1500),
      recorded_by: doctor.id,
    };
    table = "tooth_findings";
  } else if (kind === "alert") {
    row = {
      clinic_id: doctor.clinic_id,
      patient_id: params.id,
      kind: optionalChoice(body.alertKind, ["allergy", "medical", "medication", "pregnancy", "risk", "other"]) ?? "other",
      label: requireString(body.label, "label").slice(0, 160),
      severity: optionalChoice(body.severity, ["info", "important", "critical"]) ?? "important",
      note: optionalText(body.note, 1000),
      recorded_by: doctor.id,
    };
    table = "patient_alerts";
  } else if (kind === "imaging") {
    const url = requireString(body.url, "url");
    if (!/^https:\/\/\S+$/i.test(url)) throw new ApiError("Imaging links must use HTTPS.");
    row = {
      clinic_id: doctor.clinic_id,
      patient_id: params.id,
      label: requireString(body.label, "label").slice(0, 160),
      modality: optionalChoice(body.modality, ["iopa", "bitewing", "opg", "cbct", "photo", "scan", "other"]) ?? "other",
      url,
      note: optionalText(body.note, 1000),
      taken_at: optionalIso(body.takenAt),
      added_by: doctor.id,
    };
    table = "imaging_links";
  } else {
    throw new ApiError("Choose a supported clinical entry type.");
  }

  // `table` and `row` are chosen together in the branches above, so they always
  // agree — but TypeScript cannot see that through a runtime table name, and
  // narrowing it properly would mean duplicating this insert once per branch.
  // The cast is confined to the client here; the result is still checked.
  const client = supabase as unknown as {
    from: (relation: string) => {
      insert: (values: unknown) => {
        select: (columns: string) => {
          single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
        };
      };
    };
  };
  const { data, error } = await client.from(table).insert(row).select("id").single();
  if (error) {
    console.error("[clinical-chart] create failed", error);
    throw new ApiError("Could not save that clinical entry.", 500);
  }
  // A successful insert that returned no row. Rare, but the previous code read
  // `data.id` off it and threw a TypeError inside the handler — a 500 with a
  // stack trace instead of a 500 with a reason. Surfaced by the generated types.
  if (!data) {
    console.error("[clinical-chart] insert returned no row", { table });
    throw new ApiError("Could not save that clinical entry.", 500);
  }
  return NextResponse.json({ id: data.id }, { status: 201 });
});

function optionalChoice(value: unknown, choices: readonly string[]): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !choices.includes(value)) throw new ApiError("Choose a valid value.");
  return value;
}

function optionalText(value: unknown, max: number): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new ApiError("Expected text.");
  const text = value.trim();
  if (text.length > max) throw new ApiError(`Text must be ${max} characters or fewer.`);
  return text || null;
}

function optionalIso(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new ApiError("Expected a date.");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ApiError("Expected a valid date.");
  return date.toISOString();
}
