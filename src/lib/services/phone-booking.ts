import { prisma } from "@/lib/db/prisma";
import {
  resolveCategoryCapacity,
  inventoryHoldFilter,
} from "@/lib/utils/inventory";
import { confirmPaidBooking } from "@/lib/services/booking-confirm";
import { createRefund } from "@/lib/services/razorpay";
import { gupshup } from "@/lib/services/gupshup";
import { getCategoryMeta } from "@/lib/utils/room-categories";
import type { RoomType } from "@prisma/client";

/**
 * Confirm a phone booking whose WhatsApp Payment Link was just paid.
 *
 * Called from the Razorpay `payment_link.paid` webhook. Adds the overbooking guard
 * (G4) that the browser flow doesn't need: because a phone guest can take many
 * minutes to pay, the room could get taken in the meantime. Rather than silently
 * overbook, we re-check capacity at payment time and, on a genuine race, refund the
 * guest and alert the owner instead of confirming.
 *
 * Delegates the happy path to the shared, idempotent `confirmPaidBooking()` — so
 * WhatsApp confirmation, room allotment and AppSheet sync are all reused unchanged.
 */
export type PhoneLinkOutcome =
  | { outcome: "confirmed"; bookingRef: string }
  | { outcome: "already_confirmed"; bookingRef: string }
  | { outcome: "overbooking_refunded"; bookingRef: string }
  | { outcome: "not_found" };

export async function confirmPhonePaymentLink(params: {
  bookingRef: string;
  razorpayPaymentId?: string;
  capturedPaise?: number;
}): Promise<PhoneLinkOutcome> {
  const { bookingRef, razorpayPaymentId, capturedPaise } = params;

  const booking = await prisma.booking.findUnique({
    where: { bookingRef },
    include: {
      hotel: { select: { id: true, name: true } },
      primaryGuest: { select: { name: true, phone: true } },
    },
  });
  if (!booking) return { outcome: "not_found" };

  // Idempotency: a re-delivered webhook (or the browser return firing too) finds
  // the booking already out of PENDING_PAYMENT — nothing to do.
  if (booking.status !== "PENDING_PAYMENT") {
    return { outcome: "already_confirmed", bookingRef };
  }

  // ── G4: overbooking guard ──────────────────────────────────────────────────
  // Count OTHER bookings occupying inventory for this category/dates. If they
  // already fill capacity, there's no room left for THIS one — confirming would
  // oversell, so refund instead.
  const capacity = await resolveCategoryCapacity(
    booking.hotel.id,
    booking.roomCategory as RoomType,
    booking.checkInDate,
    booking.checkOutDate
  );
  const others = await prisma.booking.count({
    where: {
      hotelId: booking.hotel.id,
      roomCategory: booking.roomCategory,
      id: { not: booking.id },
      ...inventoryHoldFilter(),
      checkInDate: { lt: booking.checkOutDate },
      checkOutDate: { gt: booking.checkInDate },
    },
  });

  if (others >= capacity) {
    await handleOverbooking({
      booking: {
        id: booking.id,
        bookingRef: booking.bookingRef,
        roomCategory: booking.roomCategory,
        totalAmount: booking.totalAmount,
        guestPhone: booking.primaryGuest.phone ?? booking.guestPhone,
      },
      razorpayPaymentId,
      capturedPaise,
    });
    return { outcome: "overbooking_refunded", bookingRef };
  }

  const res = await confirmPaidBooking({
    bookingId: booking.id,
    razorpayPaymentId,
    capturedPaise,
  });
  return {
    outcome: res?.alreadyConfirmed ? "already_confirmed" : "confirmed",
    bookingRef,
  };
}

/** Refund an over-sold paid booking, cancel it, and alert the owner. */
async function handleOverbooking(args: {
  booking: {
    id: string;
    bookingRef: string;
    roomCategory: string;
    totalAmount: number;
    guestPhone: string | null;
  };
  razorpayPaymentId?: string;
  capturedPaise?: number;
}): Promise<void> {
  const { booking, razorpayPaymentId, capturedPaise } = args;
  const paidRupees =
    capturedPaise != null ? Math.round(capturedPaise) / 100 : booking.totalAmount;

  let refundId: string | undefined;
  let refundStatus: "PROCESSED" | "FAILED" = "FAILED";
  try {
    if (razorpayPaymentId) {
      const refund = await createRefund(razorpayPaymentId); // full refund
      refundId = (refund as { id?: string }).id;
      refundStatus = "PROCESSED";
    }
  } catch (e) {
    console.error(
      "[phone-booking] auto-refund FAILED for",
      booking.bookingRef,
      e
    );
    refundStatus = "FAILED";
  }

  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancellationCharge: 0,
      refundStatus,
      refundAmount: paidRupees,
      refundId: refundId ?? null,
      refundedAt: refundStatus === "PROCESSED" ? new Date() : null,
    },
  });
  await prisma.payment.updateMany({
    where: { bookingId: booking.id },
    data: { status: "refunded", refundedAt: new Date(), refundAmount: paidRupees },
  });

  const displayName = getCategoryMeta(booking.roomCategory).displayName;
  const alert =
    `⚠️ *Overbooking averted — action needed*\n\n` +
    `Booking ${booking.bookingRef} (${displayName}) was paid via link, but the ` +
    `${displayName} is now full for those dates.\n\n` +
    (refundStatus === "PROCESSED"
      ? `The guest's ₹${paidRupees.toLocaleString("en-IN")} has been auto-refunded. `
      : `⚠️ Auto-refund FAILED — please refund ₹${paidRupees.toLocaleString("en-IN")} manually. `) +
    `Please call the guest` +
    (booking.guestPhone ? ` (${booking.guestPhone})` : "") +
    ` to apologise or rebook.`;
  await Promise.allSettled([gupshup.sendOwnerText(alert)]);
}
