export const dynamic = "force-dynamic";

import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import Link from "next/link";
import { format, startOfMonth } from "date-fns";
import { Plane, Calendar, ArrowRight, IndianRupee, CheckCircle2, XCircle } from "lucide-react";
import { getCategoryMeta } from "@/lib/utils/room-categories";
import { OTA_PREPAID_SOURCES, otaSourceLabel } from "@/lib/ota/sources";

const SOURCE_CLS: Record<string, string> = {
  MMT: "bg-red-500/15 text-red-300 border-red-500/30",
  GOIBIBO: "bg-orange-500/15 text-orange-300 border-orange-500/30",
};

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  PENDING_PAYMENT: { label: "Pending", cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25" },
  CONFIRMED: { label: "Confirmed", cls: "bg-blue-500/15 text-blue-400 border-blue-500/25" },
  CHECKED_IN: { label: "Checked In", cls: "bg-green-500/15 text-green-400 border-green-500/25" },
  CHECKED_OUT: { label: "Checked Out", cls: "bg-white/8 text-white/40 border-white/10" },
  CANCELLED: { label: "Cancelled", cls: "bg-red-500/15 text-red-400 border-red-500/25" },
  NO_SHOW: { label: "No Show", cls: "bg-orange-500/15 text-orange-400 border-orange-500/25" },
};

