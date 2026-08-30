import { formatInTimeZone } from "date-fns-tz";

/**
 * The business runs in India, but the server (Vercel) runs in UTC. date-fns
 * `format()` uses the *server* timezone, so timestamps render ~5.5h behind IST.
 * Use `fmtIST` for any date/time shown to a user so it always displays in
 * India Standard Time regardless of where the code runs.
 */
export const IST_TZ = "Asia/Kolkata";

/** Format a Date (or ms) in India Standard Time using a date-fns pattern. */
export function fmtIST(date: Date | number, pattern: string): string {
  return formatInTimeZone(date, IST_TZ, pattern);
}

/**
 * Today's date in India, as YYYY-MM-DD — the value a `<input type="date">`
 * expects.
 *
 * Deriving it from `toISOString()` would give the UTC day, which is the
 * previous date for the whole IST evening: a booking taken at 8pm would
 * default to yesterday. `offsetDays` shifts by whole days, so tomorrow is
 * `istDateInput(1)`.
 */
export function istDateInput(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return fmtIST(d, "yyyy-MM-dd");
}

/**
 * Shift a `YYYY-MM-DD` input value by whole days.
 *
 * Parsed at UTC midnight on purpose: these are calendar dates, not instants,
 * so constructing them in local time would shift the result by a day for
 * anyone west of Greenwich.
 */
export function shiftDateInput(value: string, days: number): string {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}
