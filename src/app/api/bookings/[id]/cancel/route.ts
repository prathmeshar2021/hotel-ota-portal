import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { getCancellationPolicy, computeCancellationBreakdown, DEPOSIT_AMOUNT } from "@/lib/utils/cancellation";
import { processBookingRefund } from "@/lib/services/refund";
import { email } from "@/lib/services/email";
import { format } from "date-fns";

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
      hotel: { select: { name: true } },
      primaryGuest: { select: { email: true, name: true } },
    },
  });

  if (!booking) {
    return NextResponse.json(
      { error: "Booking not found or cannot be cancelled" },
      { status: 404 }
    );
  }

  const policy = getCancellationPolicy(new Date(booking.checkInDate));

  if (policy.hoursUntilCheckIn <= 0) {
    return NextResponse.json(
      { error: "This booking cannot be cancelled after the check-in date." },
      { status: 400 }
    );
  }

  // A multi-room cart booking shares one payment → cancel the whole group.
  const groupBookings = booking.bookingGroupId
    ? await prisma.booking.findMany({
        where: { bookingGroupId: booking.bookingGroupId, primaryGuestId: session.user.id, status: "CONFIRMED" },
        select: { id: true, totalAmount: true, refundableDeposit: true },
      })
    : [{ id: booking.id, totalAmount: booking.totalAmount, refundableDeposit: booking.refundableDeposit }];

  // Find the online payment record (if any) to detect partial-payment bookings.
  const paymentRecord = await prisma.payment.findFirst({
    where: booking.bookingGroupId
      ? { booking: { bookingGroupId: booking.bookingGroupId }, mode: "ONLINE" }
      : { bookingId: booking.id, mode: "ONLINE" },
    select: { bookingId: true, amount: true },
  });

  const paymentBookingId = paymentRecord?.bookingId ?? booking.id;
  const groupTotalAmount = groupBookings.reduce((s, b) => s + b.totalAmount, 0);

  // A partial-payment booking is one where the online payment amount is less
  // than the total booking amount (customer paid only the ₹500 advance).
  // For these, cancellation policy applies directly to the ₹500 paid — not
  // the full room-charge breakdown (since the rest was never collected).
  const isPartialPayment =
    paymentRecord !== null &&
    paymentRecord.amount < groupTotalAmount;

  let groupCharge = 0;
  let groupRefund = 0;

  if (isPartialPayment) {
    const paidAmount = paymentRecord!.amount;
    // Apply policy % directly to what was actually paid online.
    groupRefund = Math.floor(paidAmount * (1 - policy.chargePercent / 100));
    groupCharge = paidAmount - groupRefund;
    // Distribute the charge evenly across rooms for record-keeping.
    const chargePerRoom = Math.round(groupCharge / groupBookings.length);
    for (const b of groupBookings) {
      await prisma.booking.update({
        where: { id: b.id },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancellationCharge: chargePerRoom },
      });
    }
  } else {
    // Full-payment (or pay-at-hotel): deposit always refunded, policy applies to room charges.
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
  }

  const refund = await processBookingRefund(paymentBookingId, groupRefund, {
    reason: `Guest cancellation (${policy.tier})${booking.bookingGroupId ? ` · group of ${groupBookings.length}` : ""}${isPartialPayment ? " · partial payment" : ""}`,
  });

  if (booking.primaryGuest?.email) {
    await email.sendCancellationConfirmation(booking.primaryGuest.email, {
      guestName: booking.primaryGuest.name,
      bookingRef: booking.bookingRef,
      hotelName: booking.hotel?.name ?? "The Hotel",
      checkIn: format(new Date(booking.checkInDate), "dd MMM yyyy"),
      cancellationCharge: groupCharge,
      totalRefund: groupRefund,
      tier: policy.tier,
    }).catch((e) => console.error("[Email] Cancellation email failed:", e));
  }

  return NextResponse.json({
    success: true,
    bookingRef: booking.bookingRef,
    cancellationCharge: groupCharge,
    totalRefund: groupRefund,
    tier: policy.tier,
    refundStatus: refund.refundStatus,
    message:
      refund.refundStatus === "PROCESSED"
        ? `Booking cancelled. ₹${groupRefund.toLocaleString("en-IN")} refunded to your original payment method — it may take 5–7 business days to reflect.`
        : refund.refundStatus === "NONE"
        ? "Booking cancelled."
        : `Booking cancelled. ₹${groupRefund.toLocaleString("en-IN")} refund is being processed and will reflect within 5–7 business days.`,
  });
}
