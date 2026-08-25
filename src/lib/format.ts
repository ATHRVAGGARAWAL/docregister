/**
 * Formatting helpers.
 *
 * `en-IN` matters: Indian digit grouping is 2-2-3, so ₹1,25,000 — not
 * ₹125,000. A doctor reading "₹125,000" has to stop and count zeros, which is
 * exactly the friction a glanceable dashboard is supposed to remove.
 */

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const plain = new Intl.NumberFormat("en-IN");

export function formatINR(value: number | null | undefined): string {
  return inr.format(Number(value ?? 0));
}

export function formatCount(value: number | null | undefined): string {
  return plain.format(Number(value ?? 0));
}

/** Axis ticks only — compact forms save horizontal space a phone doesn't have. */
export function formatCompactINR(value: number): string {
  if (value >= 10_000_000) return `₹${(value / 10_000_000).toFixed(1)}Cr`;
  if (value >= 100_000) return `₹${(value / 100_000).toFixed(1)}L`;
  if (value >= 1_000) return `₹${Math.round(value / 1_000)}k`;
  return `₹${value}`;
}

/** "24 Aug" — short enough for a mobile axis, unambiguous across months. */
export function formatDayShort(iso: string): string {
  const date = new Date(`${iso}T00:00:00+05:30`);
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

export function formatDayLong(iso: string): string {
  const date = new Date(`${iso}T00:00:00+05:30`);
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

export function formatClock(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

export function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * "98765 43210" -> "·····43210".
 *
 * Shown when the doctor is choosing between two patients with the same name,
 * which is the one moment a phone number is worth putting on screen. The last
 * five digits are enough to tell two charts apart and are what a doctor would
 * read back to confirm; the first five are the part that makes a screenshot of
 * this sheet a contact record.
 */
export function maskPhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 5) return null;
  return `·····${digits.slice(-5)}`;
}

/** "24 Aug" from a timestamptz, or null. Tolerates a bad value rather than throwing. */
export function formatVisitDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(date);
}
