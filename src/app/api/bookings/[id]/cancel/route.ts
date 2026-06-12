import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { getCancellationPolicy, computeCancellationBreakdown, DEPOSIT_AMOUNT } from "@/lib/utils/cancellation";
import { processBookingRefund } from "@/lib/services/refund";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "CUSTOMER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const booking = await prisma.booking.findFirst({
    where: {
      id,
      primaryGuestId: session.user.id,
      status: "CONFIRMED",
    },
    select: {
      id: true,
      checkInDate: true,
      totalAmount: true,
      refundableDeposit: true,
      bookingRef: true,
      bookingGroupId: true,
    },
  });

  if (!booking) {
    return NextResponse.json(
      { error: "Booking not found or cannot be cancelled" },
      { status: 404 }
    );
  }

  const policy = getCancellationPolicy(new Date(booking.checkInDate));

  // A multi-room cart booking shares one payment → cancel the whole group and
  // refund the group total via the booking that holds the payment.
  const groupBookings = booking.bookingGroupId
    ? await prisma.booking.findMany({
        where: { bookingGroupId: booking.bookingGroupId, primaryGuestId: session.user.id, status: "CONFIRMED" },
        select: { id: true, totalAmount: true, refundableDeposit: true },
      })
    : [{ id: booking.id, totalAmount: booking.totalAmount, refundableDeposit: booking.refundableDeposit }];

  let groupCharge = 0;
  let groupRefund = 0;
  for (const b of groupBookings) {
    const bk = computeCancellationBreakdown(
      b.totalAmount,
      b.refundableDeposit ?? DEPOSIT_AMOUNT,
      policy.chargePercent
    );
    groupCharge += bk.cancellationCharge;
    groupRefund += bk.totalRefund;
    await prisma.booking.update({
      where: { id: b.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancellationCharge: bk.cancellationCharge },
    });
  }

  // The captured payment lives on the primary booking — refund the group total there.
  const paymentBooking = booking.bookingGroupId
    ? (await prisma.payment.findFirst({
        where: { booking: { bookingGroupId: booking.bookingGroupId } },
        select: { bookingId: true },
      }))?.bookingId ?? booking.id
    : booking.id;

  const breakdown = { cancellationCharge: groupCharge, totalRefund: groupRefund };
  const refund = await processBookingRefund(paymentBooking, breakdown.totalRefund, {
    reason: `Guest cancellation (${policy.tier})${booking.bookingGroupId ? ` · group of ${groupBookings.length}` : ""}`,
  });

  return NextResponse.json({
    success: true,
    bookingRef: booking.bookingRef,
    cancellationCharge: breakdown.cancellationCharge,
    totalRefund: breakdown.totalRefund,
    tier: policy.tier,
    refundStatus: refund.refundStatus,
    message:
      refund.refundStatus === "PROCESSED"
        ? `Booking cancelled. ₹${breakdown.totalRefund.toLocaleString("en-IN")} refunded to your original payment method — it may take 5–7 business days to reflect.`
        : refund.refundStatus === "NONE"
        ? "Booking cancelled."
        : `Booking cancelled. ₹${breakdown.totalRefund.toLocaleString("en-IN")} refund is being processed and will reflect within 5–7 business days.`,
  });
}
