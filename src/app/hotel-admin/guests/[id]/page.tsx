export const dynamic = "force-dynamic";

import { auth } from "@/lib/auth/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import Link from "next/link";
import {
  ArrowLeft, User, Phone, Mail, CreditCard, Calendar, BedDouble,
  PlusCircle, ChevronRight, BookOpen, Users,
} from "lucide-react";
import { format } from "date-fns";
import EditGuestModal from "@/components/hotel-admin/EditGuestModal";
import IdPhotos from "@/components/hotel-admin/IdPhotos";
import { getCategoryMeta } from "@/lib/utils/room-categories";

export const metadata = { title: "Guest Profile – Front Desk" };

const STATUS_COLOR: Record<string, string> = {
  CONFIRMED:       "text-blue-300 bg-blue-500/15 border-blue-500/25",
  CHECKED_IN:      "text-green-300 bg-green-500/15 border-green-500/25",
  CHECKED_OUT:     "text-white/40 bg-white/5 border-white/10",
  CANCELLED:       "text-red-300 bg-red-500/15 border-red-500/25",
  NO_SHOW:         "text-amber-300 bg-amber-500/15 border-amber-500/25",
  PENDING_PAYMENT: "text-yellow-300 bg-yellow-500/15 border-yellow-500/25",
};

const ID_LABEL: Record<string, string> = {
  AADHAR:          "Aadhar Card",
  DRIVING_LICENSE: "Driving License",
  PASSPORT:        "Passport",
  VOTER_ID:        "Voter ID",
  OTHER:           "Other ID",
};

interface Params { id: string }

