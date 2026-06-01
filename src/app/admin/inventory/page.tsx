import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/superAdmin";
import { prisma } from "@/lib/db/prisma";
import InventoryClient, { type InvCategory, type InvOverride } from "@/components/admin/InventoryClient";
import { ALL_CATEGORY_TYPES, CATEGORY_META } from "@/lib/utils/room-categories";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const ctx = await requireSuperAdmin();
  if (!ctx) redirect("/auth/admin-login");

  const categories: InvCategory[] = ALL_CATEGORY_TYPES.map((t) => ({
    roomType: t,
    displayName: CATEGORY_META[t].displayName,
    group: CATEGORY_META[t].group,
    defaultUnits: CATEGORY_META[t].totalRooms,
  }));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overridesRaw = await prisma.roomInventory.findMany({
    where: { hotelId: ctx.hotelId, date: { gte: today } },
    orderBy: [{ date: "asc" }, { roomType: "asc" }],
  });

  const overrides: InvOverride[] = overridesRaw.map((o) => ({
    id: o.id,
    roomType: o.roomType,
    date: o.date.toISOString().slice(0, 10),
    units: o.units,
    note: o.note,
  }));

  return <InventoryClient categories={categories} overrides={overrides} />;
}
