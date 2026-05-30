import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { applyCoupon } from "@/lib/utils/booking";

export async function POST(req: NextRequest) {
  const { code, hotelId, amount } = await req.json();

  const coupon = await prisma.coupon.findFirst({
    where: {
      code: code.toUpperCase(),
      isActive: true,
      OR: [{ hotelId }, { hotelId: null }],
      AND: [
        { OR: [{ expiryDate: null }, { expiryDate: { gte: new Date() } }] },
      ],
    },
  });

  if (!coupon) {
    return NextResponse.json({ valid: false, message: "Invalid or expired coupon" });
  }

  const hasUseLimit = coupon.maxUses !== null;
  if (hasUseLimit && coupon.usedCount >= coupon.maxUses!) {
    return NextResponse.json({ valid: false, message: "Coupon usage limit reached" });
  }

  const discount = applyCoupon(coupon, amount);

  return NextResponse.json({
    valid: true,
    couponId: coupon.id,
    discount,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    message: `Coupon applied! You save ₹${discount.toFixed(0)}`,
  });
}
