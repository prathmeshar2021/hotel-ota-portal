import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import AdminNav from "@/components/hotel-admin/AdminNav";

export default async function HotelAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/auth/staff-login");
  if (
    session.user.role !== "HOTEL_ADMIN" &&
    session.user.role !== "HOTEL_STAFF" &&
    session.user.role !== "SUPER_ADMIN"
  ) {
    redirect("/");
  }

  const pendingOtps = session.user.hotelId
    ? await prisma.adminOtp.count({
        where: {
          hotelId: session.user.hotelId,
          status: { in: ["PENDING", "ISSUED"] },
        },
      })
    : 0;

  return (
    <div className="min-h-screen bg-[#071209]">
      <AdminNav
        staffName={session.user.name ?? "Staff"}
        staffRole={session.user.role ?? "HOTEL_STAFF"}
        hotelName={session.user.hotelName ?? "The Urban Escape"}
        pendingOtps={pendingOtps}
      />
      {/* Content: right of sidebar on desktop, below top bar on mobile */}
      <main className="lg:pl-56 pt-16 lg:pt-0 min-h-screen">
        {children}
      </main>
    </div>
  );
}
