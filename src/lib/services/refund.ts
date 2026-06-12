import { prisma } from "@/lib/db/prisma";
import { createRefund } from "@/lib/services/razorpay";

export type RefundOutcome = {
  refundStatus: "NONE" | "PENDING" | "PROCESSED" | "FAILED";
  refundAmount: number;
  refundId?: string | null;
  message: string;
};

/**
 * Process the refund owed on a (just-cancelled) booking.
 *
 * Rules:
 *  • Nothing owed → NONE.
 *  • Online-paid → attempt a Razorpay refund of the online portion; success =>
 *    PROCESSED, error => FAILED (admin can retry). Any cash portion still owed
 *    leaves the status PENDING for the desk to hand back.
 *  • Cash-only / pay-at-hotel with money collected → PENDING (refunded manually
 *    at the desk, then marked done by an admin).
 *
 * Idempotent: a booking already PROCESSED (or with a refundId) is left as-is.
 * Never throws — a payment-gateway error must not block the cancellation itself.
 */
export async function processBookingRefund(
  bookingId: string,
  refundAmount: number,
  opts: { reason?: string } = {}
): Promise<RefundOutcome> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      bookingRef: true,
      onlinePaid: true,
      cashPaid: true,
      refundStatus: true,
      refundId: true,
      payment: { select: { id: true, razorpayPaymentId: true, refundAmount: true, amount: true } },
    },
  });
  if (!booking) {
    return { refundStatus: "NONE", refundAmount: 0, message: "Booking not found" };
  }

  // Already settled — don't double-refund.
  if (booking.refundStatus === "PROCESSED" || booking.refundId) {
    return {
      refundStatus: "PROCESSED",
      refundAmount: 0,
      refundId: booking.refundId,
      message: "Refund already processed",
    };
  }

  const owed = Math.max(0, Math.round(refundAmount));
  if (owed <= 0) {
    await prisma.booking.update({
      where: { id: bookingId },
      data: { refundStatus: "NONE", refundAmount: 0 },
    });
    return { refundStatus: "NONE", refundAmount: 0, message: "No refund due" };
  }

  const paymentId = booking.payment?.razorpayPaymentId;
  // For a multi-room group the captured online amount lives on the shared Payment
  // (= group total), not this booking's per-room onlinePaid. Cap by the real
  // captured amount (less anything already refunded) when an online payment exists.
  const paidOnline = paymentId
    ? booking.payment!.amount - (booking.payment!.refundAmount ?? 0)
    : booking.onlinePaid;
  const onlinePortion = Math.min(owed, Math.round(paidOnline));

  // ── Online auto-refund path ──
  if (onlinePortion > 0 && paymentId) {
    try {
      const refund = await createRefund(paymentId, onlinePortion * 100, {
        bookingRef: booking.bookingRef,
        reason: opts.reason ?? "Booking cancelled",
      });
      const fullySettled = onlinePortion >= owed; // any leftover is a cash refund
      await prisma.booking.update({
        where: { id: bookingId },
        data: {
          refundStatus: fullySettled ? "PROCESSED" : "PENDING",
          refundAmount: owed,
          refundId: refund.id,
          refundedAt: new Date(),
        },
      });
      if (booking.payment) {
        await prisma.payment.update({
          where: { id: booking.payment.id },
          data: {
            refundAmount: (booking.payment.refundAmount ?? 0) + onlinePortion,
            refundedAt: new Date(),
            status: onlinePortion >= Math.round(booking.onlinePaid) ? "refunded" : "partial_refund",
          },
        });
      }
      return {
        refundStatus: fullySettled ? "PROCESSED" : "PENDING",
        refundAmount: owed,
        refundId: refund.id,
        message: fullySettled
          ? `₹${owed.toLocaleString("en-IN")} refunded to the original payment method`
          : `₹${onlinePortion.toLocaleString("en-IN")} refunded online; ₹${(owed - onlinePortion).toLocaleString("en-IN")} to be returned at the desk`,
      };
    } catch (err) {
      console.error("[refund] Razorpay refund failed for", booking.bookingRef, err);
      await prisma.booking.update({
        where: { id: bookingId },
        data: { refundStatus: "FAILED", refundAmount: owed },
      });
      return {
        refundStatus: "FAILED",
        refundAmount: owed,
        message: "Automatic refund failed — please retry or refund manually",
      };
    }
  }

  // ── Manual path (cash collected, or no gateway payment to refund to) ──
  await prisma.booking.update({
    where: { id: bookingId },
    data: { refundStatus: "PENDING", refundAmount: owed },
  });
  return {
    refundStatus: "PENDING",
    refundAmount: owed,
    message: `₹${owed.toLocaleString("en-IN")} to be refunded manually`,
  };
}

/** Mark a PENDING/FAILED cash refund as handed back manually by staff. */
export async function markRefundManual(
  bookingId: string,
  by: string
): Promise<RefundOutcome> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { refundAmount: true, refundStatus: true },
  });
  if (!booking) return { refundStatus: "NONE", refundAmount: 0, message: "Booking not found" };

  await prisma.booking.update({
    where: { id: bookingId },
    data: { refundStatus: "PROCESSED", refundedAt: new Date(), refundId: `MANUAL:${by}` },
  });
  return {
    refundStatus: "PROCESSED",
    refundAmount: booking.refundAmount,
    message: "Marked as refunded",
  };
}
