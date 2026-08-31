import { NextResponse } from "next/server";

import { ApiError, readBody, requireString, withDoctor } from "@/lib/api/http";
import { isFdiTooth, sortSurfaces } from "@/lib/dental/tooth";
import { practiceTable } from "@/lib/supabase/practice";

export const GET = withDoctor(async ({ doctor, supabase, request }) => {
  const patientId = new URL(request.url).searchParams.get("patientId");
  // The item embed names its foreign key deliberately. 0031 adds
  // `treatment_plan_items_plan_same_clinic` alongside the plain
  // `treatment_plan_items_plan_id_fkey`, so two relationships now join these
  // tables and PostgREST refuses to choose (PGRST201) — which turned this whole
  // workspace into a 500. The plain key is the parent link; the composite one
  // exists to enforce tenancy. Same fix, same reason, as the patient-history
  // route's `doctors!encounters_doctor_id_fkey`.
  let query = practiceTable(supabase, "treatment_plans")
    .select(`
      id, patient_id, clinician_id, title, diagnosis, status, priority,
      accepted_at, completed_at, created_at, updated_at,
      patient:patients!treatment_plans_patient_id_fkey ( id, full_name ),
      items:treatment_plan_items!treatment_plan_items_plan_id_fkey (
        id, plan_id, procedure_name, scope, tooth_fdi, quadrant, arch, surfaces,
        status, phase, planned_sittings, quantity, unit_price_paise,
        discount_paise, note, sort_order
      )
    `)
    .eq("clinic_id", doctor.clinic_id)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (patientId) query = query.eq("patient_id", patientId);
  const { data, error } = await query;
  if (error) {
    console.error("[treatment-plans] list failed", error);
    throw new ApiError("Could not load treatment plans.", 500);
  }
  return NextResponse.json({ plans: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
});

export const POST = withDoctor(async ({ doctor, supabase, request }) => {
  const body = await readBody<Record<string, unknown>>(request);
  const patientId = requireUuid(body.patientId, "patientId");
  const title = requireString(body.title, "title").slice(0, 160);
  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length > 100) throw new ApiError("A treatment plan can contain at most 100 items.");

  const { data: patient, error: patientError } = await supabase
    .from("patients")
    .select("id")
    .eq("id", patientId)
    .eq("clinic_id", doctor.clinic_id)
    .maybeSingle();
  if (patientError) throw new ApiError("Could not create the treatment plan.", 500);
  if (!patient) throw new ApiError("Patient chart not found.", 404);

  const { data: plan, error: planError } = await practiceTable(supabase, "treatment_plans")
    .insert({
      clinic_id: doctor.clinic_id,
      patient_id: patientId,
      clinician_id: doctor.id,
      created_by: doctor.id,
      title,
      diagnosis: optionalText(body.diagnosis, 2000),
      priority: choice(body.priority, ["urgent", "high", "routine", "elective"]) ?? "routine",
      status: "draft",
    })
    .select("id")
    .single();
  if (planError) {
    console.error("[treatment-plans] create failed", planError);
    throw new ApiError("Could not create the treatment plan.", 500);
  }

  const items = rawItems.map((raw, index) => planItem(raw, index, plan.id, doctor.clinic_id));
  if (items.length > 0) {
    const { error: itemError } = await practiceTable(supabase, "treatment_plan_items").insert(items);
    if (itemError) {
      await practiceTable(supabase, "treatment_plans").delete().eq("id", plan.id).eq("clinic_id", doctor.clinic_id);
      console.error("[treatment-plans] item create failed", itemError);
      throw new ApiError("Could not create the treatment plan items.", 500);
    }
  }

  return NextResponse.json({ id: plan.id }, { status: 201 });
});

function planItem(value: unknown, index: number, planId: string, clinicId: string): Record<string, unknown> {
  if (!value || typeof value !== "object") throw new ApiError("Every treatment item must be an object.");
  const item = value as Record<string, unknown>;
  const scope = choice(item.scope, ["tooth", "quadrant", "arch", "full_mouth", "other"]) ?? "tooth";
  const tooth = item.toothFdi == null || item.toothFdi === "" ? null : Number(item.toothFdi);
  if (scope === "tooth" && (tooth == null || !isFdiTooth(tooth))) throw new ApiError("Every tooth-level item needs a valid FDI tooth.");
  const quantity = Number(item.quantity ?? 1);
  const price = Number(item.unitPricePaise ?? 0);
  return {
    clinic_id: clinicId,
    plan_id: planId,
    catalogue_id: item.catalogueId || null,
    procedure_name: requireString(item.procedureName, "procedureName").slice(0, 160),
    scope,
    tooth_fdi: scope === "tooth" ? tooth : null,
    quadrant: scope === "quadrant" ? Number(item.quadrant) : null,
    arch: scope === "arch" ? item.arch : null,
    surfaces: scope === "tooth" ? sortSurfaces(Array.isArray(item.surfaces) ? item.surfaces.map(String) : []) : [],
    phase: Math.max(1, Math.min(20, Number(item.phase ?? 1))),
    planned_sittings: item.plannedSittings == null ? null : Number(item.plannedSittings),
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    unit_price_paise: Number.isSafeInteger(price) && price >= 0 ? price : 0,
    discount_paise: 0,
    note: optionalText(item.note, 1500),
    sort_order: index,
  };
}

function requireUuid(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw new ApiError(`\`${field}\` must be a UUID.`);
  }
  return text;
}

function choice(value: unknown, values: readonly string[]): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !values.includes(value)) throw new ApiError("Choose a valid value.");
  return value;
}

function optionalText(value: unknown, max: number): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new ApiError("Expected text.");
  const text = value.trim();
  if (text.length > max) throw new ApiError(`Text must be ${max} characters or fewer.`);
  return text || null;
}

