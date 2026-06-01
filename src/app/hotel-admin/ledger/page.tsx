export const dynamic = "force-dynamic";

import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import { BookOpenText } from "lucide-react";
import LedgerClient from "@/components/hotel-admin/LedgerClient";

export default async function LedgerPage() {
  const session = await auth();
  if (!session?.user?.hotelId) redirect("/auth/staff-login");
  if (session.user.role !== "HOTEL_ADMIN" && session.user.role !== "HOTEL_STAFF" && session.user.role !== "SUPER_ADMIN") redirect("/");

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-2xl bg-purple-500/15 border border-purple-500/20 flex items-center justify-center shrink-0">
          <BookOpenText className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Ledger</h1>
          <p className="text-white/35 text-xs">Manual entries · Expenses · Credits</p>
        </div>
      </div>

      <LedgerClient />
    </div>
  );
}
