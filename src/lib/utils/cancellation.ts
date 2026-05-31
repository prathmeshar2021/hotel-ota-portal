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

/** Human-readable time remaining until check-in. */
export function formatHoursUntilCheckIn(hours: number): string {
  if (hours <= 0) return "already checked in";
  if (hours < 1) return "less than 1 hour";
  if (hours < 24) return `${Math.floor(hours)} hour${Math.floor(hours) !== 1 ? "s" : ""}`;
  const days = Math.floor(hours / 24);
  const rem = Math.floor(hours % 24);
  return rem > 0 ? `${days}d ${rem}h` : `${days} day${days !== 1 ? "s" : ""}`;
}
