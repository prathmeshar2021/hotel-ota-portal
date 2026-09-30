/**
 * Money a guest paid online when they booked — on the website, or through the
 * WhatsApp payment link sent for a phone booking — as opposed to anything taken
 * later at the desk.
 *
 * The ledger entry posted when the gateway confirms the payment (key "gw:…") is
 * the record. Bookings paid before those entries existed fall back to their
 * captured Razorpay payment, where the online total came from the gateway alone.
 */
export interface OnlineAtBooking {
  amount: number;
  /** The whole room was paid for online. */
  full: boolean;
  via: "website" | "payment link";
  paidAt: Date | null;
}

export function onlineAtBooking(b: {
  source: string;
  totalAmount: number;
  onlinePaid: number;
  payment: { status: string; razorpayPaymentId: string | null; paidAt: Date | null } | null;
  gatewayEntries: { amount: number; occurredAt: Date }[];
}): OnlineAtBooking | null {
  const fromLedger = b.gatewayEntries.reduce((s, e) => s + e.amount, 0);
  const legacy = b.payment?.status === "captured" && b.payment.razorpayPaymentId ? b.onlinePaid : 0;
  const amount = +(fromLedger || legacy).toFixed(2);
  if (amount <= 0) return null;
  return {
    amount,
    full: amount >= b.totalAmount - 0.5,
    via: b.source === "PHONE" ? "payment link" : "website",
    paidAt: b.gatewayEntries[0]?.occurredAt ?? b.payment?.paidAt ?? null,
  };
}

/** The ledger rows `onlineAtBooking` reads — select these alongside the booking. */
export const GATEWAY_ENTRIES = {
  where: { kind: "ROOM_PAYMENT" as const, direction: "CREDIT" as const, idemKey: { startsWith: "gw:" } },
  select: { amount: true, occurredAt: true },
  orderBy: { occurredAt: "asc" as const },
};
