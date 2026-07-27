import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";
import { format } from "date-fns";
import { createPaymentLink, fetchPaymentLink } from "@/lib/services/razorpay";
import { gupshup } from "@/lib/services/gupshup";
import { REFUNDABLE_DEPOSIT, DEPOSIT_REF_PREFIX } from "@/lib/utils/booking-calc";

const Schema = z.object({
  amount: z.number().min(1).max(100_000).optional(),
});

/**
 * POST → create a Razorpay payment link for the refundable deposit and send it
 * to the primary guest on WhatsApp.
 *
 * Taking the deposit online (rather than as cash) is what lets checkout push it
 * straight back to the same card/UPI instantly, so the guest doesn't wait for a
 * counter refund. The captured payment id is stored against the booking when
 * the webhook confirms payment.
 */
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
  const parsed = Schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }
  const amount = Math.round(parsed.data.amount ?? REFUNDABLE_DEPOSIT);

  const booking = await prisma.booking.findFirst({
    where: { id, hotelId: session.user.hotelId },
    select: {
      id: true, bookingRef: true, checkInDate: true, checkOutDate: true,
      depositCollected: true, depositLinkUrl: true, guestPhone: true,
      hotel: { select: { name: true } },
      primaryGuest: { select: { name: true, phone: true } },
    },
  });
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if (booking.depositCollected > 0) {
    return NextResponse.json(
      { error: "A deposit has already been collected for this booking." },
      { status: 409 }
    );
  }

  const phone = booking.primaryGuest.phone ?? booking.guestPhone;
  if (!phone) {
    return NextResponse.json(
      { error: "This guest has no phone number on file — add one before sending the link." },
      { status: 400 }
    );
  }

  try {
    // Razorpay requires expiry at least 15 minutes out; give the guest the day.
    const link = await createPaymentLink({
      amountInPaise: amount * 100,
      bookingRef: `${DEPOSIT_REF_PREFIX}${booking.bookingRef}`,
      expireBy: new Date(Date.now() + 24 * 60 * 60 * 1000),
      description: `Refundable security deposit — ${booking.bookingRef}`,
      customer: { name: booking.primaryGuest.name, contact: `+91${phone}` },
    });

    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        depositLinkId: link.id,
        depositLinkUrl: link.short_url,
        refundableDeposit: amount,
      },
    });

    // Delivery must not fail the whole action — staff can resend or read the
    // link off the screen if WhatsApp is down.
    let delivered = true;
    try {
      await gupshup.sendPaymentLink(phone, {
        guestName: booking.primaryGuest.name,
        hotelName: booking.hotel.name,
        bookingRef: booking.bookingRef,
        amount,
        checkIn: format(booking.checkInDate, "dd MMM yyyy"),
        checkOut: format(booking.checkOutDate, "dd MMM yyyy"),
        paymentUrl: link.short_url,
      });
    } catch (e) {
      delivered = false;
      console.error("[deposit-link] WhatsApp send failed:", e);
    }

    return NextResponse.json({
      success: true,
      url: link.short_url,
      delivered,
      message: delivered
        ? `Deposit link for ₹${amount} sent on WhatsApp`
        : `Link created but WhatsApp send failed — share it manually`,
    });
  } catch (e) {
    console.error("[deposit-link]", e);
    return NextResponse.json(
      { error: "Could not create the deposit payment link. Try cash/UPI at the counter." },
      { status: 502 }
    );
  }
}

/**
 * GET → ask Razorpay whether the deposit link has been paid, and record it.
 *
 * The webhook is the usual path, but a deposit must never depend on it landing
 * while the guest is stood at the desk — staff can press "Check payment" and
 * settle it immediately. Idempotent: once the deposit is recorded, this just
 * reports it.
 */
export async function GET(
  _req: NextRequest,
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
  const booking = await prisma.booking.findFirst({
    where: { id, hotelId: session.user.hotelId },
    select: { id: true, depositLinkId: true, depositCollected: true, depositPaymentId: true },
  });
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  if (!booking.depositLinkId) {
    return NextResponse.json({ error: "No deposit link has been sent for this booking." }, { status: 404 });
  }
  if (booking.depositCollected > 0) {
    return NextResponse.json({ paid: true, amount: booking.depositCollected, message: "Deposit already recorded" });
  }

  try {
    const link = await fetchPaymentLink(booking.depositLinkId);
    const paidAmount = link.amountPaidPaise / 100;
    if (link.status !== "paid" || paidAmount <= 0) {
      return NextResponse.json({ paid: false, status: link.status, message: "Not paid yet" });
    }

    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        depositCollected: paidAmount,
        depositMode: "ONLINE",
        depositPaymentId: link.paymentId ?? undefined,
      },
    });
    return NextResponse.json({
      paid: true,
      amount: paidAmount,
      message: `Deposit of ₹${paidAmount} received`,
    });
  } catch (e) {
    console.error("[deposit-link status]", e);
    return NextResponse.json({ error: "Could not check the payment status" }, { status: 502 });
  }
}
