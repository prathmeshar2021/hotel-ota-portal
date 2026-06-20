import { prisma } from "@/lib/db/prisma";
import { gupshup } from "@/lib/services/gupshup";
import { syncBookingToAppSheet } from "@/lib/services/appsheet-sync";
import { format } from "date-fns";
import { getCategoryMeta } from "@/lib/utils/room-categories";

/**
 * Idempotently confirm a paid online booking.
 *
 * Both the browser-side verify route AND the Razorpay webhook can call this for
 * the same payment (e.g. the guest's tab fires the handler while the webhook
 * also lands). A conditional `updateMany` claims the PENDING_PAYMENT → CONFIRMED
 * transition atomically, so exactly one caller "wins" and runs the side-effects
 * (amount settle, WhatsApp, AppSheet sync); the rest are safe no-ops.
 *
 * @returns null if the booking doesn't exist, otherwise its ref + whether it was
 *          already confirmed before this call.
 */
export async function confirmPaidBooking(params: {
  bookingId: string;
  razorpayPaymentId?: string;
  /** Amount actually captured (in paise), when known — used to verify and record the real paid amount. */
  capturedPaise?: number;
}): Promise<{ bookingRef: string; alreadyConfirmed: boolean } | null> {
  const { bookingId, razorpayPaymentId, capturedPaise } = params;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { primaryGuest: true, hotel: true, payment: true },
  });
  if (!booking) return null;

  // A multi-room cart checkout shares one payment across a group of bookings —
  // confirm the whole group atomically. Single bookings claim just themselves.
  const groupId = booking.bookingGroupId;
  const claimWhere = groupId
    ? { bookingGroupId: groupId, status: "PENDING_PAYMENT" as const }
    : { id: bookingId, status: "PENDING_PAYMENT" as const };
  const claimed = await prisma.booking.updateMany({ where: claimWhere, data: { status: "CONFIRMED" } });

  // Someone already confirmed it (or it was never pending) — nothing more to do.
  if (claimed.count === 0) {
    return { bookingRef: booking.bookingRef, alreadyConfirmed: true };
  }

  // The shared payment row's amount is the group total (or the single booking's).
  const expectedTotal = booking.payment?.amount ?? booking.totalAmount;
  const captured = capturedPaise != null ? Math.round(capturedPaise) / 100 : expectedTotal;
  if (capturedPaise != null && Math.abs(captured - expectedTotal) > 1) {
    console.warn(
      `[confirm] amount mismatch for ${booking.bookingRef}: captured ₹${captured}, expected ₹${expectedTotal}`
    );
  }

  // Settle every booking in the group using the ACTUAL captured amount,
  // not the booking total — this handles PAY_PARTIAL (₹500/room) correctly.
  const groupBookings = groupId
    ? await prisma.booking.findMany({ where: { bookingGroupId: groupId }, select: { id: true, totalAmount: true } })
    : [{ id: booking.id, totalAmount: booking.totalAmount }];
  const capturedPerRoom = captured / groupBookings.length;
  for (const b of groupBookings) {
    const onlinePaid = +Math.min(capturedPerRoom, b.totalAmount).toFixed(2);
    const balanceDue = +Math.max(0, b.totalAmount - onlinePaid).toFixed(2);
    await prisma.booking.update({
      where: { id: b.id },
      data: { onlinePaid, balanceDue },
    });
  }

  // Settle the shared payment row (lives on the primary booking).
  if (booking.payment) {
    await prisma.payment.update({
      where: { id: booking.payment.id },
      data: {
        ...(razorpayPaymentId ? { razorpayPaymentId } : {}),
        status: "captured",
        paidAt: new Date(),
      },
    });
  }

  // WhatsApp confirmation (fire-and-forget). One message for the whole group.
  if (booking.primaryGuest.phone) {
    const roomType =
      groupBookings.length > 1
        ? `${groupBookings.length} rooms`
        : getCategoryMeta(booking.roomCategory).displayName;
    gupshup
      .sendBookingConfirmation(booking.primaryGuest.phone, {
        guestName: booking.primaryGuest.name,
        bookingRef: booking.bookingRef,
        hotelName: booking.hotel.name,
        roomType,
        checkIn: format(booking.checkInDate, "dd MMM yyyy"),
        checkOut: format(booking.checkOutDate, "dd MMM yyyy"),
        totalAmount: expectedTotal,
      })
      .catch((e) => console.error("[WhatsApp] Confirmation failed:", e));
  }

  // Sync each room booking to AppSheet.
  for (const b of groupBookings) {
    syncBookingToAppSheet(b.id).catch((e) => console.error("[AppSheet Sync]:", e));
  }

  return { bookingRef: booking.bookingRef, alreadyConfirmed: false };
}
