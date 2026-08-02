import { prisma } from "@/lib/db/prisma";

/**
 * Close out stays nobody checked out.
 *
 * A booking left CHECKED_IN keeps its room reading "occupied by X" on the room
 * board forever — the front desk was seeing a guest from weeks earlier as the
 * current occupant. Sweeping them shortly after check-out time keeps the board
 * honest without anyone having to remember.
 *
 * Deliberately conservative about money: it does NOT settle the deposit or zero
 * the balance, because nobody was there to take or hand back anything. Whatever
 * is owed stays owed and any deposit stays held, for staff to settle properly.
 * The note records that the system closed it, so it's never mistaken for a
 * completed settlement.
 */

/** Grace after the hotel's check-out time before a stay is closed automatically. */
export const AUTO_CHECKOUT_GRACE_HOURS = 1;

/** "10:00 AM" / "10:00" / "14:30" → minutes since midnight. */
export function parseTimeToMinutes(value: string | null | undefined, fallback = 600): number {
  if (!value) return fallback;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return fallback;
  let hours = parseInt(m[1], 10);
  const mins = parseInt(m[2], 10);
  const suffix = m[3]?.toUpperCase();
  if (suffix === "PM" && hours < 12) hours += 12;
  if (suffix === "AM" && hours === 12) hours = 0;
  if (hours > 23 || mins > 59) return fallback;
  return hours * 60 + mins;
}

/** IST is UTC+5:30; the hotel's clock, not the server's. */
const IST_OFFSET_MINUTES = 5 * 60 + 30;

/**
 * The moment a stay becomes overdue: check-out date + check-out time + grace,
 * read on the hotel's clock.
 *
 * Stay dates are stored as UTC midnight standing for a calendar date, and the
 * hotel's check-out time is IST. Deriving the deadline from UTC parts rather
 * than the server's local time keeps this identical in production (UTC) and on
 * a developer's machine (IST) — otherwise the sweep runs 5½ hours late on
 * Vercel.
 */
export function overdueDeadline(checkOutDate: Date, checkOutTime: string | null): Date {
  const minutes = parseTimeToMinutes(checkOutTime);
  const utcMidnight = Date.UTC(
    checkOutDate.getUTCFullYear(),
    checkOutDate.getUTCMonth(),
    checkOutDate.getUTCDate()
  );
  const afterGrace = minutes + AUTO_CHECKOUT_GRACE_HOURS * 60 - IST_OFFSET_MINUTES;
  return new Date(utcMidnight + afterGrace * 60_000);
}

export interface AutoCheckoutResult {
  closed: { bookingRef: string; guest: string; room: string | null; owed: number }[];
  scanned: number;
}

/**
 * Check out every CHECKED_IN stay past its grace deadline.
 * Safe to run repeatedly — already checked-out bookings are not selected.
 */
export async function autoCheckoutOverdue(now = new Date()): Promise<AutoCheckoutResult> {
  const candidates = await prisma.booking.findMany({
    where: { status: "CHECKED_IN" },
    select: {
      id: true, bookingRef: true, roomId: true, checkOutDate: true,
      balanceDue: true, additionalCharges: true, depositNotes: true,
      hotel: { select: { checkOutTime: true } },
      room: { select: { roomNumber: true } },
      primaryGuest: { select: { name: true } },
    },
  });

  const closed: AutoCheckoutResult["closed"] = [];

  for (const b of candidates) {
    const deadline = overdueDeadline(b.checkOutDate, b.hotel?.checkOutTime ?? null);
    if (now < deadline) continue;

    const owed = +(b.balanceDue + b.additionalCharges).toFixed(2);
    const note = "Auto-closed: not checked out by staff. Any balance or deposit is unsettled.";

    await prisma.booking.update({
      where: { id: b.id },
      data: {
        status: "CHECKED_OUT",
        // The moment it *should* have ended, not when the sweep happened.
        checkedOutAt: deadline,
        depositNotes: b.depositNotes ? `${b.depositNotes} — ${note}` : note,
      },
    });

    // Free the room, unless another stay is still legitimately in it.
    if (b.roomId) {
      const stillOccupied = await prisma.booking.count({
        where: { roomId: b.roomId, status: "CHECKED_IN" },
      });
      if (stillOccupied === 0) {
        await prisma.room.update({
          where: { id: b.roomId },
          data: { status: "CLEANING" },
        });
      }
    }

    closed.push({
      bookingRef: b.bookingRef,
      guest: b.primaryGuest.name,
      room: b.room?.roomNumber ?? null,
      owed,
    });
  }

  return { closed, scanned: candidates.length };
}
