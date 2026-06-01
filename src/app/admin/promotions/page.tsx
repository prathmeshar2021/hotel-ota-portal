import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/superAdmin";
import { prisma } from "@/lib/db/prisma";
import PromotionsClient, { type PromotionRow } from "@/components/admin/PromotionsClient";

export const dynamic = "force-dynamic";

export default async function PromotionsPage() {
  const ctx = await requireSuperAdmin();
  if (!ctx) redirect("/auth/admin-login");

  const promotions = await prisma.promotionScheme.findMany({
    where: { hotelId: ctx.hotelId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { coupons: true } } },
  });

  const rows: PromotionRow[] = promotions.map((p) => ({
    id: p.id,
    name: p.name,
    keyword: p.keyword,
    description: p.description,
    discountType: p.discountType,
    discountValue: p.discountValue,
    minAmount: p.minAmount,
    maxDiscount: p.maxDiscount,
    validFrom: p.validFrom ? p.validFrom.toISOString() : null,
    validTo: p.validTo ? p.validTo.toISOString() : null,
    isActive: p.isActive,
    couponCount: p._count.coupons,
    createdAt: p.createdAt.toISOString(),
  }));

  return <PromotionsClient initialPromotions={rows} />;
}
