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
