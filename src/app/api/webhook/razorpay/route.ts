import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { verifyWebhookSignature } from "@/lib/services/razorpay";
import { confirmPaidBooking } from "@/lib/services/booking-confirm";

/**
 * Razorpay webhook — the server-side safety net for payment confirmation.
 *
 * The browser `handler` callback can be lost (tab closed, network drop) after a
 * payment is captured, which would otherwise leave the booking stuck in
 * PENDING_PAYMENT despite the money being taken. Razorpay also POSTs the
 * `payment.captured` event here, and we confirm the booking from it.
 *
 * Setup: add this URL (`/api/webhook/razorpay`) in the Razorpay dashboard
 * webhooks section, subscribe to `payment.captured`, and set the signing secret
 * as `RAZORPAY_WEBHOOK_SECRET`.
 */
export async function POST(req: NextRequest) {
  // Signature is computed over the RAW body — read text, never req.json() first.
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  if (!verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: {
    event?: string;
    payload?: { payment?: { entity?: { id?: string; order_id?: string } } };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (event.event === "payment.captured") {
    const entity = event.payload?.payment?.entity;
    const orderId = entity?.order_id;
    const paymentId = entity?.id;

    if (orderId) {
      const record = await prisma.payment.findFirst({
        where: { razorpayOrderId: orderId },
        select: { bookingId: true },
      });
      if (record?.bookingId) {
        await confirmPaidBooking({ bookingId: record.bookingId, razorpayPaymentId: paymentId });
      }
    }
  }

  // Always 200 for handled-or-ignored events so Razorpay doesn't retry forever.
  return NextResponse.json({ received: true });
}
