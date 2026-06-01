import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/superAdmin";
import { prisma } from "@/lib/db/prisma";
import PricingClient, { type CategoryPricing, type RateOverride } from "@/components/admin/PricingClient";
import { ALL_CATEGORY_TYPES, CATEGORY_META } from "@/lib/utils/room-categories";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const ctx = await requireSuperAdmin();
  if (!ctx) redirect("/auth/admin-login");

  const rooms = await prisma.room.findMany({
    where: { hotelId: ctx.hotelId, isActive: true },
    select: { id: true, roomType: true, basePrice: true },
  });

  const baseByType: Record<string, number> = {};
  const roomIdsByType: Record<string, string[]> = {};
  for (const r of rooms) {
    if (!(r.roomType in baseByType)) baseByType[r.roomType] = r.basePrice;
    (roomIdsByType[r.roomType] ??= []).push(r.id);
  }

  const categories: CategoryPricing[] = ALL_CATEGORY_TYPES.filter(
    (t) => (roomIdsByType[t]?.length ?? 0) > 0
  ).map((t) => ({
    roomType: t,
    displayName: CATEGORY_META[t].displayName,
    group: CATEGORY_META[t].group,
    roomCount: roomIdsByType[t]?.length ?? 0,
    basePrice: baseByType[t] ?? 0,
  }));

  // upcoming/current overrides, collapsed to category level
  const overridesRaw = await prisma.roomRate.findMany({
    where: { roomId: { in: rooms.map((r) => r.id) }, toDate: { gte: new Date() } },
    orderBy: { fromDate: "asc" },
  });
  const roomToType = new Map(rooms.map((r) => [r.id, r.roomType as string]));
  const seen = new Set<string>();
  const overrides: RateOverride[] = [];
  for (const o of overridesRaw) {
    const roomType = roomToType.get(o.roomId)!;
    const key = `${roomType}|${o.fromDate.toISOString()}|${o.toDate.toISOString()}|${o.price}`;
    if (seen.has(key)) continue;
    seen.add(key);
    overrides.push({
      roomType,
      fromDate: o.fromDate.toISOString(),
      toDate: o.toDate.toISOString(),
      price: o.price,
      label: o.label,
    });
  }

  return (
    <PricingClient categories={categories} overrides={overrides} />
  );
}
