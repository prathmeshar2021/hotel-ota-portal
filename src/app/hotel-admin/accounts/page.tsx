export const dynamic = "force-dynamic";

import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";
import AccountsClient from "@/components/hotel-admin/AccountsClient";

export default async function AccountsPage() {
  const session = await auth();
  if (!session?.user?.hotelId) redirect("/auth/staff-login");
  if (session.user.role !== "HOTEL_ADMIN" && session.user.role !== "HOTEL_STAFF") redirect("/");

  return (
    <div className="p-6 max-w-6xl">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center shrink-0">
          <Wallet className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Accounts</h1>
          <p className="text-white/35 text-xs">Cash register · Transactions · Statements</p>
        </div>
      </div>

      <AccountsClient />
    </div>
  );
}
