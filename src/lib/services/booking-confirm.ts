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
}): Promise<{ bookingRef: string; alreadyConfirmed: boolean } | null> {
  const { bookingId, razorpayPaymentId } = params;

  // Atomically claim the confirmation — only succeeds for the first caller.
  const claimed = await prisma.booking.updateMany({
    where: { id: bookingId, status: "PENDING_PAYMENT" },
    data: { status: "CONFIRMED" },
  });

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { primaryGuest: true, hotel: true, payment: true },
  });
  if (!booking) return null;

  // Someone already confirmed it (or it was never pending) — nothing more to do.
  if (claimed.count === 0) {
    return { bookingRef: booking.bookingRef, alreadyConfirmed: true };
  }

  // We own the confirmation — settle the payment + amounts.
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      onlinePaid: booking.totalAmount,
      balanceDue: 0,
      ...(booking.payment
        ? {
            payment: {
              update: {
                ...(razorpayPaymentId ? { razorpayPaymentId } : {}),
                status: "captured",
                paidAt: new Date(),
              },
            },
          }
        : {}),
    },
  });

  // WhatsApp confirmation (fire-and-forget)
  if (booking.primaryGuest.phone) {
    gupshup
      .sendBookingConfirmation(booking.primaryGuest.phone, {
        guestName: booking.primaryGuest.name,
        bookingRef: booking.bookingRef,
        hotelName: booking.hotel.name,
        roomType: getCategoryMeta(booking.roomCategory).displayName,
        checkIn: format(booking.checkInDate, "dd MMM yyyy"),
        checkOut: format(booking.checkOutDate, "dd MMM yyyy"),
        totalAmount: booking.totalAmount,
      })
      .catch((e) => console.error("[WhatsApp] Confirmation failed:", e));
  }

  // AppSheet sync (fire-and-forget)
  syncBookingToAppSheet(booking.id).catch((e) => console.error("[AppSheet Sync]:", e));

  return { bookingRef: booking.bookingRef, alreadyConfirmed: false };
}
