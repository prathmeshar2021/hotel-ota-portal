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
 * Create a Razorpay Payment Link for a phone booking. Unlike the browser checkout
 * (which uses an Order + the JS SDK), a phone guest pays via a hosted link we send
 * over WhatsApp.
 *
 * `reference_id` is the bookingRef (unique), so the `payment_link.paid` webhook can
 * map the payment back to the booking. `expire_by` is set to the inventory-hold
 * expiry, so the link dies exactly when the room is released — a guest can never
 * pay for an already-released room. We suppress Razorpay's own SMS/email since we
 * deliver the link ourselves via an approved WhatsApp template.
 *
 * Returns the Razorpay payment-link object — store its `id` and use `short_url`.
 */
export async function createPaymentLink(params: {
  amountInPaise: number;
  bookingRef: string;
  expireBy: Date;
  description?: string;
  customer?: { name?: string; contact?: string; email?: string };
}): Promise<{ id: string; short_url: string }> {
  const body = {
    amount: params.amountInPaise,
    currency: "INR",
    reference_id: params.bookingRef,
    description: params.description ?? `Booking ${params.bookingRef}`,
    // Razorpay wants a Unix timestamp (seconds) and requires >= 15 min in future.
    expire_by: Math.floor(params.expireBy.getTime() / 1000),
    reminder_enable: true,
    notify: { sms: false, email: false },
    notes: { bookingRef: params.bookingRef },
    ...(params.customer ? { customer: params.customer } : {}),
  };
  // The razorpay SDK's types for paymentLink.create expose an awkward
  // callback/promise overload (return inferred as `… & void`) and a strict
  // request-body union. Cast at this boundary and re-narrow the result.
  const link = (await razorpay.paymentLink.create(
    body as Parameters<typeof razorpay.paymentLink.create>[0]
  )) as unknown as { id: string; short_url: string };
  return { id: link.id, short_url: link.short_url };
}

/**
 * Read a payment link's current state. Used to confirm a deposit payment
 * on demand, so collecting a deposit never depends on the webhook arriving —
 * staff can press "Check payment" and settle it there and then.
 *
 * Returns the link status ("created" | "paid" | "expired" | …) and the id of
 * the captured payment, which is what a later refund is issued against.
 */
export async function fetchPaymentLink(linkId: string): Promise<{
  status: string;
  amountPaidPaise: number;
  paymentId: string | null;
}> {
  const link = (await razorpay.paymentLink.fetch(linkId)) as unknown as {
    status?: string;
    amount_paid?: number;
    payments?: { payment_id?: string; status?: string }[];
  };
  const captured = (link.payments ?? []).find(p => p.status === "captured") ?? link.payments?.[0];
  return {
    status: link.status ?? "unknown",
    amountPaidPaise: link.amount_paid ?? 0,
    paymentId: captured?.payment_id ?? null,
  };
}

/**
 * Issue a refund against a captured payment. Amount is in paise; omit for a
 * full refund.
 *
 * Speed:
 *  • "optimum" — instant where the guest's bank/instrument supports it, and
 *    Razorpay silently falls back to the normal cycle where it doesn't. This is
 *    what we want at the desk: the guest sees the deposit back immediately
 *    instead of waiting days. Instant refunds carry a Razorpay fee and need
 *    Instant Refunds enabled on the account.
 *  • "normal" — standard 5–7 working day cycle, no fee.
 *
 * The response's `speed_processed` tells you which actually happened, so the
 * caller can record what the guest should expect rather than assuming.
 */
export async function createRefund(
  paymentId: string,
  amountInPaise?: number,
  notes?: Record<string, string>,
  speed: "optimum" | "normal" = "optimum"
) {
  return razorpay.payments.refund(paymentId, {
    ...(amountInPaise != null ? { amount: amountInPaise } : {}),
    speed,
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
