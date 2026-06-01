import { redirect } from "next/navigation";
import SuperAdminNav from "@/components/admin/SuperAdminNav";
import { requireSuperAdmin } from "@/lib/auth/superAdmin";
import { prisma } from "@/lib/db/prisma";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireSuperAdmin();
  if (!ctx) redirect("/auth/admin-login");

  const pendingOtps = await prisma.adminOtp.count({
    where: { hotelId: ctx.hotelId, status: "PENDING" },
  });

  return (
    <div className="min-h-screen bg-[#0d0a04]">
      <SuperAdminNav
        adminName={ctx.name}
        hotelName={ctx.hotelName}
        pendingOtps={pendingOtps}
      />
      {/* Content: right of sidebar on desktop, below top bar on mobile */}
      <main className="lg:pl-56 pt-16 lg:pt-0 min-h-screen">{children}</main>
    </div>
  );
}
