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
    },
  });

  if (!booking) {
    return NextResponse.json(
      { error: "Booking not found or cannot be cancelled" },
      { status: 404 }
    );
  }

  const depositAmount = booking.refundableDeposit ?? DEPOSIT_AMOUNT;
  const policy = getCancellationPolicy(new Date(booking.checkInDate));
  const breakdown = computeCancellationBreakdown(
    booking.totalAmount,
    depositAmount,
    policy.chargePercent
  );

  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancellationCharge: breakdown.cancellationCharge,
    },
  });

  // Issue the refund (auto via Razorpay where possible; otherwise flagged for the desk).
  const refund = await processBookingRefund(booking.id, breakdown.totalRefund, {
    reason: `Guest cancellation (${policy.tier})`,
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
