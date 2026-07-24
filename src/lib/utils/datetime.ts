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
