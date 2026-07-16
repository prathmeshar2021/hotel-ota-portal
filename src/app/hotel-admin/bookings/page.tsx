export const dynamic = "force-dynamic";

import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import Link from "next/link";
import { format, startOfDay, endOfDay } from "date-fns";
import { Calendar, User, ArrowRight, Phone, Search, LogIn, LogOut } from "lucide-react";
import { getCategoryMeta } from "@/lib/utils/room-categories";

type Filter = "all" | "arrivals-today" | "departures-today" | "in-house" | "upcoming" | "checked-out";
type SortKey = "checkin-desc" | "checkin-asc" | "created-desc" | "checkout-asc";
type SourceKey = "all" | "direct" | "MMT" | "GOIBIBO";

interface Props {
  searchParams: Promise<{ filter?: string; q?: string; sort?: string; source?: string }>;
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  PENDING_PAYMENT: { label: "Pending Payment", cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25" },
  CONFIRMED: { label: "Confirmed", cls: "bg-blue-500/15 text-blue-400 border-blue-500/25" },
  CHECKED_IN: { label: "Checked In", cls: "bg-green-500/15 text-green-400 border-green-500/25" },
  CHECKED_OUT: { label: "Checked Out", cls: "bg-white/8 text-white/40 border-white/10" },
  CANCELLED: { label: "Cancelled", cls: "bg-red-500/15 text-red-400 border-red-500/25" },
  NO_SHOW: { label: "No Show", cls: "bg-orange-500/15 text-orange-400 border-orange-500/25" },
};


// OTA channels get a highlighted source tag; direct sources stay untagged.
const SOURCE_CONFIG: Record<string, { label: string; cls: string }> = {
  MMT: { label: "MakeMyTrip", cls: "bg-red-500/15 text-red-300 border-red-500/30" },
  GOIBIBO: { label: "Goibibo", cls: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  BOOKING_COM: { label: "Booking.com", cls: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" },
};

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All Bookings" },
  { key: "arrivals-today", label: "Arrivals Today" },
  { key: "departures-today", label: "Departing Today" },
  { key: "in-house", label: "In House" },
  { key: "upcoming", label: "Upcoming" },
  { key: "checked-out", label: "Checked Out" },
];

const SOURCE_FILTERS: { key: SourceKey; label: string }[] = [
  { key: "all", label: "All Channels" },
  { key: "direct", label: "Direct" },
  { key: "MMT", label: "MakeMyTrip" },
  { key: "GOIBIBO", label: "Goibibo" },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: "checkin-desc", label: "Check-in · newest" },
  { key: "checkin-asc", label: "Check-in · oldest" },
  { key: "created-desc", label: "Recently booked" },
  { key: "checkout-asc", label: "Check-out · soonest" },
];

const ORDER_BY: Record<SortKey, Record<string, "asc" | "desc">> = {
  "checkin-desc": { checkInDate: "desc" },
  "checkin-asc": { checkInDate: "asc" },
  "created-desc": { createdAt: "desc" },
  "checkout-asc": { checkOutDate: "asc" },
};

const DIRECT_SOURCES = ["PORTAL", "WALK_IN", "PHONE", "OTHER"];

// Build a clean bookings URL, omitting default values.
function bookingsHref(p: { filter: Filter; q: string; sort: SortKey; source: SourceKey }) {
  const sp = new URLSearchParams();
  if (p.filter !== "all") sp.set("filter", p.filter);
  if (p.q) sp.set("q", p.q);
  if (p.sort !== "checkin-desc") sp.set("sort", p.sort);
  if (p.source !== "all") sp.set("source", p.source);
  const qs = sp.toString();
  return `/hotel-admin/bookings${qs ? `?${qs}` : ""}`;
}

export default async function BookingsPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.hotelId) redirect("/auth/staff-login");
  const hotelId = session.user.hotelId;
  const sp = await searchParams;

  const filter = (sp.filter ?? "all") as Filter;
  const query = sp.q?.trim() ?? "";
  const sort: SortKey = (sp.sort && sp.sort in ORDER_BY ? sp.sort : "checkin-desc") as SortKey;
  const source: SourceKey = (["all", "direct", "MMT", "GOIBIBO"].includes(sp.source ?? "")
    ? sp.source
    : "all") as SourceKey;

  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);

  // Build where clause
  const where: Record<string, unknown> = { hotelId };

  if (query) {
    where.OR = [
      { bookingRef: { contains: query, mode: "insensitive" } },
      { primaryGuest: { name: { contains: query, mode: "insensitive" } } },
      { primaryGuest: { phone: { contains: query } } },
    ];
  }

  if (source === "direct") where.source = { in: DIRECT_SOURCES };
  else if (source !== "all") where.source = source;

  switch (filter) {
    case "arrivals-today":
      where.status = "CONFIRMED";
      where.checkInDate = { gte: todayStart, lte: todayEnd };
      break;
    case "departures-today":
      where.status = "CHECKED_IN";
      where.checkOutDate = { gte: todayStart, lte: todayEnd };
      break;
    case "in-house":
      where.status = "CHECKED_IN";
      break;
    case "upcoming":
      where.status = "CONFIRMED";
      where.checkInDate = { gt: todayEnd };
      break;
    case "checked-out":
      where.status = "CHECKED_OUT";
      break;
    // "all" — no extra filter
  }

  const bookings = await prisma.booking.findMany({
    where,
    include: {
      primaryGuest: { select: { name: true, phone: true } },
      room: { select: { roomNumber: true, roomType: true } },
      onlineCheckin: { select: { completedAt: true } },
    },
    orderBy: [ORDER_BY[sort]],
    take: 50,
  });

  return (
    <div className="p-6 max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Bookings</h1>
        <p className="text-white/35 text-sm">{bookings.length} booking{bookings.length !== 1 ? "s" : ""} found</p>
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2 mb-3">
        {FILTERS.map(({ key, label }) => (
          <Link
            key={key}
            href={bookingsHref({ filter: key, q: query, sort, source })}
            className={`text-xs font-semibold px-3.5 py-2 rounded-xl border transition-all ${
              filter === key
                ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                : "bg-white/3 text-white/40 border-white/8 hover:bg-white/6 hover:text-white/60"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Channel filter */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-[10px] uppercase tracking-wider text-white/25 font-semibold mr-1">Channel</span>
        {SOURCE_FILTERS.map(({ key, label }) => (
          <Link
            key={key}
            href={bookingsHref({ filter, q: query, sort, source: key })}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
              source === key
                ? "bg-red-500/15 text-red-300 border-red-500/30"
                : "bg-white/3 text-white/40 border-white/8 hover:bg-white/6 hover:text-white/60"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Sort */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <span className="text-[10px] uppercase tracking-wider text-white/25 font-semibold mr-1">Sort</span>
        {SORTS.map(({ key, label }) => (
          <Link
            key={key}
            href={bookingsHref({ filter, q: query, sort: key, source })}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
              sort === key
                ? "bg-violet-500/15 text-violet-300 border-violet-500/30"
                : "bg-white/3 text-white/40 border-white/8 hover:bg-white/6 hover:text-white/60"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Search */}
      <form method="get" className="mb-5">
        {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
        {sort !== "checkin-desc" && <input type="hidden" name="sort" value={sort} />}
        {source !== "all" && <input type="hidden" name="source" value={source} />}
        <div className="relative max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
          <input
            name="q"
            defaultValue={query}
            placeholder="Search by name, phone, or ref…"
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-blue-400/40 transition-all"
          />
        </div>
      </form>

      {/* Booking list */}
      {bookings.length === 0 ? (
        <div className="text-center py-20 bg-white/2 border border-white/6 rounded-2xl">
          <p className="text-white/25 font-medium">No bookings found</p>
          <p className="text-white/15 text-sm mt-1">Try a different filter or search term</p>
        </div>
      ) : (
        <div className="space-y-2">
          {bookings.map((b) => {
            const status = STATUS_CONFIG[b.status] ?? { label: b.status, cls: "bg-white/8 text-white/40 border-white/10" };
            const catMeta = getCategoryMeta(b.roomCategory);
            const accent = catMeta.accentColor;
            return (
              <Link
                key={b.id}
                href={`/hotel-admin/bookings/${b.id}`}
                className="flex items-center gap-4 bg-white/3 border border-white/8 rounded-2xl px-5 py-4 hover:bg-white/5 hover:border-white/15 transition-all group"
              >
                {/* Category badge */}
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold text-black shrink-0"
                  style={{ background: accent }}
                >
                  {catMeta.shortName.slice(0, 3).toUpperCase()}
                </div>

                {/* Guest + ref */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-semibold text-white/85 text-sm truncate">{b.primaryGuest.name}</p>
                    {SOURCE_CONFIG[b.source] && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0 ${SOURCE_CONFIG[b.source].cls}`}>
                        {SOURCE_CONFIG[b.source].label}
                      </span>
                    )}
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border shrink-0 ${status.cls}`}>
                      {status.label}
                    </span>
                    {b.viaKiosk && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0 bg-amber-500/15 text-amber-300 border-amber-500/30">
                        Kiosk
                      </span>
                    )}
                    {(b.refundStatus === "PENDING" || b.refundStatus === "FAILED") && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0 bg-amber-500/15 text-amber-300 border-amber-500/30">
                        Refund pending
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-white/35">
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3" />{b.primaryGuest.phone}
                    </span>
                    {b.room ? (
                      <span>Room #{b.room.roomNumber}</span>
                    ) : (
                      <span className="italic text-white/25">Room TBA</span>
                    )}
                    <span className="font-mono text-white/50">{b.bookingRef}</span>
                  </div>
                </div>

                {/* Dates + actual check-in/out times */}
                <div className="text-right shrink-0 hidden sm:block space-y-0.5">
                  {/* Planned dates */}
                  <div className="flex items-center gap-1.5 text-xs text-white/40 justify-end">
                    <Calendar className="w-3 h-3" />
                    {format(b.checkInDate, "dd MMM")} → {format(b.checkOutDate, "dd MMM")}
                  </div>
                  {/* Actual check-in time */}
                  {b.checkedInAt && (
                    <div className="flex items-center gap-1 text-[10px] text-green-400 justify-end">
                      <LogIn className="w-3 h-3" />
                      In: {format(b.checkedInAt, "dd MMM, hh:mm a")}
                    </div>
                  )}
                  {/* Actual check-out time */}
                  {b.checkedOutAt && (
                    <div className="flex items-center gap-1 text-[10px] text-amber-400 justify-end">
                      <LogOut className="w-3 h-3" />
                      Out: {format(b.checkedOutAt, "dd MMM, hh:mm a")}
                    </div>
                  )}
                  {/* Online CI badge (only when not yet checked in) */}
                  {!b.checkedInAt && b.onlineCheckin?.completedAt && (
                    <span className="text-[10px] text-green-400 block text-right">✓ Online CI done</span>
                  )}
                </div>

                <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-white/50 shrink-0 transition-colors" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
