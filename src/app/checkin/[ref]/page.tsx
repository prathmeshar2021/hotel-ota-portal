export const dynamic = "force-dynamic";

import { auth } from "@/lib/auth/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import Navbar from "@/components/customer/Navbar";
import OnlineCheckinForm from "@/components/customer/OnlineCheckinForm";
import { CheckCircle, Calendar, Moon, MapPin } from "lucide-react";
import { format } from "date-fns";

interface Props {
  params: Promise<{ ref: string }>;
}

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

export default async function OnlineCheckinPage({ params }: Props) {
  const { ref } = await params;
  const session = await auth();

  if (!session?.user) {
    redirect(`/auth/login?callbackUrl=/checkin/${ref}`);
  }

  const booking = await prisma.booking.findFirst({
    where: {
      bookingRef: ref,
      primaryGuestId: session.user.id,
      status: { in: ["CONFIRMED"] },
    },
    include: {
      hotel: {
        select: { name: true, city: true, checkInTime: true, checkOutTime: true },
      },
      room: { select: { roomNumber: true, roomType: true } },
      onlineCheckin: true,
      primaryGuest: {
        select: {
          name: true,
          phone: true,
          idType: true,
          idNumber: true,
          idFrontUrl: true,
          idBackUrl: true,
        },
      },
      companions: true,
    },
  });

  if (!booking) notFound();

  const alreadyDone = !!booking.onlineCheckin?.completedAt;
  const accentColor = ROOM_ACCENT[booking.room.roomType] ?? "#F59E0B";

  return (
    <div className="min-h-screen bg-[#071209]">
      <Navbar />

      <div className="max-w-2xl mx-auto px-4 pt-28 pb-16">

        {/* Page heading */}
        <div className="mb-6">
          <p className="text-white/35 text-xs uppercase tracking-widest mb-1">
            {booking.bookingRef}
          </p>
          <h1 className="text-2xl font-bold text-white mb-1">Online Check-in</h1>
          <p className="text-white/40 text-sm">
            Pre-fill your details to arrive and settle in instantly.
          </p>
        </div>

        {/* Booking summary card */}
        <div
          className="rounded-2xl p-4 mb-6 border"
          style={{ background: `${accentColor}08`, borderColor: `${accentColor}20` }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 text-sm">
            <div className="flex items-center gap-2.5 flex-1">
              <MapPin className="w-4 h-4 shrink-0" style={{ color: accentColor }} />
              <div>
                <p className="font-semibold text-white">{booking.hotel.name}</p>
                <p className="text-white/40 text-xs">{booking.hotel.city}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-white/50 text-xs">
              <Calendar className="w-3.5 h-3.5" style={{ color: accentColor }} />
              {format(booking.checkInDate, "dd MMM")} → {format(booking.checkOutDate, "dd MMM yyyy")}
            </div>
            <div className="flex items-center gap-2 text-white/50 text-xs">
              <Moon className="w-3.5 h-3.5" style={{ color: accentColor }} />
              {ROOM_TYPE_LABELS[booking.room.roomType]} #{booking.room.roomNumber}
            </div>
          </div>
        </div>

        {/* Content: already done OR form */}
        {alreadyDone ? (
          <div className="bg-white/3 border border-green-500/20 rounded-3xl p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="font-bold text-white text-lg mb-2">
              Online Check-in Completed!
            </h2>
            <p className="text-sm text-white/40 mb-6 leading-relaxed">
              Your details are on file. Just show your booking reference
              when you arrive at the resort.
            </p>
            <div
              className="inline-block rounded-2xl px-8 py-4 border"
              style={{ background: `${accentColor}10`, borderColor: `${accentColor}25` }}
            >
              <p className="text-xs text-white/35 mb-1">Show this at the resort</p>
              <p className="text-2xl font-bold font-mono" style={{ color: accentColor }}>
                {booking.bookingRef}
              </p>
            </div>
          </div>
        ) : (
          <OnlineCheckinForm
            bookingRef={booking.bookingRef}
            noOfPersons={booking.noOfPersons}
            checkInDate={booking.checkInDate.toISOString()}
            checkOutDate={booking.checkOutDate.toISOString()}
            existingData={{
              idType: booking.primaryGuest.idType,
              idNumber: booking.primaryGuest.idNumber,
              idFrontUrl: booking.primaryGuest.idFrontUrl,
              idBackUrl: booking.primaryGuest.idBackUrl,
              comingFrom: booking.onlineCheckin?.comingFrom,
              goingTo: booking.onlineCheckin?.goingTo,
              purpose: booking.onlineCheckin?.purpose,
              vehicleNo: booking.onlineCheckin?.vehicleNo,
              expectedCheckInTime: booking.onlineCheckin?.expectedCheckInTime,
              expectedCheckOutTime: booking.onlineCheckin?.expectedCheckOutTime,
              companions: booking.companions.map((c) => ({
                name: c.name,
                relation: c.relation ?? "",
                idType: (c.idType as string) ?? "AADHAR",
                idNumber: c.idNumber ?? "",
                idFrontUrl: c.idFrontUrl ?? "",
                idBackUrl: c.idBackUrl ?? "",
              })),
            }}
          />
        )}
      </div>
    </div>
  );
}
