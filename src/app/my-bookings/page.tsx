export const dynamic = "force-dynamic";

import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import Navbar from "@/components/customer/Navbar";
import Link from "next/link";
import {
  Calendar,
  MapPin,
  CheckCircle,
  Clock,
  ArrowRight,
  Hotel,
  Moon,
} from "lucide-react";
import { format } from "date-fns";

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  PENDING_PAYMENT: {
    label: "Payment Pending",
    cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  },
  CONFIRMED: {
    label: "Confirmed",
    cls: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  },
  CHECKED_IN: {
    label: "Checked In",
    cls: "bg-green-500/15 text-green-400 border-green-500/25",
  },
  CHECKED_OUT: {
    label: "Checked Out",
    cls: "bg-white/8 text-white/40 border-white/10",
  },
  CANCELLED: {
    label: "Cancelled",
    cls: "bg-red-500/15 text-red-400 border-red-500/25",
  },
  NO_SHOW: {
    label: "No Show",
    cls: "bg-orange-500/15 text-orange-400 border-orange-500/25",
  },
};

const ROOM_TYPE_LABELS: Record<string, string> = {
  LUXURY_COTTAGE: "Luxury Cottage",
  AC_ROOM: "AC Room",
  NON_AC_ROOM: "Non-AC Room",
};

const ROOM_ACCENT: Record<string, string> = {
  LUXURY_COTTAGE: "#F59E0B",
  AC_ROOM: "#60A5FA",
  NON_AC_ROOM: "#4ADE80",
};

export default async function MyBookingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/login?callbackUrl=/my-bookings");

  const bookings = await prisma.booking.findMany({
    where: { primaryGuestId: session.user.id, source: "PORTAL" },
    include: {
      hotel: { select: { name: true, city: true, state: true, slug: true } },
      room: { select: { roomNumber: true, roomType: true } },
      onlineCheckin: { select: { completedAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="min-h-screen bg-[#071209]">
      <Navbar />

      {/* Page header strip */}
      <div className="mt-16 border-b border-white/5">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <p className="text-white/35 text-xs uppercase tracking-widest mb-1">Your Account</p>
          <h1 className="text-2xl font-bold text-white">My Bookings</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {bookings.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-16 h-16 rounded-full bg-white/5 border border-white/8 flex items-center justify-center mx-auto mb-5">
              <Hotel className="w-7 h-7 text-white/20" />
            </div>
            <p className="text-white/60 font-semibold mb-1">No bookings yet</p>
            <p className="text-sm text-white/30 mb-8">
              Start your escape — book your first stay at The Urban Escape.
            </p>
            <Link
              href="/hotel/the-urban-escape-bhilai"
              className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold px-6 py-3 rounded-xl transition-all hover:scale-105 active:scale-95 shadow-lg shadow-amber-500/20"
            >
              Browse Rooms <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {bookings.map((booking) => {
              const accentColor = ROOM_ACCENT[booking.room.roomType] ?? "#F59E0B";
              const status = STATUS_CONFIG[booking.status] ?? {
                label: booking.status.replace(/_/g, " "),
                cls: "bg-white/8 text-white/40 border-white/10",
              };

              return (
                <div
                  key={booking.id}
                  className="glass-card glass-card-hover glass-shimmer glass-top-highlight rounded-3xl p-5"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex-1">
                      {/* Header row */}
                      <div className="flex items-center gap-2.5 mb-3 flex-wrap">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: accentColor }}
                        />
                        <h2 className="font-semibold text-white">{booking.hotel.name}</h2>
                        <span
                          className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${status.cls}`}
                        >
                          {status.label}
                        </span>
                      </div>

                      {/* Location */}
                      <p className="text-xs text-white/30 flex items-center gap-1 mb-4">
                        <MapPin className="w-3 h-3" />
                        {booking.hotel.city}, {booking.hotel.state}
                      </p>

                      {/* Details grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm mb-4">
                        <div className="glass-card rounded-xl p-3">
                          <p className="text-xs text-white/35 mb-0.5">Booking Ref</p>
                          <p className="font-mono font-bold text-sm" style={{ color: accentColor }}>
                            {booking.bookingRef}
                          </p>
                        </div>
                        <div className="glass-card rounded-xl p-3">
                          <p className="text-xs text-white/35 mb-0.5">Room</p>
                          <p className="font-medium text-white/75 text-xs">
                            {ROOM_TYPE_LABELS[booking.room.roomType]} #{booking.room.roomNumber}
                          </p>
                        </div>
                        <div className="glass-card rounded-xl p-3">
                          <p className="text-xs text-white/35 mb-0.5">Amount</p>
                          <p className="font-bold text-white/80">
                            ₹{booking.totalAmount.toLocaleString("en-IN")}
                          </p>
                        </div>
                      </div>

                      {/* Dates */}
                      <div className="flex items-center gap-4 text-xs text-white/40">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          {format(booking.checkInDate, "dd MMM yyyy")} →{" "}
                          {format(booking.checkOutDate, "dd MMM yyyy")}
                        </span>
                        <span className="flex items-center gap-1">
                          <Moon className="w-3 h-3" />
                          {booking.noOfNights} night{booking.noOfNights > 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-row sm:flex-col gap-2 shrink-0 sm:min-w-[148px]">
                      {booking.status === "CONFIRMED" &&
                        (booking.onlineCheckin?.completedAt ? (
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-green-400 bg-green-500/10 border border-green-500/20 px-3 py-2.5 rounded-xl">
                            <CheckCircle className="w-4 h-4" />
                            Check-in Done
                          </div>
                        ) : (
                          <Link
                            href={`/checkin/${booking.bookingRef}`}
                            className="flex items-center justify-center gap-1.5 text-xs font-bold text-black px-3 py-2.5 rounded-xl transition-all hover:scale-105"
                            style={{ background: accentColor }}
                          >
                            Online Check-in <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                        ))}
                      {booking.status === "PENDING_PAYMENT" && (
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-3 py-2.5 rounded-xl">
                          <Clock className="w-4 h-4" />
                          Payment Pending
                        </div>
                      )}
                      <Link
                        href={`/hotel/${booking.hotel.slug}`}
                        className="flex items-center justify-center text-xs font-semibold text-white/50 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2.5 rounded-xl transition-all"
                      >
                        View Hotel
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
