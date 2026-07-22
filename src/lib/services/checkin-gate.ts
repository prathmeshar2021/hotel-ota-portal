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

export const CHECKIN_GATE_MESSAGES = {
  noRoom:
    "No room is available in this category to assign. Assign a room manually before checking in.",
  consent:
    "The guest's registration & consent form must be signed or accepted before check-in. " +
    "Print it for signature (then mark it received) or send it on WhatsApp for the guest to accept.",
} as const;