function fmt(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export default async function GommtFinancePage() {
  const session = await auth();
  if (!session?.user?.hotelId) redirect("/auth/staff-login");
  if (session.user.role !== "HOTEL_ADMIN" && session.user.role !== "HOTEL_STAFF" && session.user.role !== "SUPER_ADMIN")
    redirect("/");

  const hotelId = session.user.hotelId;
  const monthStart = startOfMonth(new Date());

  const [bookings, liveAgg, monthAgg, cancelledCount] = await Promise.all([
    prisma.booking.findMany({
      where: { hotelId, source: { in: OTA_PREPAID_SOURCES } },
      include: { primaryGuest: { select: { name: true } } },
      orderBy: { checkInDate: "desc" },
      take: 200,
    }),
    // Live (non-cancelled) value paid to the channel
    prisma.booking.aggregate({
      where: { hotelId, source: { in: OTA_PREPAID_SOURCES }, status: { not: "CANCELLED" } },
      _sum: { totalAmount: true },
      _count: { _all: true },
    }),
    // This month's OTA value (by booking creation)
    prisma.booking.aggregate({
      where: {
        hotelId,
        source: { in: OTA_PREPAID_SOURCES },
        status: { not: "CANCELLED" },
        createdAt: { gte: monthStart },
      },
      _sum: { totalAmount: true },
    }),
    prisma.booking.count({
      where: { hotelId, source: { in: OTA_PREPAID_SOURCES }, status: "CANCELLED" },
    }),
  ]);

  const liveValue = liveAgg._sum.totalAmount ?? 0;
  const liveCount = liveAgg._count._all;
  const monthValue = monthAgg._sum.totalAmount ?? 0;

  return (
    <div className="p-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-2xl bg-red-500/15 border border-red-500/20 flex items-center justify-center shrink-0">
          <Plane className="w-5 h-5 text-red-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">GoMMT Finance</h1>
          <p className="text-white/35 text-xs">
            MakeMyTrip &amp; Goibibo bookings · paid to the channel, not collected at the hotel
          </p>
        </div>
      </div>

      {/* Note */}
      <div className="mb-5 rounded-xl border border-red-500/15 bg-red-500/5 px-4 py-3 text-xs text-red-300/80">
        These bookings are prepaid to GoMMT and are intentionally excluded from the hotel&apos;s own
        Accounts and revenue. This view is for channel reconciliation only.
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div className="rounded-2xl p-5 border bg-white/3 border-white/8">
          <div className="flex items-start justify-between mb-3">
            <p className="text-white/40 text-xs uppercase tracking-wider font-semibold">Live Value</p>
            <span className="w-9 h-9 rounded-xl bg-red-500/15 flex items-center justify-center text-red-400">
              <IndianRupee className="w-5 h-5" />
            </span>
          </div>
          <p className="text-2xl font-bold text-red-300">{fmt(liveValue)}</p>
          <p className="text-white/30 text-xs mt-1">{liveCount} active booking{liveCount !== 1 ? "s" : ""}</p>
        </div>

        <div className="rounded-2xl p-5 border bg-white/3 border-white/8">
          <div className="flex items-start justify-between mb-3">
            <p className="text-white/40 text-xs uppercase tracking-wider font-semibold">This Month</p>
            <span className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center text-blue-400">
              <Calendar className="w-5 h-5" />
            </span>
          </div>
          <p className="text-2xl font-bold text-blue-300">{fmt(monthValue)}</p>
          <p className="text-white/30 text-xs mt-1">Booked since {format(monthStart, "dd MMM")}</p>
        </div>

        <div className="rounded-2xl p-5 border bg-white/3 border-white/8 col-span-2 lg:col-span-1">
          <div className="flex items-start justify-between mb-3">
            <p className="text-white/40 text-xs uppercase tracking-wider font-semibold">Cancelled</p>
            <span className="w-9 h-9 rounded-xl bg-white/8 flex items-center justify-center text-white/40">
              <XCircle className="w-5 h-5" />
            </span>
          </div>
          <p className="text-2xl font-bold text-white/70">{cancelledCount}</p>
          <p className="text-white/30 text-xs mt-1">Released back to inventory</p>
        </div>
      </div>

      {/* Bookings list */}
      {bookings.length === 0 ? (
        <div className="text-center py-20 bg-white/2 border border-white/6 rounded-2xl">
          <Plane className="w-8 h-8 text-white/15 mx-auto mb-3" />
          <p className="text-white/30 font-medium">No GoMMT bookings yet</p>
          <p className="text-white/20 text-sm mt-1">They appear here automatically when synced from the OTA inbox</p>
        </div>
      ) : (
        <div className="bg-white/2 border border-white/8 rounded-2xl overflow-hidden">
          {/* Desktop header */}
          <div className="hidden sm:grid grid-cols-[1.4fr_1fr_auto_auto_auto] gap-4 px-5 py-2.5 border-b border-white/5 bg-white/2">
            <p className="text-white/25 text-[10px] uppercase tracking-wider font-semibold">Guest</p>
            <p className="text-white/25 text-[10px] uppercase tracking-wider font-semibold">Stay</p>
            <p className="text-white/25 text-[10px] uppercase tracking-wider font-semibold">Channel</p>
            <p className="text-white/25 text-[10px] uppercase tracking-wider font-semibold">Status</p>
            <p className="text-white/25 text-[10px] uppercase tracking-wider font-semibold text-right">Amount</p>
          </div>

          <div className="divide-y divide-white/5">
            {bookings.map((b) => {
              const cat = getCategoryMeta(b.roomCategory);
              const st = STATUS_CONFIG[b.status] ?? { label: b.status, cls: "bg-white/8 text-white/40 border-white/10" };
              const cancelled = b.status === "CANCELLED";
              return (
                <Link
                  key={b.id}
                  href={`/hotel-admin/bookings/${b.id}`}
                  className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr_auto_auto_auto] gap-2 sm:gap-4 px-5 py-3.5 hover:bg-white/2 transition-colors group items-center"
                >
                  {/* Guest + ref */}
                  <div className="min-w-0">
                    <p className="text-white/85 text-sm font-semibold truncate">{b.primaryGuest.name}</p>
                    <p className="text-white/25 text-[10px] font-mono">{b.bookingRef}</p>
                  </div>

                  {/* Stay */}
                  <div className="text-xs text-white/40">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {format(b.checkInDate, "dd MMM")} → {format(b.checkOutDate, "dd MMM")}
                    </span>
                    <span className="text-white/25 text-[10px]">{cat.displayName}</span>
                  </div>

                  {/* Channel */}
                  <div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${SOURCE_CLS[b.source] ?? "bg-white/8 text-white/40 border-white/10"}`}>
                      {otaSourceLabel(b.source)}
                    </span>
                  </div>

                  {/* Status */}
                  <div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${st.cls}`}>
                      {st.label}
                    </span>
                  </div>

                  {/* Amount */}
                  <div className="text-right flex items-center justify-end gap-2">
                    <span className={`font-bold text-sm ${cancelled ? "text-white/30 line-through" : "text-red-300"}`}>
                      {fmt(b.totalAmount)}
                    </span>
                    {!cancelled && <CheckCircle2 className="w-3.5 h-3.5 text-red-400/50 shrink-0" />}
                    <ArrowRight className="w-3.5 h-3.5 text-white/15 group-hover:text-white/40 shrink-0 transition-colors" />
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="border-t border-white/8 px-5 py-3 flex justify-between items-center bg-white/2">
            <p className="text-white/30 text-xs">{bookings.length} booking{bookings.length !== 1 ? "s" : ""} shown</p>
            <div className="flex items-center gap-2">
              <span className="text-white/30 text-xs">Live value:</span>
              <span className="font-bold text-sm text-red-300">{fmt(liveValue)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
