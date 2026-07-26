import { prisma } from "@/lib/db/prisma";
import { autoAllotRoom } from "@/lib/services/room-allotment";

/**
 * Check-in readiness gate — shared by the counter-checkin and status routes so
 * both enforce the same rule: a stay can only be completed once a physical room
 * is assigned AND the guest's registration consent has been confirmed.
 */

/**
 * Guarantee the booking has a physical room. If none is assigned yet, try to
 * auto-allot one from the booked category (same algorithm used at booking time).
 * Returns the resolved roomId, or null if the category has no free room.
 */
export async function ensureRoomAssigned(booking: {
  id: string;
  hotelId: string;
  roomId: string | null;
  roomCategory: string;
  checkInDate: Date;
  checkOutDate: Date;
}): Promise<string | null> {
  if (booking.roomId) return booking.roomId;

  const roomId = await autoAllotRoom({
    hotelId: booking.hotelId,
    roomCategory: booking.roomCategory,
    checkInDate: booking.checkInDate,
    checkOutDate: booking.checkOutDate,
    excludeBookingId: booking.id,
  });

  if (roomId) {
    await prisma.booking.update({ where: { id: booking.id }, data: { roomId } });
  }
  return roomId;
}

/** True once the guest has accepted electronically or staff confirmed a signed copy. */
export async function isConsentConfirmed(bookingId: string): Promise<boolean> {
  const c = await prisma.consent.findUnique({
    where: { bookingId },
    select: { primaryAcceptedAt: true },
  });
  return !!c?.primaryAcceptedAt;
}

/**
 * Run the CONFIRMED → CHECKED_IN transition, but only if the gate above is
 * satisfied. Used when staff confirm a signed consent form so they don't have
 * to press "Complete Check-In" straight afterwards — the signature is the last
 * thing the gate waits on, so there's nothing left for staff to decide.
 *
 * Reports why it stopped rather than throwing, so the caller can still record
 * the consent even when the stay can't start yet.
 */
export async function completeCheckIn(booking: {
  id: string;
  hotelId: string;
  status: string;
  roomId: string | null;
  roomCategory: string;
  checkInDate: Date;
  checkOutDate: Date;
}): Promise<{ ok: true } | { ok: false; reason: "status" | "noRoom" | "consent" }> {
  // Only a confirmed reservation can start a stay; anything else (already
  // checked in, cancelled, no-show) is left untouched.
  if (booking.status !== "CONFIRMED") return { ok: false, reason: "status" };

  const roomId = await ensureRoomAssigned(booking);
  if (!roomId) return { ok: false, reason: "noRoom" };
  if (!(await isConsentConfirmed(booking.id))) return { ok: false, reason: "consent" };

  await prisma.$transaction([
    prisma.booking.update({
      where: { id: booking.id },
      data: { status: "CHECKED_IN", checkedInAt: new Date() },
    }),
    prisma.room.update({ where: { id: roomId }, data: { status: "OCCUPIED" } }),
  ]);
  return { ok: true };
}

export const CHECKIN_GATE_MESSAGES = {
  noRoom:
    "No room is available in this category to assign. Assign a room manually before checking in.",
  consent:
    "The guest's registration & consent form must be signed or accepted before check-in. " +
    "Print it for signature (then mark it received) or send it on WhatsApp for the guest to accept.",
} as const;
