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

/** GST slabs keyed by the per-night *taxable* tariff — the inverse of calculateGST(). */
const GST_SLABS = [
  { rate: 0,  min: 0,       max: 1000 },
  { rate: 5,  min: 1000.01, max: 7500 },
  { rate: 18, min: 7500.01, max: Infinity },
];

/**
 * Split a **GST-inclusive** gross amount back into taxable base + tax.
 *
 * The slab depends on the per-night *taxable* tariff (not the gross), so we
 * solve per night: for each slab divide out its rate and clamp the result into
 * that slab's range. Two gross bands are unreachable under the slab rules
 * (₹1,000–₹1,050 and ₹7,875–₹8,850 per night), so we take the highest legal
 * price that does **not exceed** the target — rounding a discount in the
 * guest's favour rather than ever charging more than was quoted — and set
 * `adjusted` when that lands below the asked-for price.
 */
function splitInclusive(grossTotal: number, noOfNights: number) {
  const nights = Math.max(1, noOfNights);
  const target = Math.max(0, grossTotal);
  const perNightGross = target / nights;

  let bestTaxable = 0;
  let bestRate = 0;
  let bestGross = 0;

  for (const slab of GST_SLABS) {
    const raw = perNightGross / (1 + slab.rate / 100);
    const taxable = Math.min(Math.max(raw, slab.min), slab.max);
    const achieved = taxable * (1 + slab.rate / 100);
    // Never overshoot the quoted price; among the legal options take the best.
    if (achieved <= perNightGross + 1e-6 && achieved >= bestGross) {
      bestGross = achieved;
      bestTaxable = taxable;
      bestRate = slab.rate;
    }
  }

  const taxableAmount = +(bestTaxable * nights).toFixed(2);
  const halfRate = bestRate / 2;
  const cgst = +(taxableAmount * (halfRate / 100)).toFixed(2);
  const sgst = +(taxableAmount * (halfRate / 100)).toFixed(2);
  const totalAmount = +(taxableAmount + cgst + sgst).toFixed(2);

  return {
    taxableAmount, cgst, sgst,
    cgstRate: halfRate, sgstRate: halfRate,
    totalAmount,
    perNightTaxable: +bestTaxable.toFixed(2),
    // Only a real slab-gap shortfall counts — not sub-rupee rounding drift.
    adjusted: +target.toFixed(2) - totalAmount > 0.05,
  };
}

/**
 * Totals for a counter booking where staff give a discount out of their own
 * discretion — separate from, and applied *after*, any coupon.
 *
 * The discount comes off the **final GST-inclusive price** (what the guest is
 * quoted), so the taxable value and tax are re-derived from the discounted
 * gross. That also means the GST slab can legitimately change: knocking a
 * ₹1,100 room down to ₹1,000 moves it into the 0% band, which is the correct
 * treatment since GST follows the actual transaction value.
 *
 * `staffDiscount` is clamped to [0, standard total] so a booking can never go
 * negative, and the clamped value is returned as `appliedDiscount`.
 */
export function computeTotalsWithStaffDiscount(params: {
  roomRentPerNight: number;
  noOfNights: number;
  couponDiscount?: number;
  staffDiscount?: number;
}) {
  const { roomRentPerNight, noOfNights, couponDiscount = 0 } = params;

  // 1. Standard price: room rent − coupon, + GST on that.
  const standard = computeTotals({ roomRentPerNight, noOfNights, couponDiscount });

  // 2. Staff discount off the gross, never below zero or above the total.
  const requested = Number.isFinite(params.staffDiscount) ? Math.max(0, params.staffDiscount!) : 0;
  const appliedDiscount = +Math.min(requested, standard.totalAmount).toFixed(2);

  if (appliedDiscount <= 0) {
    return {
      ...standard,
      roomRent: standard.roomRent,
      couponDiscount,
      staffDiscount: 0,
      appliedDiscount: 0,
      originalTotal: standard.totalAmount,
      adjusted: false,
      perNightTaxable: +(standard.taxableAmount / Math.max(1, noOfNights)).toFixed(2),
    };
  }

  // 3. Re-derive the tax split from the discounted gross.
  const net = splitInclusive(+(standard.totalAmount - appliedDiscount).toFixed(2), noOfNights);

  return {
    roomRent: standard.roomRent,      // list rent stays the headline figure
    couponDiscount,
    staffDiscount: appliedDiscount,
    appliedDiscount,
    originalTotal: standard.totalAmount,
    taxableAmount: net.taxableAmount,
    cgst: net.cgst,
    sgst: net.sgst,
    cgstRate: net.cgstRate,
    sgstRate: net.sgstRate,
    totalAmount: net.totalAmount,
    perNightTaxable: net.perNightTaxable,
    /** true when the discounted price wasn't legal under the slabs and we snapped it */
    adjusted: net.adjusted,
  };
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
