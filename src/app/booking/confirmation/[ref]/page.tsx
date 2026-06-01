export const dynamic = "force-dynamic";

import Navbar from "@/components/customer/Navbar";
import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle,
  Calendar,
  MapPin,
  Phone,
  ArrowRight,
  Moon,
  Users,
  Banknote,
  BookOpen,
  BedDouble,
} from "lucide-react";
import { format } from "date-fns";
import { auth } from "@/lib/auth/auth";
import LoginNudge from "@/components/customer/LoginNudge";
import { getCategoryMeta } from "@/lib/utils/room-categories";

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const session = await auth();
  const isGuest = !session?.user;

  const booking = await prisma.booking.findUnique({
    where: { bookingRef: ref },
    include: {
      hotel: {
        select: { name: true, city: true, state: true, address: true, phone: true },
      },
      room: { select: { roomNumber: true, roomType: true } },
      primaryGuest: { select: { name: true, phone: true } },
    },
  });

  if (!booking) notFound();

  const categoryMeta = getCategoryMeta(booking.roomCategory as never);
  const accentColor = categoryMeta?.accentColor ?? "#F59E0B";
  const categoryLabel = categoryMeta?.displayName ?? booking.roomCategory;

  return (
    <div className="min-h-screen bg-[#071209]">
      <Navbar />

      <div className="max-w-lg mx-auto px-4 pt-28 pb-16">

        {/* Success indicator */}
        <div className="text-center mb-8">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5 shadow-2xl"
            style={{ background: `${accentColor}20`, boxShadow: `0 0 60px ${accentColor}25` }}
          >
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: `${accentColor}30` }}
            >
              <CheckCircle
                className="w-8 h-8"
                style={{ color: accentColor }}
              />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            {booking.onlinePaid === 0 && booking.balanceDue > 0
              ? "Room Reserved!"
              : "Booking Confirmed!"}
          </h1>
          <p className="text-white/40 text-sm">
            {booking.primaryGuest.phone ? (
              <>
                A confirmation has been sent to your WhatsApp
                <span className="text-white/60 font-medium ml-1">
                  +91 {booking.primaryGuest.phone}
                </span>
              </>
            ) : (
              "Your reservation is confirmed."
            )}
          </p>
        </div>

        {/* Booking reference card */}
        <div className="glass-card glass-shimmer rounded-3xl overflow-hidden mb-5">
          {/* Ref header */}
          <div
            className="px-6 py-5 flex items-center justify-between"
            style={{ background: `${accentColor}10`, borderBottom: `1px solid ${accentColor}20` }}
          >
            <div>
              <p className="text-xs text-white/35 uppercase tracking-widest mb-1">Booking Reference</p>
              <p className="text-2xl font-bold font-mono" style={{ color: accentColor }}>
                {booking.bookingRef}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-white/35 mb-1">Status</p>
              <span
                className="text-xs font-bold px-3 py-1.5 rounded-full border"
                style={{
                  background: `${accentColor}15`,
                  color: accentColor,
                  borderColor: `${accentColor}30`,
                }}
              >
                Confirmed
              </span>
            </div>
          </div>

          {/* Details */}
          <div className="p-6 space-y-4">
            {/* Hotel */}
            <div className="flex items-start gap-3">
              <MapPin className="w-4 h-4 mt-0.5 shrink-0" style={{ color: accentColor }} />
              <div>
                <p className="font-semibold text-white text-sm">{booking.hotel.name}</p>
                <p className="text-white/40 text-xs mt-0.5">
                  {booking.hotel.address}, {booking.hotel.city}, {booking.hotel.state}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Phone className="w-4 h-4 shrink-0" style={{ color: accentColor }} />
              <a
                href={`tel:${booking.hotel.phone}`}
                className="text-white/50 text-sm hover:text-white/80 transition-colors"
              >
                {booking.hotel.phone}
              </a>
            </div>

            <div className="flex items-center gap-3">
              <Calendar className="w-4 h-4 shrink-0" style={{ color: accentColor }} />
              <p className="text-white/55 text-sm">
                {format(booking.checkInDate, "dd MMM yyyy")} →{" "}
                {format(booking.checkOutDate, "dd MMM yyyy")}
                <span className="text-white/30 ml-2">
                  ({booking.noOfNights} night{booking.noOfNights > 1 ? "s" : ""})
                </span>
              </p>
            </div>

            {/* Summary grid */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/8">
              <div className="glass-card rounded-xl p-3">
                <p className="text-xs text-white/35 flex items-center gap-1 mb-1">
                  <BookOpen className="w-3 h-3" /> Category
                </p>
                <p className="text-sm font-semibold text-white/80">
                  {categoryLabel}
                </p>
              </div>

              <div className="glass-card rounded-xl p-3">
                <p className="text-xs text-white/35 flex items-center gap-1 mb-1">
                  <BedDouble className="w-3 h-3" /> Room
                </p>
                {booking.room ? (
                  <p className="text-sm font-semibold text-white/80">
                    #{booking.room.roomNumber}
                  </p>
                ) : (
                  <p className="text-xs text-white/40 italic">Assigned at hotel</p>
                )}
              </div>

              <div className="glass-card rounded-xl p-3">
                <p className="text-xs text-white/35 flex items-center gap-1 mb-1">
                  <Moon className="w-3 h-3" /> Duration
                </p>
                <p className="text-sm font-semibold text-white/80">
                  {booking.noOfNights} night{booking.noOfNights > 1 ? "s" : ""}
                </p>
              </div>

              <div className="glass-card rounded-xl p-3">
                <p className="text-xs text-white/35 flex items-center gap-1 mb-1">
                  <Users className="w-3 h-3" /> Guests
                </p>
                <p className="text-sm font-semibold text-white/80">{booking.noOfPersons}</p>
              </div>

              {booking.onlinePaid === 0 && booking.balanceDue > 0 ? (
                <div className="col-span-2 bg-amber-500/8 border border-amber-500/20 rounded-xl p-3">
                  <p className="text-xs text-amber-400/70 flex items-center gap-1 mb-1">
                    <Banknote className="w-3 h-3" /> Due at Check-in
                  </p>
                  <p className="text-sm font-bold text-amber-400">
                    ₹{booking.balanceDue.toLocaleString("en-IN")}
                  </p>
                </div>
              ) : (
                <div className="col-span-2 bg-white/3 rounded-xl p-3">
                  <p className="text-xs text-white/30 flex items-center gap-1 mb-1">
                    <Banknote className="w-3 h-3" /> Amount Paid
                  </p>
                  <p className="text-sm font-bold" style={{ color: accentColor }}>
                    ₹{booking.totalAmount.toLocaleString("en-IN")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Pay-at-hotel notice */}
        {booking.onlinePaid === 0 && booking.balanceDue > 0 && (
          <div className="rounded-2xl p-4 mb-5 border border-amber-500/20 bg-amber-500/6 flex items-start gap-3">
            <Banknote className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-300 text-sm mb-1">
                Pay ₹{booking.balanceDue.toLocaleString("en-IN")} at check-in
              </p>
              <p className="text-xs text-amber-400/60 leading-relaxed">
                Please carry cash or a UPI-enabled phone. Our front desk accepts
                cash and UPI. Your room is held — no payment needed right now.
              </p>
            </div>
          </div>
        )}

        {/* Optional login nudge — only for guests who aren't logged in */}
        {isGuest && (
          <LoginNudge bookingRef={booking.bookingRef} accentColor={accentColor} />
        )}

        {/* Online check-in CTA */}
        <div
          className="rounded-2xl p-5 mb-5 border"
          style={{
            background: `${accentColor}08`,
            borderColor: `${accentColor}20`,
          }}
        >
          <p className="font-semibold text-white text-sm mb-1">
            Save time at the hotel!
          </p>
          <p className="text-xs text-white/40 mb-4 leading-relaxed">
            Complete online check-in now. Upload your ID so we can process your
            arrival in under 2 minutes.
          </p>
          <Link
            href={`/checkin/${booking.bookingRef}`}
            className="flex items-center justify-center gap-2 w-full font-bold py-3 rounded-xl text-sm text-black transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: accentColor }}
          >
            Complete Online Check-in <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Footer links */}
        <div className="flex gap-3">
          <Link
            href="/my-bookings"
            className="flex-1 text-center text-sm font-semibold text-white/50 hover:text-white bg-white/5 hover:bg-white/8 border border-white/8 py-3 rounded-xl transition-all"
          >
            My Bookings
          </Link>
          <Link
            href="/"
            className="flex-1 text-center text-sm font-semibold text-white/50 hover:text-white bg-white/5 hover:bg-white/8 border border-white/8 py-3 rounded-xl transition-all"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
