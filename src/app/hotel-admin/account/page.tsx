export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { UserCog } from "lucide-react";
import ChangePasswordForm from "@/components/hotel-admin/ChangePasswordForm";

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/staff-login");

  return (
    <div className="p-5 lg:p-8 max-w-lg mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <UserCog className="w-6 h-6 text-blue-400" />
        <h1 className="text-2xl font-bold text-white">My Account</h1>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 mb-6">
        <p className="text-[11px] uppercase tracking-wider text-white/40 mb-1">User ID</p>
        <p className="text-sm font-mono text-white break-all">{session.user.email}</p>
        <p className="text-[11px] uppercase tracking-wider text-white/40 mt-3 mb-1">Name</p>
        <p className="text-sm text-white">{session.user.name}</p>
      </div>

      <ChangePasswordForm />
    </div>
  );
}
