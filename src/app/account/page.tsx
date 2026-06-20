import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import Navbar from "@/components/customer/Navbar";
import AccountClient from "./AccountClient";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "CUSTOMER") redirect("/auth/login");

  const guest = await prisma.guest.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, phone: true },
  });
  if (!guest) redirect("/auth/login");

  return (
    <div className="min-h-screen bg-[#071209]">
      <Navbar />
      <div className="max-w-lg mx-auto px-4 pb-20 pt-28">
        <h1 className="text-2xl font-bold text-white mb-1">My Account</h1>
        <p className="text-white/40 text-sm mb-8">Manage your contact details</p>
        <AccountClient guest={guest} />
      </div>
    </div>
  );
}
