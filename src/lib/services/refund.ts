import { prisma } from "@/lib/db/prisma";
import { createRefund } from "@/lib/services/razorpay";
import { recordTxn, netPaid, allocateRefund } from "@/lib/services/booking-txn";

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
 *  • A refund is never more than the guest has actually paid and not yet had
 *    back. Callers quote against the room price; whatever they ask for is held
 *    to the money that really arrived, so a booking nobody paid for can never
 *    end up "owed" a refund. The deposit is not payment and is not counted.
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
      hotelId: true,
      onlinePaid: true,
      cashPaid: true,
      refundStatus: true,
      refundId: true,
      bookingGroupId: true,
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

  // The ceiling: what has actually been paid across the rooms this payment
  // covers. A multi-room checkout shares one payment, so the group is read
  // together; a single booking is just itself.
  const paid = await paidFor(bookingId, booking.bookingGroupId);
  const refundable = Math.floor([...paid.values()].reduce((a, b) => a + b, 0));
  const asked = Math.max(0, Math.round(refundAmount));
  const owed = Math.min(asked, refundable);
  if (owed < asked) {
    console.warn(`[refund] ${booking.bookingRef}: ₹${asked} asked, held to ₹${owed} — only ₹${refundable} was paid`);
  }
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
      // Ledger — money genuinely on its way back to the guest's account. The
      // cash portion (if any) is recorded separately, when the desk hands it
      // over, so the drawer isn't debited for notes still sitting in it.
      // Each room is given back its own share, so no booking's account shows
      // more refunded than it paid. The first entry keeps the plain key.
      const shares = allocateRefund(onlinePortion, paid, bookingId);
      for (const [i, share] of shares.entries()) {
        await recordTxn({
          hotelId: booking.hotelId,
          bookingId: share.bookingId,
          kind: "REFUND",
          mode: "ONLINE",
          refundVia: "ONLINE",
          amount: share.amount,
          note: opts.reason ?? "Refunded to the original payment method",
          idemKey: i === 0 ? `refund:${refund.id}` : `refund:${refund.id}:${share.bookingId}`,
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

/** The bookings a refund draws on, with what each has paid and not had back. */
async function paidFor(bookingId: string, groupId: string | null): Promise<Map<string, number>> {
  const ids = groupId
    ? (await prisma.booking.findMany({ where: { bookingGroupId: groupId }, select: { id: true } })).map(b => b.id)
    : [bookingId];
  return netPaid(ids.includes(bookingId) ? ids : [bookingId, ...ids]);
}

/** Mark a PENDING/FAILED cash refund as handed back manually by staff. */
export async function markRefundManual(
  bookingId: string,
  by: string
): Promise<RefundOutcome> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { refundAmount: true, refundStatus: true, hotelId: true, bookingGroupId: true },
  });
  if (!booking) return { refundStatus: "NONE", refundAmount: 0, message: "Booking not found" };

  await prisma.booking.update({
    where: { id: bookingId },
    data: { refundStatus: "PROCESSED", refundedAt: new Date(), refundId: `MANUAL:${by}` },
  });

  // Only the part still to be handed over is cash. When some of the refund has
  // already gone back through the gateway, `refundAmount` is the whole of it —
  // recording all of that as cash would take the online part out of the drawer
  // a second time.
  const paid = await paidFor(bookingId, booking.bookingGroupId);
  const sentOnline = await prisma.bookingTxn.aggregate({
    where: { bookingId: { in: [...paid.keys()] }, kind: "REFUND", idemKey: { startsWith: "refund:" } },
    _sum: { amount: true },
  });
  const cashDue = Math.max(0, (booking.refundAmount ?? 0) - (sentOnline._sum.amount ?? 0));

  // The notes have now physically left the drawer, so this is the moment the
  // cash figure should drop — not when the refund was first agreed. `paid`
  // already has the online part taken off, so it bounds the cash on its own.
  const shares = allocateRefund(cashDue, paid, bookingId);
  for (const [i, share] of shares.entries()) {
    await recordTxn({
      hotelId: booking.hotelId,
      bookingId: share.bookingId,
      kind: "REFUND",
      mode: "CASH",
      refundVia: "CASH",
      amount: share.amount,
      note: "Refunded in cash at the desk",
      recordedBy: by,
      idemKey: i === 0 ? `refund-manual:${bookingId}` : `refund-manual:${bookingId}:${share.bookingId}`,
    });
  }
  return {
    refundStatus: "PROCESSED",
    refundAmount: booking.refundAmount,
    message: "Marked as refunded",
  };
}
