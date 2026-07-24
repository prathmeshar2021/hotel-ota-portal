import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import KioskAdminClient from "@/components/hotel-admin/KioskAdminClient";

/**
 * Kiosk device management is super-admin only. Hotel admins and staff are
 * redirected away even if they navigate here directly (the nav link is also
 * hidden for them, and the API routes enforce the same restriction).
 */
export default async function KioskPage() {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    redirect("/hotel-admin/dashboard");
  }
  return <KioskAdminClient />;
}
