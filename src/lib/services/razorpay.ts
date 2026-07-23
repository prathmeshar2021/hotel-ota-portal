import Razorpay from "razorpay";
import crypto from "crypto";

export const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function createOrder(amountInPaise: number, bookingRef: string) {
  return razorpay.orders.create({
    amount: amountInPaise,
    currency: "INR",
    receipt: bookingRef,
    // Auto-capture the payment as soon as it's authorized, so `payment.captured`
    // always fires and bookings never get stuck "authorized" but uncaptured —
    // independent of the account-level capture setting.
    payment_capture: true,
    notes: { bookingRef },
  });
}

/**
 * Issue a refund against a captured payment. Amount is in paise; omit for a
 * full refund. `speed: "normal"` settles via the standard refund cycle.
 * Returns the Razorpay refund object (its `id` should be stored).
 */
export async function createRefund(
  paymentId: string,
  amountInPaise?: number,
  notes?: Record<string, string>
) {
  return razorpay.payments.refund(paymentId, {
    ...(amountInPaise != null ? { amount: amountInPaise } : {}),
    speed: "normal",
    ...(notes ? { notes } : {}),
  });
}

export function verifyPaymentSignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const body = `${params.orderId}|${params.paymentId}`;
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(body)
    .digest("hex");
  return expected === params.signature;
}

/**
 * Verify a Razorpay webhook payload. The signature is an HMAC-SHA256 of the
 * **raw request body** keyed by the webhook secret (set in the Razorpay
 * dashboard — distinct from the API key secret).
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false; // length mismatch etc.
  }
}
