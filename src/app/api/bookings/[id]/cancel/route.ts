import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { getCancellationPolicy, computeCancellationBreakdown, DEPOSIT_AMOUNT } from "@/lib/utils/cancellation";

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

  return NextResponse.json({
    success: true,
    bookingRef: booking.bookingRef,
    cancellationCharge: breakdown.cancellationCharge,
    totalRefund: breakdown.totalRefund,
    tier: policy.tier,
    message:
      policy.tier === "FREE"
        ? "Booking cancelled. Full refund will be processed within 5–7 business days."
        : policy.tier === "HALF"
        ? `Booking cancelled. ₹${breakdown.totalRefund.toLocaleString("en-IN")} will be refunded within 5–7 business days.`
        : `Booking cancelled. Deposit of ₹${breakdown.depositRefund.toLocaleString("en-IN")} will be refunded within 5–7 business days.`,
  });
}
