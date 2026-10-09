import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { getCancellationPolicy, quoteCancellation, DEPOSIT_AMOUNT } from "@/lib/utils/cancellation";
import { netPaid } from "@/lib/services/booking-txn";
import { recordStaffAction } from "@/lib/services/staff-action";
import { processBookingRefund } from "@/lib/services/refund";
import { z } from "zod";

const Schema = z.object({
  // Admin can optionally override the charge (e.g., waive it as goodwill)
  overrideCharge: z.number().min(0).optional(),
  /** Why it's being cancelled — goes to the owner and into the activity log. */
  reason: z.string().trim().max(300).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.hotelId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "HOTEL_ADMIN" && session.user.role !== "HOTEL_STAFF" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const booking = await prisma.booking.findFirst({
    where: {
      id,
      hotelId: session.user.hotelId,
      status: { in: ["CONFIRMED", "PENDING_PAYMENT"] },
    },
    select: {
      id: true,
      checkInDate: true,
      totalAmount: true,
      onlinePaid: true,
      primaryGuest: { select: { name: true } },
      refundableDeposit: true,
      bookingRef: true,
      roomId: true,
      status: true,
    },
  });

  if (!booking) {
    return NextResponse.json(
      { error: "Booking not found or cannot be cancelled" },
      { status: 404 }
    );
  }

  const policy = getCancellationPolicy(new Date(booking.checkInDate));

  // Quoted against what the guest has actually paid, read from the ledger. A
  // booking nobody paid for used to come out of the policy "owed" a refund and
  // "charged" a fee on money that never arrived; both are now held to it.
  // (An online advance is still treated as before: the policy percentage
  // applies to the advance, since the rest was never collected.)
  const paid = (await netPaid([booking.id])).get(booking.id) ?? 0;
  const quote = quoteCancellation({
    totalAmount: booking.totalAmount,
    depositAmount: booking.refundableDeposit ?? DEPOSIT_AMOUNT,
    chargePercent: policy.chargePercent,
    paid,
    onlineAdvance: booking.onlinePaid,
    overrideCharge: parsed.data.overrideCharge,
  });
  const finalCharge = quote.charge;
  const totalRefund = quote.refund;

  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancellationCharge: finalCharge,
    },
  });

  // Issue the refund (auto via Razorpay where possible; otherwise flagged for the desk).
  const refund = await processBookingRefund(booking.id, totalRefund, {
    reason: `Admin cancellation (${policy.tier})`,
  });

  // Cancelling no longer waits on an approval code. The owner is told as it
  // happens — including the refund, which is the part they'd want to query.
  await recordStaffAction({
    hotelId: session.user.hotelId,
    kind: "CANCEL_BOOKING",
    summary: `Booking ${booking.bookingRef} was cancelled (${policy.tier} policy).`,
    amount: totalRefund,
    refType: "booking",
    refId: booking.id,
    bookingRef: booking.bookingRef,
    guestName: booking.primaryGuest?.name ?? undefined,
    reason: parsed.data.reason?.trim() || undefined,
    actorId: session.user.id,
    actorName: session.user.name ?? session.user.email ?? "Staff",
    actorRole: session.user.role ?? "HOTEL_STAFF",
    details: { cancellationCharge: finalCharge, totalRefund, tier: policy.tier, refundStatus: refund.refundStatus },
    notifyLines: quote.unpaid
      ? ["Nothing had been paid on this booking, so there is no refund and no fee."]
      : [
          `Refund to guest: ₹${totalRefund.toLocaleString("en-IN")} (${refund.refundStatus.toLowerCase()})`,
          `Retained as cancellation fee: ₹${finalCharge.toLocaleString("en-IN")}`,
        ],
  });

  return NextResponse.json({
    success: true,
    bookingRef: booking.bookingRef,
    cancellationCharge: finalCharge,
    totalRefund,
    tier: policy.tier,
    refundStatus: refund.refundStatus,
    refundMessage: quote.unpaid ? "Booking cancelled — nothing had been paid, so nothing to refund" : refund.message,
  });
}
