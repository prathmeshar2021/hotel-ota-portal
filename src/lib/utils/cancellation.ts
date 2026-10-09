/**
 * Cancellation policy for The Urban Escape:
 *  > 72 hours before check-in  → Free cancellation (full refund)
 *  24–72 hours before check-in → 50% of room charges deducted
 *  < 24 hours before check-in  → 100% of room charges deducted
 *
 * The Rs 200 refundable deposit is NEVER included in cancellation charges —
 * it is always returned regardless of when the guest cancels.
 */

export const DEPOSIT_AMOUNT = 200;

export type CancellationTier = "FREE" | "HALF" | "FULL";

export interface CancellationPolicy {
  tier: CancellationTier;
  chargePercent: number;        // 0 | 50 | 100
  hoursUntilCheckIn: number;
  label: string;
  description: string;
}

export interface CancellationBreakdown {
  roomCharges: number;          // totalAmount - depositAmount
  cancellationCharge: number;   // amount forfeited
  depositRefund: number;        // always DEPOSIT_AMOUNT (200)
  totalRefund: number;          // what the guest gets back
}

/** Returns the applicable policy tier given the check-in date/time. */
export function getCancellationPolicy(checkInDate: Date): CancellationPolicy {
  const now = new Date();
  const hoursUntilCheckIn = (checkInDate.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursUntilCheckIn > 72) {
    return {
      tier: "FREE",
      chargePercent: 0,
      hoursUntilCheckIn,
      label: "Free Cancellation",
      description: "Cancel now and get a full refund — no charges.",
    };
  } else if (hoursUntilCheckIn > 24) {
    return {
      tier: "HALF",
      chargePercent: 50,
      hoursUntilCheckIn,
      label: "50% Cancellation Fee",
      description: "50% of room charges will be deducted. Deposit is fully refunded.",
    };
  } else {
    return {
      tier: "FULL",
      chargePercent: 100,
      hoursUntilCheckIn,
      label: "100% Cancellation Fee",
      description: "Room charges are non-refundable at this point. Only the deposit (₹200) is refunded.",
    };
  }
}

/** Computes the exact rupee breakdown for a cancellation. */
export function computeCancellationBreakdown(
  totalAmount: number,
  depositAmount: number,
  chargePercent: number
): CancellationBreakdown {
  const roomCharges = totalAmount - depositAmount;
  const cancellationCharge = Math.round((roomCharges * chargePercent) / 100);
  const depositRefund = depositAmount;
  const totalRefund = totalAmount - cancellationCharge;

  return { roomCharges, cancellationCharge, depositRefund, totalRefund };
}

export interface CancellationQuote {
  /** What goes back to the guest. Never more than they have paid. */
  refund: number;
  /** What the hotel actually keeps — never more than was paid either. */
  charge: number;
  /** Nothing has been paid, so there is nothing to refund or keep. */
  unpaid: boolean;
}

/**
 * What a cancellation really comes to, given what the guest has paid.
 *
 * The policy above is written against the room price. A booking that was never
 * paid for — pay-at-hotel, cancelled before arrival — still ran through it and
 * came out "refund ₹200, keep ₹1,260" on money nobody had handed over. This
 * applies the same policy and then holds both figures to the money that
 * actually arrived.
 *
 * `onlineAdvance` is the part paid online when booking. When that is only an
 * advance, the policy percentage applies to the advance itself, since the rest
 * of the room price was never collected.
 */
export function quoteCancellation(p: {
  totalAmount: number;
  depositAmount: number;
  chargePercent: number;
  /** Paid towards the bill so far and not yet refunded. Deposits excluded. */
  paid: number;
  onlineAdvance: number;
  /** Staff override of the charge (0 = waived). */
  overrideCharge?: number;
}): CancellationQuote {
  const paid = Math.max(0, p.paid);
  let charge: number;
  let refund: number;

  if (p.onlineAdvance > 0 && p.onlineAdvance < p.totalAmount) {
    const policyRefund = Math.floor(p.onlineAdvance * (1 - p.chargePercent / 100));
    charge = p.overrideCharge !== undefined
      ? Math.min(p.overrideCharge, p.onlineAdvance)
      : p.onlineAdvance - policyRefund;
    refund = p.onlineAdvance - charge;
  } else {
    const policy = computeCancellationBreakdown(p.totalAmount, p.depositAmount, p.chargePercent);
    charge = p.overrideCharge ?? policy.cancellationCharge;
    refund = p.totalAmount - charge;
  }

  // Refunds are paid out in whole rupees.
  refund = Math.max(0, Math.min(Math.round(refund), Math.floor(paid)));
  charge = Math.max(0, Math.min(charge, +(paid - refund).toFixed(2)));
  return { refund, charge, unpaid: paid <= 0 };
}

/** Human-readable time remaining until check-in. */
export function formatHoursUntilCheckIn(hours: number): string {
  if (hours <= 0) return "already checked in";
  if (hours < 1) return "less than 1 hour";
  if (hours < 24) return `${Math.floor(hours)} hour${Math.floor(hours) !== 1 ? "s" : ""}`;
  const days = Math.floor(hours / 24);
  const rem = Math.floor(hours % 24);
  return rem > 0 ? `${days}d ${rem}h` : `${days} day${days !== 1 ? "s" : ""}`;
}
