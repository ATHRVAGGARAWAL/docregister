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

/**
 * `??` catches null and undefined; it does not catch NaN, and these values come
 * from summed API responses where a NaN is entirely reachable. `formatINR(NaN)`
 * used to render the string "₹NaN" into the revenue hero.
 */
function finite(value: number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatINR(value: number | null | undefined): string {
  return inr.format(finite(value));
}

export function formatCount(value: number | null | undefined): string {
  return plain.format(finite(value));
}

/** Axis ticks only — compact forms save horizontal space a phone doesn't have. */
export function formatCompactINR(input: number): string {
  const value = finite(input);
  if (value < 0) return `-${formatCompactINR(-value)}`;
  if (value >= 10_000_000) return `₹${(value / 10_000_000).toFixed(1)}Cr`;
  if (value >= 100_000) return `₹${(value / 100_000).toFixed(1)}L`;
  if (value >= 1_000) return `₹${Math.round(value / 1_000)}k`;
  return `₹${Math.round(value)}`;
}

/**
 * Hoisted for the same reason `inr` and `plain` are: `formatDayShort` is a
 * Recharts `tickFormatter`, so constructing a DateTimeFormat inside it built one
 * per tick per render — ninety of them for a 90-day window.
 */
const dayShort = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Kolkata",
});

const dayLong = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "Asia/Kolkata",
});

const clock = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

/**
 * `Intl.DateTimeFormat.format()` throws a RangeError on an Invalid Date rather
 * than returning something harmless. In a chart tick formatter that does not
 * produce a blank tick — it takes down the whole chart. `formatVisitDay` below
 * has always guarded; these three did not.
 */
function dayStart(iso: string): Date | null {
  const date = new Date(`${iso}T00:00:00+05:30`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "24 Aug" — short enough for a mobile axis, unambiguous across months. */
export function formatDayShort(iso: string): string {
  const date = dayStart(iso);
  return date ? dayShort.format(date) : "—";
}

export function formatDayLong(iso: string): string {
  const date = dayStart(iso);
  return date ? dayLong.format(date) : "—";
}

export function formatClock(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : clock.format(date);
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

/**
 * Today's date in IST as "YYYY-MM-DD".
 *
 * Lives here rather than in `analytics.ts` because that module is `server-only`
 * and the charts are client components that legitimately need to know whether
 * the last point in a series is actually today. `en-CA` because it formats as
 * ISO-8601, which is the only locale that does so reliably.
 */
export function todayInIndia(): string {
  return isoDay.format(new Date());
}

const isoDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
