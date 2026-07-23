export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/superAdmin";
import { prisma } from "@/lib/db/prisma";
import StaffManagerClient from "@/components/admin/StaffManagerClient";

export default async function StaffPage() {
  const ctx = await requireSuperAdmin();
  if (!ctx) redirect("/auth/admin-login");

  const staff = await prisma.hotelStaff.findMany({
    where: { hotelId: ctx.hotelId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      idPhotoUrl: true,
      createdAt: true,
    },
  });

  const initialStaff = staff.map((s) => ({
    ...s,
    createdAt: s.createdAt.toISOString(),
  }));

  return (
    <div className="p-5 lg:p-8 max-w-4xl mx-auto">
      <StaffManagerClient initialStaff={initialStaff} />
    </div>
  );
}
