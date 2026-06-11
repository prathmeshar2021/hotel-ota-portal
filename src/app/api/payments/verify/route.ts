import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { verifyPaymentSignature } from "@/lib/services/razorpay";
import { confirmPaidBooking } from "@/lib/services/booking-confirm";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

  const isValid = verifyPaymentSignature({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature,
  });

  if (!isValid) {
    return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
  }

  // SECURITY: derive the booking from the Razorpay order, NEVER from a
  // client-supplied bookingId. The signature only proves order+payment are a
  // valid Razorpay pair — it says nothing about which booking they belong to.
  // Trusting a client bookingId would let an attacker pay for a cheap booking
  // and use that signature to confirm a different, expensive one.
  const payment = await prisma.payment.findFirst({
    where: { razorpayOrderId: razorpay_order_id },
    select: { bookingId: true },
  });
  if (!payment) {
    return NextResponse.json({ error: "Payment record not found" }, { status: 404 });
  }

  const result = await confirmPaidBooking({
    bookingId: payment.bookingId,
    razorpayPaymentId: razorpay_payment_id,
  });

  if (!result) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, bookingRef: result.bookingRef });
}
