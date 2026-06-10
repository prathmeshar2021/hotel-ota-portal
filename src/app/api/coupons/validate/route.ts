import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getUniversalDiscount, resolveBookingDiscount } from "@/lib/utils/booking";
import { enforceRateLimit } from "@/lib/ratelimit";

export async function POST(req: NextRequest) {
  // Public — rate limit to prevent coupon-code brute forcing.
  const limited = await enforceRateLimit(req, { name: "coupon-validate", limit: 20, windowSec: 60 });
  if (limited) return limited;

  const { code, hotelId, amount } = await req.json();

  // The hotel-wide marketing discount is always on (independent of the code).
  const universal = await getUniversalDiscount(hotelId);
  const universalOnly = resolveBookingDiscount({ roomRent: amount, universal });

  const coupon = await prisma.coupon.findFirst({
    where: {
      code: code.toUpperCase(),
      isActive: true,
      isUniversal: false, // the universal discount can't be entered as a code
      OR: [{ hotelId }, { hotelId: null }],
      AND: [
        { OR: [{ expiryDate: null }, { expiryDate: { gte: new Date() } }] },
      ],
    },
  });

  if (!coupon) {
    return NextResponse.json({
      valid: false,
      message: "Invalid or expired coupon",
      universalDiscount: universalOnly.universalDiscount,
    });
  }

  const hasUseLimit = coupon.maxUses !== null;
  if (hasUseLimit && coupon.usedCount >= coupon.maxUses!) {
    return NextResponse.json({
      valid: false,
      message: "Coupon usage limit reached",
      universalDiscount: universalOnly.universalDiscount,
    });
  }

  const breakdown = resolveBookingDiscount({
    roomRent: amount,
    universal,
    coupon: {
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      maxDiscount: coupon.maxDiscount,
      minAmount: coupon.minAmount,
      stacksOnUniversal: coupon.stacksOnUniversal,
    },
  });

  if (breakdown.couponDiscount <= 0) {
    return NextResponse.json({
      valid: false,
      message: `Coupon needs a minimum booking of ₹${coupon.minAmount.toLocaleString("en-IN")}`,
      universalDiscount: universalOnly.universalDiscount,
    });
  }

  return NextResponse.json({
    valid: true,
    couponId: coupon.id,
    // `discount` = total knocked off the room rent (universal + coupon, per stacking rule)
    discount: breakdown.totalDiscount,
    universalDiscount: breakdown.universalDiscount,
    couponDiscount: breakdown.couponDiscount,
    stacksOnUniversal: coupon.stacksOnUniversal,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    message:
      breakdown.universalDiscount > 0
        ? `Coupon applied! You save ₹${breakdown.totalDiscount.toFixed(0)} in total`
        : `Coupon applied! You save ₹${breakdown.couponDiscount.toFixed(0)}`,
  });
}
