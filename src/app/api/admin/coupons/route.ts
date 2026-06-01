import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/superAdmin";
import { prisma } from "@/lib/db/prisma";
import { generateCouponCode } from "@/lib/utils/coupon";
import type { DiscountType, CouponKind } from "@prisma/client";

// ─── GET: list coupons (newest first) ────────────────────────────────────────
export async function GET() {
  const ctx = await requireSuperAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const coupons = await prisma.coupon.findMany({
    where: { hotelId: ctx.hotelId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { promotion: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ coupons });
}

// ─── POST: create a coupon ───────────────────────────────────────────────────
// body: {
//   discountType: "FLAT" | "PERCENT",
//   discountValue: number,
//   validityDays?: number,       // default 3 (for INSTANT)
//   expiryDate?: string ISO,     // explicit override
//   minAmount?: number,
//   maxDiscount?: number,        // cap for PERCENT
//   maxUses?: number,
//   keyword?: string,            // used in the code
//   label?: string,
//   kind?: "INSTANT" | "SEASONAL",
//   promotionId?: string,        // link to a PromotionScheme
// }
export async function POST(req: NextRequest) {
  const ctx = await requireSuperAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const discountType = body.discountType as DiscountType;
  const discountValue = Number(body.discountValue);
  const kind = (body.kind as CouponKind) ?? "INSTANT";

  if (discountType !== "FLAT" && discountType !== "PERCENT")
    return NextResponse.json({ error: "Invalid discountType" }, { status: 400 });
  if (!Number.isFinite(discountValue) || discountValue <= 0)
    return NextResponse.json({ error: "Invalid discountValue" }, { status: 400 });
  if (discountType === "PERCENT" && discountValue > 100)
    return NextResponse.json({ error: "Percent discount cannot exceed 100" }, { status: 400 });

  // Resolve expiry
  let expiryDate: Date | null = null;
  if (body.expiryDate) {
    expiryDate = new Date(body.expiryDate);
  } else {
    const days = Number.isFinite(Number(body.validityDays)) ? Number(body.validityDays) : 3;
    expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + days);
    expiryDate.setHours(23, 59, 59, 999);
  }

  // Generate a unique code (retry on rare collision)
  let code = generateCouponCode(body.keyword);
  for (let attempt = 0; attempt < 5; attempt++) {
    const exists = await prisma.coupon.findUnique({ where: { code } });
    if (!exists) break;
    code = generateCouponCode(body.keyword);
  }

  const coupon = await prisma.coupon.create({
    data: {
      hotelId: ctx.hotelId,
      code,
      kind,
      discountType,
      discountValue,
      minAmount: Number.isFinite(Number(body.minAmount)) ? Number(body.minAmount) : 0,
      maxDiscount:
        body.maxDiscount != null && Number.isFinite(Number(body.maxDiscount))
          ? Number(body.maxDiscount)
          : null,
      maxUses:
        body.maxUses != null && Number.isFinite(Number(body.maxUses))
          ? Number(body.maxUses)
          : null,
      label: body.label || null,
      referrerName: body.referrerName || null,
      validFrom: body.validFrom ? new Date(body.validFrom) : new Date(),
      expiryDate,
      createdBy: ctx.name,
      promotionId: body.promotionId || null,
    },
    include: { promotion: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ coupon }, { status: 201 });
}
