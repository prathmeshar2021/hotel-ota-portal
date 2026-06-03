export const dynamic = "force-dynamic";

import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { OTA_PREPAID_SOURCES } from "@/lib/ota/sources";
import Link from "next/link";
import {
  LogIn,
  LogOut,
  BedDouble,
  TrendingUp,
  ArrowRight,
  Clock,
  Calendar,
  User,
} from "lucide-react";
import { format, startOfDay, endOfDay, startOfMonth } from "date-fns";
import { getCategoryMeta } from "@/lib/utils/room-categories";

function StatCard({
  label,
  value,
  icon,
  color,
  sub,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  sub?: string;
}) {
  return (
    <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-white/40 text-xs uppercase tracking-wider font-semibold">{label}</p>
        <span
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: `${color}20`, color }}
        >
          {icon}
        </span>
      </div>
      <p className="text-3xl font-bold text-white">{value}</p>
      {sub && <p className="text-white/30 text-xs mt-1">{sub}</p>}
    </div>
  );
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.hotelId) redirect("/auth/staff-login");

  const hotelId = session.user.hotelId;
  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);
  const monthStart = startOfMonth(today);

  const [
    arrivalsToday,
    departuresToday,
    inHouse,
    totalRooms,
    monthRevenue,
    recentArrivals,
    recentDepartures,
  ] = await Promise.all([
    // Today's expected arrivals (CONFIRMED, checkIn = today)
    prisma.booking.count({
      where: {
        hotelId,
        status: "CONFIRMED",
        checkInDate: { gte: todayStart, lte: todayEnd },
      },
    }),
    // Today's expected departures (CHECKED_IN, checkOut = today)
    prisma.booking.count({
      where: {
        hotelId,
        status: "CHECKED_IN",
        checkOutDate: { gte: todayStart, lte: todayEnd },
      },
    }),
    // Currently in-house
    prisma.booking.count({
      where: { hotelId, status: "CHECKED_IN" },
    }),
    // Total active rooms
    prisma.room.count({
      where: { hotelId, isActive: true },
    }),
    // This month's revenue — exclude OTA-prepaid bookings (paid to the channel)
    prisma.booking.aggregate({
      where: {
        hotelId,
        status: { in: ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] },
        createdAt: { gte: monthStart },
        source: { notIn: OTA_PREPAID_SOURCES },
      },
      _sum: { totalAmount: true },
    }),
    // Today's arrivals detail
    prisma.booking.findMany({
      where: {
        hotelId,
        status: { in: ["CONFIRMED", "CHECKED_IN"] },
        checkInDate: { gte: todayStart, lte: todayEnd },
      },
      include: {
        primaryGuest: { select: { name: true, phone: true } },
        room: { select: { roomNumber: true, roomType: true } },
        onlineCheckin: { select: { completedAt: true } },
      },
      orderBy: { checkInDate: "asc" },
      take: 6,
    }),
    // Today's departures detail
    prisma.booking.findMany({
      where: {
        hotelId,
        status: "CHECKED_IN",
        checkOutDate: { gte: todayStart, lte: todayEnd },
      },
      include: {
        primaryGuest: { select: { name: true, phone: true } },
        room: { select: { roomNumber: true, roomType: true } },
      },
      orderBy: { checkOutDate: "asc" },
      take: 6,
    }),
  ]);

  const occupancyPct = totalRooms > 0 ? Math.round((inHouse / totalRooms) * 100) : 0;
  const revenue = monthRevenue._sum.totalAmount ?? 0;

  return (
    <div className="p-6 max-w-6xl">
      {/* Header */}
      <div className="mb-7">
        <p className="text-white/35 text-xs uppercase tracking-widest mb-1">
          {format(today, "EEEE, dd MMMM yyyy")}
        </p>
        <h1 className="text-2xl font-bold text-white">
          Good {today.getHours() < 12 ? "Morning" : today.getHours() < 17 ? "Afternoon" : "Evening"},{" "}
          <span className="text-blue-400">{session.user.name?.split(" ")[0]}</span>
        </h1>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
        <StatCard
          label="Arrivals Today"
          value={arrivalsToday}
          icon={<LogIn className="w-4 h-4" />}
          color="#60A5FA"
          sub="CONFIRMED bookings"
        />
        <StatCard
          label="Departures Today"
          value={departuresToday}
          icon={<LogOut className="w-4 h-4" />}
          color="#F59E0B"
          sub="Due to check out"
        />
        <StatCard
          label="In House"
          value={inHouse}
          icon={<BedDouble className="w-4 h-4" />}
          color="#4ADE80"
          sub={`${occupancyPct}% occupancy`}
        />
        <StatCard
          label="Month Revenue"
          value={`₹${Math.round(revenue / 1000)}K`}
          icon={<TrendingUp className="w-4 h-4" />}
          color="#C084FC"
          sub={format(today, "MMMM yyyy")}
        />
      </div>

      {/* Two-column: arrivals + departures */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Today's Arrivals */}
        <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
            <div className="flex items-center gap-2.5">
              <LogIn className="w-4 h-4 text-blue-400" />
              <h2 className="font-semibold text-white text-sm">Today&apos;s Arrivals</h2>
              {arrivalsToday > 0 && (
                <span className="bg-blue-500/20 text-blue-400 text-xs font-bold px-2 py-0.5 rounded-full border border-blue-500/25">
                  {arrivalsToday}
                </span>
              )}
            </div>
            <Link
              href="/hotel-admin/bookings?filter=arrivals-today"
              className="text-xs text-white/30 hover:text-white/60 flex items-center gap-1 transition-colors"
            >
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {recentArrivals.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-white/25 text-sm">No arrivals today</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {recentArrivals.map((b) => {
                const cat = getCategoryMeta(b.roomCategory);
                return (
                <Link
                  key={b.id}
                  href={`/hotel-admin/bookings/${b.id}`}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-white/3 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-bold text-black shrink-0"
                      style={{ background: cat.accentColor }}
                    >
                      {cat.shortName.slice(0, 3).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-white/80 text-sm font-medium">{b.primaryGuest.name}</p>
                      <p className="text-white/30 text-xs">
                        {b.room ? `#${b.room.roomNumber} · ` : "TBA · "}{b.primaryGuest.phone}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {b.onlineCheckin?.completedAt ? (
                      <span className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full">
                        Online CI done
                      </span>
                    ) : (
                      <span className="text-xs text-white/30">No online CI</span>
                    )}
                    {b.status === "CHECKED_IN" && (
                      <p className="text-green-400 text-xs mt-1 font-semibold">Checked In</p>
                    )}
                  </div>
                </Link>
              );
              })}
            </div>
          )}
        </div>

        {/* Today's Departures */}
        <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
            <div className="flex items-center gap-2.5">
              <LogOut className="w-4 h-4 text-amber-400" />
              <h2 className="font-semibold text-white text-sm">Today&apos;s Departures</h2>
              {departuresToday > 0 && (
                <span className="bg-amber-500/20 text-amber-400 text-xs font-bold px-2 py-0.5 rounded-full border border-amber-500/25">
                  {departuresToday}
                </span>
              )}
            </div>
            <Link
              href="/hotel-admin/bookings?filter=departures-today"
              className="text-xs text-white/30 hover:text-white/60 flex items-center gap-1 transition-colors"
            >
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {recentDepartures.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-white/25 text-sm">No departures today</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {recentDepartures.map((b) => {
                const cat = getCategoryMeta(b.roomCategory);
                return (
                <Link
                  key={b.id}
                  href={`/hotel-admin/bookings/${b.id}`}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-white/3 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-bold text-black shrink-0"
                      style={{ background: cat.accentColor }}
                    >
                      {cat.shortName.slice(0, 3).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-white/80 text-sm font-medium">{b.primaryGuest.name}</p>
                      <p className="text-white/30 text-xs">
                        {b.room ? `#${b.room.roomNumber} · ` : "TBA · "}{b.primaryGuest.phone}
                      </p>
                    </div>
                  </div>
                  <Clock className="w-4 h-4 text-amber-400/60" />
                </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
        {[
          { href: "/hotel-admin/bookings", label: "All Bookings", icon: <Calendar className="w-4 h-4" />, color: "#60A5FA" },
          { href: "/hotel-admin/bookings?filter=in-house", label: "In-House Guests", icon: <User className="w-4 h-4" />, color: "#4ADE80" },
          { href: "/hotel-admin/rooms", label: "Room Status Board", icon: <BedDouble className="w-4 h-4" />, color: "#F59E0B" },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-center justify-between bg-white/3 border border-white/8 rounded-xl px-4 py-3.5 hover:bg-white/5 hover:border-white/15 transition-all group"
          >
            <div className="flex items-center gap-3">
              <span style={{ color: link.color }}>{link.icon}</span>
              <span className="text-white/60 group-hover:text-white/80 text-sm font-medium transition-colors">
                {link.label}
              </span>
            </div>
            <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-white/40 transition-colors" />
          </Link>
        ))}
      </div>
    </div>
  );
}
