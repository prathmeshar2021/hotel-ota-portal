import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { getCancellationPolicy, computeCancellationBreakdown, DEPOSIT_AMOUNT } from "@/lib/utils/cancellation";
import { consumeOtp } from "@/lib/utils/otp";
import { processBookingRefund } from "@/lib/services/refund";
import { z } from "zod";

const Schema = z.object({
  // Admin can optionally override the charge (e.g., waive it as goodwill)
  overrideCharge: z.number().min(0).optional(),
  otpId: z.string(),
  otpCode: z.string(),
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

  // Owner OTP approval required to cancel a booking
  const otp = await consumeOtp({
    hotelId: session.user.hotelId,
    otpId: parsed.data.otpId,
    code: parsed.data.otpCode,
    purpose: "DELETE_BOOKING",
    refId: booking.id,
  });
  if (!otp.ok) return NextResponse.json({ error: otp.error }, { status: 403 });

  const depositAmount = booking.refundableDeposit ?? DEPOSIT_AMOUNT;
  const policy = getCancellationPolicy(new Date(booking.checkInDate));
  const breakdown = computeCancellationBreakdown(
    booking.totalAmount,
    depositAmount,
    policy.chargePercent
  );

  // Admin can override the charge (e.g., waive it)
  const finalCharge = parsed.data.overrideCharge ?? breakdown.cancellationCharge;

  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancellationCharge: finalCharge,
    },
  });

  // Issue the refund (auto via Razorpay where possible; otherwise flagged for the desk).
  const totalRefund = booking.totalAmount - finalCharge;
  const refund = await processBookingRefund(booking.id, totalRefund, {
    reason: `Admin cancellation (${policy.tier})`,
  });

  return NextResponse.json({
    success: true,
    bookingRef: booking.bookingRef,
    cancellationCharge: finalCharge,
    totalRefund,
    tier: policy.tier,
    refundStatus: refund.refundStatus,
    refundMessage: refund.message,
  });
}
