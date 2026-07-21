/**
 * Pure booking calculations — no Prisma, safe to use in Client Components.
 * Server-only helpers (generateBookingRef etc.) live in booking.ts.
 */

// GST calculation — Indian hotel tax slabs (per-night room tariff)
//   ≤ ₹1,000        → 0% (exempt)
//   ₹1,001–₹7,500   → 5%  (2.5% CGST + 2.5% SGST)
//   > ₹7,500        → 18% (9% CGST + 9% SGST)
export function calculateGST(roomRentPerNight: number) {
  if (roomRentPerNight <= 1000) return { cgstRate: 0, sgstRate: 0 };
  if (roomRentPerNight <= 7500) return { cgstRate: 2.5, sgstRate: 2.5 };
  return { cgstRate: 9, sgstRate: 9 };
}

export const REFUNDABLE_DEPOSIT = 200; // Rs 200 default refundable deposit — collected at check-in (NOT in the booking total), editable by staff
export const PARTIAL_PAYMENT_AMOUNT = 500; // advance paid upfront for PAY_PARTIAL; subject to cancellation policy

/**
 * Room-charge totals for a booking. The refundable deposit is NO LONGER part of
 * `totalAmount` — it is collected separately at check-in and tracked on the
 * booking (refundableDeposit = expected, depositCollected = actual), then netted
 * against the balance at checkout. So `totalAmount = roomRent − coupon + GST`.
 */
export function computeTotals(params: {
  roomRentPerNight: number;
  noOfNights: number;
  couponDiscount?: number;
}) {
  const { roomRentPerNight, noOfNights, couponDiscount = 0 } = params;
  const roomRent = roomRentPerNight * noOfNights;
  const { cgstRate, sgstRate } = calculateGST(roomRentPerNight);
  const taxableAmount = roomRent - couponDiscount;
  const cgst = +(taxableAmount * (cgstRate / 100)).toFixed(2);
  const sgst = +(taxableAmount * (sgstRate / 100)).toFixed(2);
  const totalAmount = +(taxableAmount + cgst + sgst).toFixed(2);

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
