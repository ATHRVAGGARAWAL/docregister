import { NextResponse } from "next/server";

import { ApiError, readBody, withDoctor } from "@/lib/api/http";
import {
  appointmentWriteFailure,
  canTransitionAppointmentStatus,
  isAppointmentStatus,
} from "@/lib/practice/appointments";
import type { AppointmentStatus } from "@/lib/practice/types";
import { practiceTable } from "@/lib/supabase/practice";

export const PATCH = withDoctor<{ id: string }>(async ({ doctor, supabase, request, params }) => {
  const body = await readBody<Record<string, unknown>>(request);
  const patch: Record<string, unknown> = {};
  let requestedStatus: AppointmentStatus | null = null;

  if (body.status !== undefined) {
    if (!isAppointmentStatus(body.status)) {
      throw new ApiError("Choose a valid appointment status.");
    }
    requestedStatus = body.status;
    patch.status = requestedStatus;
  }

  for (const [input, column] of [["startsAt", "starts_at"], ["endsAt", "ends_at"]] as const) {
    if (body[input] !== undefined) {
      if (typeof body[input] !== "string" || Number.isNaN(new Date(body[input]).getTime())) {
        throw new ApiError(`\`${input}\` must be a valid date.`);
      }
      patch[column] = new Date(body[input]).toISOString();
    }
  }
  if (body.reminderAt !== undefined) {
    if (body.reminderAt === null || body.reminderAt === "") patch.reminder_at = null;
    else if (typeof body.reminderAt === "string" && !Number.isNaN(new Date(body.reminderAt).getTime())) {
      patch.reminder_at = new Date(body.reminderAt).toISOString();
    } else throw new ApiError("`reminderAt` must be a valid date.");
  }

  for (const [input, column, max] of [["reason", "reason", 500], ["notes", "notes", 2000], ["appointmentType", "appointment_type", 80]] as const) {
    if (body[input] !== undefined) {
      if (body[input] === null || body[input] === "") patch[column] = null;
      else if (typeof body[input] === "string" && body[input].trim().length <= max) patch[column] = body[input].trim();
      else throw new ApiError(`\`${input}\` is invalid.`);
    }
  }
  for (const [input, column] of [["patientId", "patient_id"], ["clinicianId", "clinician_id"], ["operatoryId", "operatory_id"]] as const) {
    if (body[input] !== undefined) {
      if (body[input] === null || body[input] === "") patch[column] = null;
      else if (typeof body[input] === "string" && isUuid(body[input])) patch[column] = body[input];
      else throw new ApiError(`\`${input}\` is invalid.`);
    }
  }

  if (Object.keys(patch).length === 0) throw new ApiError("No appointment changes were supplied.");

  const currentResult = await practiceTable(supabase, "appointments")
    .select("id, status, starts_at, ends_at")
    .eq("id", params.id)
    .eq("clinic_id", doctor.clinic_id)
    .maybeSingle();
  if (currentResult.error) {
    console.error("[appointments] lookup before update failed", currentResult.error);
    throw new ApiError("Could not update that appointment.", 500);
  }
  if (!currentResult.data) throw new ApiError("Appointment not found.", 404);

  const current = currentResult.data as {
    id: string;
    status: unknown;
    starts_at: string;
    ends_at: string;
  };
  if (!isAppointmentStatus(current.status)) {
    console.error("[appointments] invalid stored status", current.id, current.status);
    throw new ApiError("Could not update that appointment.", 500);
  }

  if (requestedStatus && !canTransitionAppointmentStatus(current.status, requestedStatus)) {
    if (current.status === "completed" && requestedStatus === "cancelled") {
      throw new ApiError("Completed appointments cannot be cancelled.", 409);
    }
    throw new ApiError(
      `This appointment cannot move from ${statusLabel(current.status)} to ${statusLabel(requestedStatus)}.`,
      409,
    );
  }

  if (requestedStatus && requestedStatus !== current.status) {
    if (requestedStatus === "checked_in") patch.checked_in_at = new Date().toISOString();
    if (requestedStatus === "completed") patch.completed_at = new Date().toISOString();
  }

  const startsAt = new Date(typeof patch.starts_at === "string" ? patch.starts_at : current.starts_at);
  const endsAt = new Date(typeof patch.ends_at === "string" ? patch.ends_at : current.ends_at);
  if (endsAt <= startsAt || endsAt.getTime() - startsAt.getTime() > 12 * 60 * 60 * 1000) {
    throw new ApiError("The appointment end must be after its start and within 12 hours.");
  }

  let update = practiceTable(supabase, "appointments")
    .update(patch)
    .eq("id", params.id)
    .eq("clinic_id", doctor.clinic_id);
  if (requestedStatus && requestedStatus !== current.status) {
    update = update.eq("status", current.status);
  }

  const { data, error } = await update
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[appointments] update failed", error);
    const failure = appointmentWriteFailure(error);
    if (failure) throw new ApiError(failure.message, failure.status);
    throw new ApiError("Could not update that appointment.", 500);
  }
  if (!data) throw new ApiError("The appointment changed. Reload the schedule and try again.", 409);

  return NextResponse.json({ ok: true });
});

export const DELETE = withDoctor<{ id: string }>(async ({ doctor, supabase, params }) => {
  const currentResult = await practiceTable(supabase, "appointments")
    .select("id, status")
    .eq("id", params.id)
    .eq("clinic_id", doctor.clinic_id)
    .maybeSingle();
  if (currentResult.error) {
    console.error("[appointments] lookup before cancel failed", currentResult.error);
    throw new ApiError("Could not cancel that appointment.", 500);
  }
  if (!currentResult.data) throw new ApiError("Appointment not found.", 404);

  const current = currentResult.data as { id: string; status: unknown };
  if (!isAppointmentStatus(current.status)) {
    console.error("[appointments] invalid stored status", current.id, current.status);
    throw new ApiError("Could not cancel that appointment.", 500);
  }
  if (current.status === "completed") {
    throw new ApiError("Completed appointments cannot be cancelled.", 409);
  }
  if (current.status === "cancelled") return NextResponse.json({ ok: true });
  if (!canTransitionAppointmentStatus(current.status, "cancelled")) {
    throw new ApiError("This closed appointment cannot be cancelled.", 409);
  }

  const { data, error } = await practiceTable(supabase, "appointments")
    .update({ status: "cancelled" })
    .eq("id", params.id)
    .eq("clinic_id", doctor.clinic_id)
    .eq("status", current.status)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[appointments] cancel failed", error);
    const failure = appointmentWriteFailure(error);
    if (failure) throw new ApiError(failure.message, failure.status);
    throw new ApiError("Could not cancel that appointment.", 500);
  }
  if (!data) throw new ApiError("The appointment changed. Reload the schedule and try again.", 409);
  return NextResponse.json({ ok: true });
});

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function statusLabel(status: AppointmentStatus): string {
  return status.replaceAll("_", " ");
}
