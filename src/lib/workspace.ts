/** Clinic dates are Indian calendar days, regardless of the device timezone. */
export function clinicDay(value: Date | string = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export function clinicDayWindow(day: string): { from: string; to: string } {
  const from = new Date(`${day}T00:00:00+05:30`);
  return {
    from: from.toISOString(),
    to: new Date(from.getTime() + 86_400_000).toISOString(),
  };
}

export const APPOINTMENT_LABELS = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  checked_in: "Waiting",
  in_chair: "In consultation",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "Did not attend",
} as const;
