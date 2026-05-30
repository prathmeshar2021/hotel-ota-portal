import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, PlusCircle } from "lucide-react";
import NewBookingForm from "@/components/hotel-admin/NewBookingForm";

export const metadata = { title: "New Booking – Front Desk" };

export default async function NewBookingPage() {
  const session = await auth();
  if (!session?.user?.hotelId) redirect("/auth/staff-login");
  if (session.user.role !== "HOTEL_ADMIN" && session.user.role !== "HOTEL_STAFF") redirect("/");

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link
          href="/hotel-admin/bookings"
          className="text-white/35 hover:text-white/70 p-2 rounded-xl hover:bg-white/5 transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-blue-400" />
            <h1 className="text-xl font-bold text-white">New Booking</h1>
          </div>
          <p className="text-white/35 text-sm mt-0.5">Walk-in / phone booking — confirmed instantly</p>
        </div>
      </div>

      <NewBookingForm hotelId={session.user.hotelId} />
    </div>
  );
}