export default async function GuestDetailPage({ params }: { params: Promise<Params> }) {
  const session = await auth();
  if (!session?.user?.hotelId) redirect("/auth/staff-login");
  if (session.user.role !== "HOTEL_ADMIN" && session.user.role !== "HOTEL_STAFF" && session.user.role !== "SUPER_ADMIN") redirect("/");

  const { id } = await params;

  const guest = await prisma.guest.findUnique({
    where: { id },
    include: {
      // Bookings where this guest was the primary guest
      bookings: {
        include: { room: true },
        orderBy: { checkInDate: "desc" },
        take: 30,
      },
      // Bookings where this guest was a companion
      companionIn: {
        include: {
          booking: {
            include: {
              room: true,
              primaryGuest: { select: { name: true } },
            },
          },
        },
        orderBy: { id: "asc" },
      },
    },
  });

  if (!guest) notFound();

  // Merge: primary-guest bookings + companion-in bookings (deduplicate by id)
  type BookingRow = {
    id: string;
    bookingRef: string;
    status: string;
    checkInDate: Date;
    checkOutDate: Date;
    totalAmount: number;
    balanceDue: number;
    roomCategory: string;
    room: { roomNumber: string; roomType: string } | null;
    asCompanion: boolean;
    primaryGuestName?: string;
    relation?: string | null;
  };

  const primaryIds = new Set(guest.bookings.map(b => b.id));

  const companionRows: BookingRow[] = guest.companionIn
    .filter(c => !primaryIds.has(c.booking.id))
    .map(c => ({
      id:               c.booking.id,
      bookingRef:       c.booking.bookingRef,
      status:           c.booking.status,
      checkInDate:      c.booking.checkInDate,
      checkOutDate:     c.booking.checkOutDate,
      totalAmount:      c.booking.totalAmount,
      balanceDue:       c.booking.balanceDue,
      roomCategory:     c.booking.roomCategory,
      room:             c.booking.room,
      asCompanion:      true,
      primaryGuestName: c.booking.primaryGuest.name,
      relation:         c.relation,
    }));

  const primaryRows: BookingRow[] = guest.bookings.map(b => ({
    id:           b.id,
    bookingRef:   b.bookingRef,
    status:       b.status,
    checkInDate:  b.checkInDate,
    checkOutDate: b.checkOutDate,
    totalAmount:  b.totalAmount,
    balanceDue:   b.balanceDue,
    roomCategory: b.roomCategory,
    room:         b.room,
    asCompanion:  false,
  }));

  const allBookings = [...primaryRows, ...companionRows].sort(
    (a, b) => new Date(b.checkInDate).getTime() - new Date(a.checkInDate).getTime()
  );

  const totalSpend = guest.bookings
    .filter(b => b.status === "CHECKED_OUT")
    .reduce((sum, b) => sum + b.totalAmount, 0);

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      {/* Back */}
      <div className="flex items-center gap-3 mb-8">
        <Link
          href="/hotel-admin/guests"
          className="text-white/35 hover:text-white/70 p-2 rounded-xl hover:bg-white/5 transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <User className="w-5 h-5 text-blue-400" /> {guest.name}
          </h1>
          <p className="text-white/35 text-sm mt-0.5">Guest Profile</p>
        </div>
        <EditGuestModal
          guest={{
            id:          guest.id,
            name:        guest.name,
            phone:       guest.phone,
            email:       guest.email,
            idType:      guest.idType,
            idNumber:    guest.idNumber,
            idFrontUrl:  guest.idFrontUrl,
            idBackUrl:   guest.idBackUrl,
          }}
        />
        <Link
          href="/hotel-admin/bookings/new"
          className="flex items-center gap-2 bg-blue-500 hover:bg-blue-400 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-all"
        >
          <PlusCircle className="w-4 h-4" /> New Booking
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Left: Guest detail card ── */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
            {/* Avatar */}
            <div className="flex items-center gap-4 mb-5">
              <div className="w-14 h-14 rounded-full bg-blue-500/15 border border-blue-500/20 flex items-center justify-center text-xl font-bold text-blue-300">
                {guest.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-white">{guest.name}</p>
                <p className="text-white/35 text-xs mt-0.5">
                  Registered {format(new Date(guest.createdAt), "dd MMM yyyy")}
                </p>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              {/* Phone */}
              <div className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-white/25 shrink-0" />
                <div>
                  <p className="text-white/30 text-xs">Phone</p>
                  {guest.phone ? (
                    <p className="text-white/75 font-medium">+91 {guest.phone}</p>
                  ) : (
                    <p className="text-amber-400/70 text-xs italic">Not set</p>
                  )}
                </div>
              </div>

              {/* Email */}
              {guest.email && (
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-white/25 shrink-0" />
                  <div>
                    <p className="text-white/30 text-xs">Email</p>
                    <p className="text-white/75 font-medium">{guest.email}</p>
                  </div>
                </div>
              )}

              {/* ID */}
              {guest.idNumber ? (
                <div className="flex items-center gap-3">
                  <CreditCard className="w-4 h-4 text-white/25 shrink-0" />
                  <div>
                    <p className="text-white/30 text-xs">
                      {guest.idType ? (ID_LABEL[guest.idType] ?? guest.idType) : "ID"}
                    </p>
                    <p className="text-white/75 font-medium font-mono">{guest.idNumber}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <CreditCard className="w-4 h-4 text-white/15 shrink-0" />
                  <p className="text-white/25 text-xs italic">No ID on file</p>
                </div>
              )}

              {/* ID Photos — click to read the whole document */}
              {(guest.idFrontUrl || guest.idBackUrl) && (
                <div className="pt-2 border-t border-white/8">
                  <p className="text-white/30 text-xs mb-2">ID Photos</p>
                  <IdPhotos
                    frontUrl={guest.idFrontUrl}
                    backUrl={guest.idBackUrl}
                    who={guest.name}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="bg-white/3 border border-white/8 rounded-2xl p-5 grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-white">{allBookings.length}</p>
              <p className="text-white/30 text-xs mt-0.5">Total Stays</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-400">
                ₹{totalSpend >= 1000 ? `${(totalSpend / 1000).toFixed(0)}k` : totalSpend.toLocaleString("en-IN")}
              </p>
              <p className="text-white/30 text-xs mt-0.5">Total Spend</p>
            </div>
          </div>

          {/* Companion stays note */}
          {companionRows.length > 0 && (
            <div className="bg-white/2 border border-white/6 rounded-xl px-4 py-3 flex items-center gap-2">
              <Users className="w-4 h-4 text-white/25 shrink-0" />
              <p className="text-white/35 text-xs">
                Companion in <span className="text-white/55 font-semibold">{companionRows.length}</span> booking{companionRows.length !== 1 ? "s" : ""}
              </p>
            </div>
          )}
        </div>

        {/* ── Right: Booking history (primary + companion) ── */}
        <div className="lg:col-span-2">
          <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-blue-400" />
                <h2 className="font-semibold text-white text-sm">Booking History</h2>
              </div>
              <span className="text-white/30 text-xs">
                {allBookings.length} booking{allBookings.length !== 1 ? "s" : ""}
              </span>
            </div>

            {allBookings.length === 0 ? (
              <div className="text-center py-12 text-white/20 text-sm">No bookings yet</div>
            ) : (
              <div className="divide-y divide-white/5">
                {allBookings.map(b => {
                  const catMeta   = getCategoryMeta(b.roomCategory);
                  const accent    = catMeta.accentColor;
                  const statusCls = STATUS_COLOR[b.status] ?? "text-white/40 bg-white/5 border-white/10";
                  return (
                    <Link
                      key={b.id}
                      href={`/hotel-admin/bookings/${b.id}`}
                      className="flex items-center gap-4 px-5 py-4 hover:bg-white/3 transition-all group"
                    >
                      {/* Category badge */}
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[10px] font-bold shrink-0"
                        style={{ background: `${accent}18`, border: `1px solid ${accent}30`, color: accent }}>
                        {catMeta.shortName.slice(0, 3).toUpperCase()}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <p className="text-white/70 text-sm font-semibold">#{b.bookingRef}</p>
                          <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${statusCls}`}>
                            {b.status.replace(/_/g, " ")}
                          </span>
                          {/* Companion badge */}
                          {b.asCompanion && (
                            <span className="flex items-center gap-1 text-[10px] font-semibold bg-purple-500/12 text-purple-300 border border-purple-500/20 px-2 py-0.5 rounded-full">
                              <Users className="w-2.5 h-2.5" />
                              Companion{b.relation ? ` · ${b.relation}` : ""}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-white/30 flex-wrap">
                          <span className="flex items-center gap-1">
                            <BedDouble className="w-3 h-3" />
                            {b.room ? `Room ${b.room.roomNumber}` : catMeta.displayName}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {format(new Date(b.checkInDate), "dd MMM")} – {format(new Date(b.checkOutDate), "dd MMM yyyy")}
                          </span>
                          {/* Primary guest info when showing companion booking */}
                          {b.asCompanion && b.primaryGuestName && (
                            <span className="flex items-center gap-1 text-white/25">
                              <User className="w-3 h-3" /> {b.primaryGuestName}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        {!b.asCompanion && (
                          <>
                            <p className="text-white/60 text-sm font-semibold">
                              ₹{b.totalAmount.toLocaleString("en-IN")}
                            </p>
                            {b.balanceDue > 0 && (
                              <p className="text-red-400 text-xs">₹{b.balanceDue.toLocaleString("en-IN")} due</p>
                            )}
                          </>
                        )}
                      </div>

                      <ChevronRight className="w-4 h-4 text-white/15 group-hover:text-white/35 shrink-0 transition-all" />
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
