/**
 * A booking "entered late" is one recorded in the portal after the stay had
 * already begun — usually a walk-in that reception took on paper and only keyed
 * in the next day. Worth flagging, because it means the room was occupied
 * while the system showed it free, so occupancy and revenue for that day were
 * understated until someone caught up.
 *
 * Derived rather than stored: the two timestamps already say it, and deriving
 * means every historical booking is judged by the same rule as a new one.
 */

/** Calendar date in IST (the hotel's clock), as YYYY-MM-DD. */
function istDateKey(d: Date): string {
  // Stay dates are stored as UTC midnight standing for a local calendar date,
  // while createdAt is a real instant — shifting both into IST compares like
  // with like, and behaves the same on a UTC server as on a local machine.
  return new Date(d.getTime() + (5 * 60 + 30) * 60_000).toISOString().slice(0, 10);
}

/** Channels a member of staff keys in at the desk. */
const STAFF_ENTERED = new Set(["WALK_IN", "PHONE", "OTHER"]);

/**
 * True when staff recorded the booking on a later calendar day than the stay
 * started. Same-day entry is normal (a walk-in keyed in that afternoon) and is
 * deliberately not flagged.
 *
 * Only counter-created bookings qualify. A guest booking on the website at
 * 12:02 am for a stay dated the previous day is a late-night booking, not a
 * back-office catch-up, and tagging it would cry wolf.
 */
export function isLateEntry(
  createdAt: Date,
  checkInDate: Date,
  source?: string
): boolean {
  if (source !== undefined && !STAFF_ENTERED.has(source)) return false;
  // checkInDate is already a date-only value at UTC midnight, so read it as-is
  // rather than shifting it into IST a second time.
  const stayDay = checkInDate.toISOString().slice(0, 10);
  return istDateKey(createdAt) > stayDay;
}

/** How many days after the stay started it was entered — for the tooltip. */
export function daysLate(createdAt: Date, checkInDate: Date): number {
  const created = Date.parse(`${istDateKey(createdAt)}T00:00:00Z`);
  const stay = Date.parse(`${checkInDate.toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.max(0, Math.round((created - stay) / 86_400_000));
}
