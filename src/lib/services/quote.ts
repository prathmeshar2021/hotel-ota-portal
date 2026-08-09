import { prisma } from "@/lib/db/prisma";
import {
  computeTotals,
  getUniversalDiscount,
  resolveBookingDiscount,
} from "@/lib/utils/booking";
import { REFUNDABLE_DEPOSIT } from "@/lib/utils/booking-calc";
import { resolveCategoryPrice } from "@/lib/utils/pricing";

/**
 * Authoritative booking price/tax/discount quote.
 *
 * This is the single source of truth for what a stay costs. Both the website
 * checkout (`POST /api/bookings`) and the AI phone-assistant quote endpoint call
 * this, so a price quoted verbally on a call can never diverge from the price the
 * booking is actually created at. Keep ALL pricing logic here — never recompute
 * totals inline at a call site.
 *
 * Pure-math pieces (GST, discount stacking) live in `booking-calc.ts`; this layer
 * adds the DB reads (category price override, universal discount, guest coupon).
 */

export interface QuoteInput {
  hotelId: string;
  /** RoomCategoryType string, e.g. "LUXURY_COTTAGE". */
  roomCategory: string;
  checkIn: Date;
  checkOut: Date;
  /** Optional guest coupon code (case-insensitive). */
  couponCode?: string;
}

export interface QuoteResult {
  pricePerNight: number;
  noOfNights: number;
  couponDiscount: number;
  /** Coupon to link on the booking — the guest coupon if used, else the universal one. */
  couponId?: string;
  /** Expected refundable deposit — collected at check-in, NOT part of totalAmount. */
  refundableDeposit: number;
  /** GST totals, exactly as `computeTotals` returns them (same shape the booking API responds with). */
  totals: {
    roomRent: number;
    taxableAmount: number;
    cgst: number;
    sgst: number;
    cgstRate: number;
    sgstRate: number;
    totalAmount: number;
  };
  discountBreakdown: {
    universalDiscount: number;
    couponDiscount: number;
    totalDiscount: number;
  };
}

/** Nights between two dates, using the same rule as the booking route. */
export function nightsBetween(checkIn: Date, checkOut: Date): number {
  return Math.ceil((checkOut.getTime() - checkIn.getTime()) / 86_400_000);
}

export async function quoteBooking(input: QuoteInput): Promise<QuoteResult> {
  const { hotelId, roomCategory, checkIn, checkOut, couponCode } = input;

  const noOfNights = nightsBetween(checkIn, checkOut);

  // Category price for the check-in date — honours any date-wise super-admin
  // override, else the base price.
  const pricePerNight = await resolveCategoryPrice(
    hotelId,
    roomCategory as never,
    checkIn
  );

  // Discounts: the always-on hotel-wide marketing discount + an optional guest
  // coupon (which either stacks on top of, or replaces, the universal one).
  const roomRentBeforeDiscount = pricePerNight * noOfNights;
  const universal = await getUniversalDiscount(hotelId);

  let guestCoupon: {
    id: string;
    discountType: string;
    discountValue: number;
    maxDiscount: number | null;
    minAmount: number;
    stacksOnUniversal: boolean;
  } | null = null;

  if (couponCode) {
    const coupon = await prisma.coupon.findFirst({
      where: {
        code: couponCode.toUpperCase(),
        isActive: true,
        isUniversal: false,
        AND: [
          { OR: [{ hotelId }, { hotelId: null }] },
          { OR: [{ expiryDate: null }, { expiryDate: { gte: new Date() } }] },
        ],
      },
    });
    if (coupon) {
      guestCoupon = {
        id: coupon.id,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        maxDiscount: coupon.maxDiscount,
        minAmount: coupon.minAmount,
        stacksOnUniversal: coupon.stacksOnUniversal,
      };
    }
  }

  const breakdown = resolveBookingDiscount({
    roomRent: roomRentBeforeDiscount,
    universal,
    coupon: guestCoupon,
  });
  const couponDiscount = breakdown.totalDiscount;
  // Link the guest coupon when used; otherwise link the universal discount so the
  // saving stays traceable on the booking record.
  const couponId: string | undefined =
    guestCoupon?.id ?? (breakdown.universalDiscount > 0 ? universal?.id : undefined);

  const totals = computeTotals({
    roomRentPerNight: pricePerNight,
    noOfNights,
    couponDiscount,
  });

  return {
    pricePerNight,
    noOfNights,
    couponDiscount,
    couponId,
    refundableDeposit: REFUNDABLE_DEPOSIT,
    totals,
    discountBreakdown: breakdown,
  };
}
