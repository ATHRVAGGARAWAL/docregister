import type { AppointmentStatus } from "@/lib/practice/types";

export const APPOINTMENT_STATUSES = [
  "scheduled",
  "confirmed",
  "checked_in",
  "in_chair",
  "completed",
  "cancelled",
  "no_show",
] as const satisfies readonly AppointmentStatus[];

const appointmentStatusSet = new Set<string>(APPOINTMENT_STATUSES);

const allowedTransitions: Record<AppointmentStatus, ReadonlySet<AppointmentStatus>> = {
  scheduled: new Set(["confirmed", "checked_in", "cancelled", "no_show"]),
  confirmed: new Set(["scheduled", "checked_in", "cancelled", "no_show"]),
  checked_in: new Set(["confirmed", "in_chair", "cancelled"]),
  in_chair: new Set(["checked_in", "completed"]),
  completed: new Set(),
  cancelled: new Set(),
  no_show: new Set(),
};

export function isAppointmentStatus(value: unknown): value is AppointmentStatus {
  return typeof value === "string" && appointmentStatusSet.has(value);
}

/**
 * Appointment flow is deliberately mostly forward-only. The single-step
 * backwards moves let reception correct an accidental click without allowing
 * a closed appointment to be reopened and silently rewrite its history.
 */
export function canTransitionAppointmentStatus(
  from: AppointmentStatus,
  to: AppointmentStatus,
): boolean {
  return from === to || allowedTransitions[from].has(to);
}

interface DatabaseErrorLike {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

export interface AppointmentWriteFailure {
  message: string;
  status: number;
}

/** Map expected database invariants to safe, actionable API errors. */
export function appointmentWriteFailure(
  error: DatabaseErrorLike | null | undefined,
): AppointmentWriteFailure | null {
  if (!error) return null;

  if (error.code === "23P01") {
    const detail = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
    if (detail.includes("appointments_clinician_no_overlap")) {
      return {
        message: "That clinician is already booked during this time.",
        status: 409,
      };
    }
    if (detail.includes("appointments_operatory_no_overlap")) {
      return {
        message: "That operatory is already booked during this time.",
        status: 409,
      };
    }
    return {
      message: "That time overlaps another active appointment.",
      status: 409,
    };
  }

  if (error.code === "23514") {
    return {
      message: "That appointment change is not allowed.",
      status: 409,
    };
  }

  if (error.code === "23503") {
    return {
      message: "Choose a patient, clinician and operatory from this clinic.",
      status: 422,
    };
  }

  return null;
}
