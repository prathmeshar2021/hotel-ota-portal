import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import Link from "next/link";
import { Users, UserPlus, Phone, Mail, CreditCard, Search, ChevronRight } from "lucide-react";

export const metadata = { title: "Guests – Front Desk" };

const ID_LABEL: Record<string, string> = {
  AADHAR: "Aadhar",
  DRIVING_LICENSE: "DL",
  PASSPORT: "Passport",
  VOTER_ID: "Voter ID",
  OTHER: "ID",
};

interface SearchParams {
  q?: string;
}

export default async function GuestsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await auth();
  if (!session?.user?.hotelId) redirect("/auth/staff-login");
  if (session.user.role !== "HOTEL_ADMIN" && session.user.role !== "HOTEL_STAFF") redirect("/");

  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const guests = query.length >= 2
    ? await prisma.guest.findMany({
        where: {
          OR: [
            { phone: { contains: query } },
            { name: { contains: query, mode: "insensitive" } },
            { idNumber: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
          ],
        },
        include: {
          _count: { select: { bookings: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      })
    : await prisma.guest.findMany({
        include: { _count: { select: { bookings: true } } },
        orderBy: { createdAt: "desc" },
        take: 30,
      });

  return (
    <div className="p-6 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-400" />
            <h1 className="text-xl font-bold text-white">Guest Registry</h1>
          </div>
          <p className="text-white/35 text-sm mt-0.5">Walk-in registrations &amp; returning guest lookup</p>
        </div>
        <Link
          href="/hotel-admin/guests/new"
          className="flex items-center gap-2 bg-blue-500 hover:bg-blue-400 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-all"
        >
          <UserPlus className="w-4 h-4" /> Register Guest
        </Link>
      </div>

      {/* Search */}
      <form method="GET" className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
          <input
            name="q"
            defaultValue={query}
            placeholder="Search by name, phone, ID number…"
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-blue-400/40 focus:bg-white/8 transition-all"
          />
        </div>
      </form>

      {/* Result count */}
      <p className="text-white/30 text-xs uppercase tracking-wider font-semibold mb-4">
        {query.length >= 2
          ? `${guests.length} result${guests.length !== 1 ? "s" : ""} for "${query}"`
          : `${guests.length} most recent guest${guests.length !== 1 ? "s" : ""}`}
      </p>

      {/* Guest list */}
      {guests.length === 0 ? (
        <div className="text-center py-16 text-white/20 text-sm">
          {query ? "No guests found — try a different search" : "No guests registered yet"}
        </div>
      ) : (
        <div className="space-y-2">
          {guests.map(guest => (
            <Link
              key={guest.id}
              href={`/hotel-admin/guests/${guest.id}`}
              className="flex items-center gap-4 bg-white/3 border border-white/8 rounded-2xl px-5 py-4 hover:bg-white/5 hover:border-white/15 transition-all group"
            >
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-blue-500/15 border border-blue-500/20 flex items-center justify-center shrink-0 text-blue-300 font-bold text-sm">
                {guest.name.charAt(0).toUpperCase()}
              </div>

              {/* Main info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-white text-sm">{guest.name}</p>
                  {guest._count.bookings > 0 && (
                    <span className="text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/20 px-2 py-0.5 rounded-full">
                      {guest._count.bookings} booking{guest._count.bookings !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-1 flex-wrap">
                  <span className="text-white/40 text-xs flex items-center gap-1">
                    <Phone className="w-3 h-3" /> +91 {guest.phone}
                  </span>
                  {guest.email && (
                    <span className="text-white/30 text-xs flex items-center gap-1">
                      <Mail className="w-3 h-3" /> {guest.email}
                    </span>
                  )}
                  {guest.idNumber && (
                    <span className="text-white/30 text-xs flex items-center gap-1">
                      <CreditCard className="w-3 h-3" />
                      {guest.idType ? ID_LABEL[guest.idType] ?? guest.idType : "ID"}: {guest.idNumber}
                    </span>
                  )}
                </div>
              </div>

              <ChevronRight className="w-4 h-4 text-white/15 group-hover:text-white/35 shrink-0 transition-all" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
