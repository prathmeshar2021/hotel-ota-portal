/**
 * Pure booking calculations — no Prisma, safe to use in Client Components.
 * Server-only helpers (generateBookingRef etc.) live in booking.ts.
 */

// GST calculation — Indian hotel tax slabs
export function calculateGST(roomRentPerNight: number) {
  // < ₹1000: no GST, ₹1000-7500: 12% (6% CGST + 6% SGST), > ₹7500: 18% (9% CGST + 9% SGST)
  if (roomRentPerNight < 1000) return { cgstRate: 0, sgstRate: 0 };
  if (roomRentPerNight <= 7500) return { cgstRate: 6, sgstRate: 6 };
  return { cgstRate: 9, sgstRate: 9 };
}

export const REFUNDABLE_DEPOSIT = 200; // Rs 200 fixed deposit — always collected, always refunded

export function computeTotals(params: {
  roomRentPerNight: number;
  noOfNights: number;
  couponDiscount?: number;
  refundableDeposit?: number;
}) {
  const { roomRentPerNight, noOfNights, couponDiscount = 0, refundableDeposit = REFUNDABLE_DEPOSIT } = params;
  const roomRent = roomRentPerNight * noOfNights;
  const { cgstRate, sgstRate } = calculateGST(roomRentPerNight);
  const taxableAmount = roomRent - couponDiscount;
  const cgst = +(taxableAmount * (cgstRate / 100)).toFixed(2);
  const sgst = +(taxableAmount * (sgstRate / 100)).toFixed(2);
  const totalAmount = +(taxableAmount + cgst + sgst + refundableDeposit).toFixed(2);

  return { roomRent, taxableAmount, cgst, sgst, totalAmount, cgstRate, sgstRate };
}

export function applyCoupon(
  coupon: { discountType: string; discountValue: number; maxDiscount?: number | null; minAmount: number },
  roomRent: number
): number {
  if (roomRent < coupon.minAmount) return 0;

  if (coupon.discountType === "FLAT") {
    return Math.min(coupon.discountValue, roomRent);
  }

  const discount = (roomRent * coupon.discountValue) / 100;
  return coupon.maxDiscount ? Math.min(discount, coupon.maxDiscount) : discount;
}

// ─── UNIVERSAL / MARKETING DISCOUNT ──────────────────────────────────────────
// A single hotel-wide auto-applied discount. Pure helpers so both server and
// client (BookingForm, cards) compute identical numbers.

export interface UniversalDiscount {
  id: string;
  code: string;
  label: string | null;
  discountType: string; // "FLAT" | "PERCENT"
  discountValue: number;
  maxDiscount: number | null;
}

/** Rupee value the universal discount knocks off `amount` (per-night or whole-rent). */
export function universalDiscountAmount(
  universal: Pick<UniversalDiscount, "discountType" | "discountValue" | "maxDiscount"> | null,
  amount: number
): number {
  if (!universal || amount <= 0) return 0;
  if (universal.discountType === "FLAT") {
    return Math.min(universal.discountValue, amount);
  }
  const d = (amount * universal.discountValue) / 100;
  return Math.round(universal.maxDiscount ? Math.min(d, universal.maxDiscount) : d);
}

/** Price after the universal discount is applied — never below 0. */
export function discountedNightlyPrice(
  universal: Pick<UniversalDiscount, "discountType" | "discountValue" | "maxDiscount"> | null,
  basePrice: number
): number {
  return Math.max(0, basePrice - universalDiscountAmount(universal, basePrice));
}

/**
 * Resolve the full discount for a booking, combining the always-on universal
 * marketing discount with an optional guest coupon.
 *
 *  • universalDiscount — always applied to the room rent (0 when none active).
 *  • stacksOnUniversal=true  → coupon is computed on the already-discounted rent,
 *                              total = universal + coupon  (the "₹200 + ₹200 = ₹400" case).
 *  • stacksOnUniversal=false → coupon applies to the base rent and the universal is
 *                              dropped for this booking → total = coupon only.
 *
 * Returns the combined rupee discount on the room rent plus its breakdown.
 */
export function resolveBookingDiscount(params: {
  roomRent: number;
  universal: Pick<UniversalDiscount, "discountType" | "discountValue" | "maxDiscount"> | null;
  coupon?: {
    discountType: string;
    discountValue: number;
    maxDiscount?: number | null;
    minAmount: number;
    stacksOnUniversal?: boolean;
  } | null;
}): { universalDiscount: number; couponDiscount: number; totalDiscount: number } {
  const { roomRent, universal, coupon } = params;
  const universalDiscount = universalDiscountAmount(universal, roomRent);

  if (!coupon) {
    return { universalDiscount, couponDiscount: 0, totalDiscount: universalDiscount };
  }

  const stacks = coupon.stacksOnUniversal !== false; // default true
  if (stacks) {
    const couponDiscount = applyCoupon(coupon, Math.max(0, roomRent - universalDiscount));
    return {
      universalDiscount,
      couponDiscount,
      totalDiscount: Math.min(roomRent, universalDiscount + couponDiscount),
    };
  }

  // Non-stacking: coupon replaces the universal discount, computed on base rent.
  const couponDiscount = applyCoupon(coupon, roomRent);
  return { universalDiscount: 0, couponDiscount, totalDiscount: couponDiscount };
}
