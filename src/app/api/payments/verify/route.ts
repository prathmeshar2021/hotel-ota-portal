import { NextRequest, NextResponse } from "next/server";
import { verifyPaymentSignature } from "@/lib/services/razorpay";
import { confirmPaidBooking } from "@/lib/services/booking-confirm";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, bookingId } = body;

  const isValid = verifyPaymentSignature({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature,
  });

  if (!isValid) {
    return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
  }

  const result = await confirmPaidBooking({
    bookingId,
    razorpayPaymentId: razorpay_payment_id,
  });

  if (!result) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, bookingRef: result.bookingRef });
}
