import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/superAdmin";
import { prisma } from "@/lib/db/prisma";
import CouponsClient, { type CouponRow, type PromotionOption } from "@/components/admin/CouponsClient";

export const dynamic = "force-dynamic";

export default async function CouponsPage() {
  const ctx = await requireSuperAdmin();
  if (!ctx) redirect("/auth/admin-login");

  const [coupons, promotions] = await Promise.all([
    prisma.coupon.findMany({
      where: { hotelId: ctx.hotelId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { promotion: { select: { id: true, name: true } } },
    }),
    prisma.promotionScheme.findMany({
      where: { hotelId: ctx.hotelId, isActive: true },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true },
    }),
  ]);

  const rows: CouponRow[] = coupons.map((c) => ({
    id: c.id,
    code: c.code,
    kind: c.kind,
    discountType: c.discountType,
    discountValue: c.discountValue,
    minAmount: c.minAmount,
    maxDiscount: c.maxDiscount,
    maxUses: c.maxUses,
    usedCount: c.usedCount,
    label: c.label,
    isActive: c.isActive,
    expiryDate: c.expiryDate ? c.expiryDate.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
    promotionName: c.promotion?.name ?? null,
  }));

  const promoOptions: PromotionOption[] = promotions.map((p) => ({
    id: p.id,
    name: p.name,
  }));

  return <CouponsClient initialCoupons={rows} promotions={promoOptions} />;
}
