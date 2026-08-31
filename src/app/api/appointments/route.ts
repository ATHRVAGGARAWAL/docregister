import { NextResponse } from "next/server";

import { ApiError, readBody, requireString, withDoctor } from "@/lib/api/http";
import { appointmentWriteFailure } from "@/lib/practice/appointments";

interface AppointmentBody {
  patientId?: unknown;
  clinicianId?: unknown;
  operatoryId?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  appointmentType?: unknown;
  reason?: unknown;
  notes?: unknown;
  reminderAt?: unknown;
}

export const GET = withDoctor(async ({ doctor, supabase, request }) => {
  const url = new URL(request.url);
  const from = parseDate(url.searchParams.get("from"), startOfToday());
  const to = parseDate(url.searchParams.get("to"), new Date(from.getTime() + 7 * 86_400_000));
  if (to <= from || to.getTime() - from.getTime() > 45 * 86_400_000) {
    throw new ApiError("Choose a schedule range of 45 days or fewer.");
  }

  const [appointmentResult, operatoryResult, clinicianResult] = await Promise.all([
    supabase.from("appointments")
      .select(`
        id, patient_id, clinician_id, operatory_id, starts_at, ends_at, status,
        appointment_type, reason, notes, reminder_at,
        patient:patients!appointments_patient_id_fkey ( id, full_name, phone ),
        clinician:doctors!appointments_clinician_id_fkey ( id, full_name ),
        operatory:operatories!appointments_operatory_id_fkey (
          id, name, code, colour, sort_order, is_active
        )
      `)
      .eq("clinic_id", doctor.clinic_id)
      .gte("starts_at", from.toISOString())
      .lt("starts_at", to.toISOString())
      .order("starts_at", { ascending: true }),
    supabase.from("operatories")
      .select("id, name, code, colour, sort_order, is_active")
      .eq("clinic_id", doctor.clinic_id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase.from("doctors")
      .select("id, full_name, speciality, practice_role")
      .eq("clinic_id", doctor.clinic_id)
      .eq("membership_status", "active")
      .order("full_name", { ascending: true }),
  ]);

  if (appointmentResult.error || operatoryResult.error || clinicianResult.error) {
    console.error("[appointments] list failed", appointmentResult.error ?? operatoryResult.error ?? clinicianResult.error);
    throw new ApiError("Could not load the clinic schedule.", 500);
  }

  return NextResponse.json(
    {
      appointments: appointmentResult.data ?? [],
      operatories: operatoryResult.data ?? [],
      clinicians: clinicianResult.data ?? [],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
});

export const POST = withDoctor(async ({ doctor, supabase, request }) => {
  const body = await readBody<AppointmentBody>(request);
  const startsAt = parseDate(requireString(body.startsAt, "startsAt"));
  const endsAt = parseDate(requireString(body.endsAt, "endsAt"));
  if (endsAt <= startsAt || endsAt.getTime() - startsAt.getTime() > 12 * 60 * 60 * 1000) {
    throw new ApiError("The appointment end must be after its start and within 12 hours.");
  }

  const patientId = optionalUuid(body.patientId, "patientId");
  const reason = optionalText(body.reason, 500);
  if (!patientId && !reason) throw new ApiError("Choose a patient or enter a reason for this time block.");

  const row = {
    clinic_id: doctor.clinic_id,
    patient_id: patientId,
    clinician_id: optionalUuid(body.clinicianId, "clinicianId") ?? doctor.id,
    operatory_id: optionalUuid(body.operatoryId, "operatoryId"),
    created_by: doctor.id,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    appointment_type: optionalText(body.appointmentType, 80) ?? "consultation",
    reason,
    notes: optionalText(body.notes, 2000),
    reminder_at: optionalDate(body.reminderAt)?.toISOString() ?? null,
  };

  const { data, error } = await supabase.from("appointments")
    .insert(row)
    .select("id")
    .single();
  if (error) {
    console.error("[appointments] create failed", error);
    const failure = appointmentWriteFailure(error);
    if (failure) throw new ApiError(failure.message, failure.status);
    throw new ApiError("Could not schedule that appointment.", 500);
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
});

function startOfToday(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function parseDate(value: string | null, fallback?: Date): Date {
  if (!value) {
    if (fallback) return fallback;
    throw new ApiError("A valid date is required.");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ApiError("A valid date is required.");
  return date;
}

function optionalDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new ApiError("Expected a date.");
  return parseDate(value);
}

function optionalText(value: unknown, max: number): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new ApiError("Expected text.");
  const text = value.trim();
  if (text.length > max) throw new ApiError(`Text must be ${max} characters or fewer.`);
  return text || null;
}

function optionalUuid(value: unknown, field: string): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new ApiError(`\`${field}\` must be a UUID.`);
  }
  return value;
}
