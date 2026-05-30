export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Image from "next/image";
import Navbar from "@/components/customer/Navbar";
import BookingForm from "@/components/customer/BookingForm";
import { prisma } from "@/lib/db/prisma";
import { computeTotals } from "@/lib/utils/booking";
import { Calendar, Users, Moon } from "lucide-react";

type RoomType = "LUXURY_COTTAGE" | "AC_ROOM" | "NON_AC_ROOM";

interface Props {
  params: Promise<{ hotelSlug: string; roomId: string }>;
  searchParams: Promise<{ checkIn?: string; checkOut?: string; guests?: string }>;
}

const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  LUXURY_COTTAGE: "Luxury Cottage",
  AC_ROOM: "AC Room",
  NON_AC_ROOM: "Non-AC Room",
};

const ROOM_THEME: Record<RoomType, { accent: string; led: string; bg: string }> = {
  LUXURY_COTTAGE: { accent: "#F59E0B", led: "via-amber-400/60", bg: "from-amber-950/40" },
  AC_ROOM: { accent: "#60A5FA", led: "via-blue-400/60", bg: "from-blue-950/40" },
  NON_AC_ROOM: { accent: "#4ADE80", led: "via-green-400/60", bg: "from-green-950/30" },
};

export default async function BookingPage({ params, searchParams }: Props) {
  const { hotelSlug, roomId } = await params;
  const sp = await searchParams;

  const hotel = await prisma.hotel.findUnique({
    where: { slug: hotelSlug, isActive: true },
    select: { id: true, name: true, city: true, state: true, checkInTime: true, checkOutTime: true },
  });
  if (!hotel) notFound();

  const room = await prisma.room.findUnique({
    where: { id: roomId, hotelId: hotel.id, isActive: true },
  });
  if (!room) notFound();

  const checkIn = sp.checkIn ?? "";
  const checkOut = sp.checkOut ?? "";
  const nights = checkIn && checkOut
    ? Math.max(1, Math.ceil((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000))
    : 1;

  const totals = computeTotals({ roomRentPerNight: room.basePrice, noOfNights: nights });
  const theme = ROOM_THEME[room.roomType as RoomType] ?? ROOM_THEME.LUXURY_COTTAGE;
  const roomImage = room.images?.[0] ?? null;

  return (
    <div className="min-h-screen bg-[#071209]">
      <Navbar />

      {/* Room hero strip */}
      <div className="relative h-52 md:h-64 overflow-hidden mt-16">
        {roomImage ? (
          <Image src={roomImage} alt={ROOM_TYPE_LABELS[room.roomType as RoomType]} fill className="object-cover opacity-40" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-r from-[#0D1B0E] to-[#071209]" />
        )}
        <div className={`absolute inset-0 bg-gradient-to-b ${theme.bg} via-transparent to-[#071209]`} />
        <div className="absolute inset-0 bg-gradient-to-t from-[#071209] via-transparent to-transparent" />
        {/* LED strip */}
        <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent ${theme.led} to-transparent`} />

        {/* Heading */}
        <div className="relative z-10 h-full flex flex-col justify-end px-5 pb-6 max-w-6xl mx-auto">
          <p className="text-white/40 text-xs uppercase tracking-widest mb-1">Completing Booking</p>
          <h1 className="text-2xl md:text-3xl font-bold text-white">
            {ROOM_TYPE_LABELS[room.roomType as RoomType]}
            <span className="text-white/30 font-normal text-xl ml-2">#{room.roomNumber}</span>
          </h1>
          <p className="text-white/40 text-sm mt-0.5">{hotel.name}</p>
        </div>
      </div>

      {/* Main grid */}
      <div className="max-w-6xl mx-auto px-4 pb-16 -mt-2">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Booking Form */}
          <div className="lg:col-span-3">
            <BookingForm
              hotel={hotel}
              room={{ ...room, roomTypeLabel: ROOM_TYPE_LABELS[room.roomType as RoomType] }}
              checkIn={checkIn}
              checkOut={checkOut}
              nights={nights}
              guests={parseInt(sp.guests ?? "2")}
              totals={totals}
              accentColor={theme.accent}
            />
          </div>

          {/* Booking Summary sidebar */}
          <div className="lg:col-span-2">
            <div className="sticky top-24 rounded-3xl overflow-hidden border border-white/8 bg-white/3 backdrop-blur-sm shadow-2xl">
              {/* Room image */}
              <div className="relative h-44 overflow-hidden">
                {roomImage ? (
                  <Image src={roomImage} alt={room.roomNumber} fill className="object-cover" />
                ) : (
                  <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, #1a0a02, #6b3410)` }} />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                <div className={`absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent ${theme.led} to-transparent`} />
                <div className="absolute bottom-4 left-4">
                  <p className="text-white/40 text-xs uppercase tracking-wider">Room</p>
                  <p className="text-white font-bold">{ROOM_TYPE_LABELS[room.roomType as RoomType]} #{room.roomNumber}</p>
                </div>
              </div>

              {/* Details */}
              <div className="p-5 space-y-4">
                <div>
                  <p className="text-white/35 text-xs uppercase tracking-wider mb-1">{hotel.name}</p>
                  <p className="text-white/50 text-xs">{hotel.city}, {hotel.state}</p>
                </div>

                <div className="grid grid-cols-1 gap-3 text-sm">
                  {checkIn && checkOut && (
                    <div className="flex items-center gap-3 bg-white/4 rounded-xl p-3">
                      <Calendar className="w-4 h-4 shrink-0" style={{ color: theme.accent }} />
                      <div>
                        <p className="text-white/35 text-xs">Dates</p>
                        <p className="text-white/80 font-medium text-xs">{checkIn} → {checkOut}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3 bg-white/4 rounded-xl p-3">
                    <Moon className="w-4 h-4 shrink-0" style={{ color: theme.accent }} />
                    <div>
                      <p className="text-white/35 text-xs">Duration</p>
                      <p className="text-white/80 font-medium text-xs">{nights} night{nights > 1 ? "s" : ""}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 bg-white/4 rounded-xl p-3">
                    <Users className="w-4 h-4 shrink-0" style={{ color: theme.accent }} />
                    <div>
                      <p className="text-white/35 text-xs">Capacity</p>
                      <p className="text-white/80 font-medium text-xs">Up to {room.capacity} guests</p>
                    </div>
                  </div>
                </div>

                {/* Price breakdown */}
                <div className="border-t border-white/8 pt-4 space-y-2 text-sm">
                  <div className="flex justify-between text-white/50">
                    <span>Room ({nights}N × ₹{room.basePrice.toLocaleString("en-IN")})</span>
                    <span>₹{totals.roomRent.toLocaleString("en-IN")}</span>
                  </div>
                  {totals.cgst > 0 && (
                    <>
                      <div className="flex justify-between text-white/30 text-xs">
                        <span>CGST ({totals.cgstRate}%)</span>
                        <span>₹{totals.cgst.toLocaleString("en-IN")}</span>
                      </div>
                      <div className="flex justify-between text-white/30 text-xs">
                        <span>SGST ({totals.sgstRate}%)</span>
                        <span>₹{totals.sgst.toLocaleString("en-IN")}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between font-bold text-white text-base pt-2 border-t border-white/8">
                    <span>Total</span>
                    <span style={{ color: theme.accent }}>₹{totals.totalAmount.toLocaleString("en-IN")}</span>
                  </div>
                </div>

                {/* Trust indicators */}
                <div className="bg-white/3 border border-white/8 rounded-xl p-3 text-xs text-white/35 space-y-1.5">
                  <p>✅ Instant WhatsApp confirmation</p>
                  <p>📱 Online check-in link after booking</p>
                  <p>🔒 Secured by Razorpay</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
