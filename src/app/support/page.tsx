export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import Navbar from "@/components/customer/Navbar";
import SupportChat from "./SupportChat";

export default async function SupportPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "CUSTOMER") {
    redirect("/auth/login?callbackUrl=/support");
  }

  return (
    <div className="min-h-screen bg-[#071209]">
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 pt-20 pb-6 h-screen flex flex-col">
        <div className="py-5 shrink-0">
          <p className="text-white/35 text-xs uppercase tracking-widest mb-1">Help & Support</p>
          <h1 className="text-2xl font-bold text-white">Chat with Us</h1>
          <p className="text-white/40 text-sm mt-1">
            Our hotel team usually responds within a few hours.
          </p>
        </div>
        <SupportChat guestName={session.user.name ?? "Guest"} />
      </div>
    </div>
  );
}
