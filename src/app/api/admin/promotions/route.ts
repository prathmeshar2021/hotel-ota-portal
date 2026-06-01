import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/superAdmin";
import { prisma } from "@/lib/db/prisma";
import type { DiscountType } from "@prisma/client";

// ─── GET: list promotion schemes (newest first) with coupon counts ───────────
export async function GET() {
  const ctx = await requireSuperAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const promotions = await prisma.promotionScheme.findMany({
    where: { hotelId: ctx.hotelId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { coupons: true } } },
  });

  return NextResponse.json({ promotions });
}

// ─── POST: create a seasonal promotion scheme ────────────────────────────────
// body: {
//   name: string,
//   keyword?: string,
//   description?: string,
//   discountType: "FLAT" | "PERCENT",
//   discountValue: number,
//   minAmount?: number,
//   maxDiscount?: number,
//   validFrom?: string ISO,
//   validTo?: string ISO,
// }
export async function POST(req: NextRequest) {
  const ctx = await requireSuperAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body?.name?.trim())
    return NextResponse.json({ error: "Scheme name is required" }, { status: 400 });

  const discountType = body.discountType as DiscountType;
  const discountValue = Number(body.discountValue);
  if (discountType !== "FLAT" && discountType !== "PERCENT")
    return NextResponse.json({ error: "Invalid discountType" }, { status: 400 });
  if (!Number.isFinite(discountValue) || discountValue <= 0)
    return NextResponse.json({ error: "Invalid discountValue" }, { status: 400 });
  if (discountType === "PERCENT" && discountValue > 100)
    return NextResponse.json({ error: "Percent discount cannot exceed 100" }, { status: 400 });

  const promotion = await prisma.promotionScheme.create({
    data: {
      hotelId: ctx.hotelId,
      name: body.name.trim(),
      keyword: body.keyword?.trim() || null,
      description: body.description?.trim() || null,
      discountType,
      discountValue,
      minAmount: Number.isFinite(Number(body.minAmount)) ? Number(body.minAmount) : 0,
      maxDiscount:
        body.maxDiscount != null && Number.isFinite(Number(body.maxDiscount))
          ? Number(body.maxDiscount)
          : null,
      validFrom: body.validFrom ? new Date(body.validFrom) : null,
      validTo: body.validTo ? new Date(body.validTo) : null,
      createdBy: ctx.name,
    },
  });

  return NextResponse.json({ promotion }, { status: 201 });
}
