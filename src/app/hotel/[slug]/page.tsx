export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Image from "next/image";
import Navbar from "@/components/customer/Navbar";
import RoomCard from "@/components/customer/RoomCard";
import { prisma } from "@/lib/db/prisma";
import {
  MapPin,
  Star,
  Phone,
  Clock,
  Wifi,
  Car,
  Utensils,
  Wind,
  Waves,
  Trees,
  CalendarDays,
  Sparkles,
} from "lucide-react";
import HotelDateSearch from "@/components/customer/HotelDateSearch";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ checkIn?: string; checkOut?: string; guests?: string }>;
}

const AMENITY_ICONS: Record<string, React.ReactNode> = {
  WiFi: <Wifi className="w-4 h-4" />,
  Parking: <Car className="w-4 h-4" />,
  Restaurant: <Utensils className="w-4 h-4" />,
  "Air Conditioning": <Wind className="w-4 h-4" />,
  Pool: <Waves className="w-4 h-4" />,
  Garden: <Trees className="w-4 h-4" />,
};

async function getHotel(slug: string, checkIn?: string, checkOut?: string) {
  return prisma.hotel.findUnique({
    where: { slug, isActive: true },
    include: {
      rooms: {
        where: {
          isActive: true,
          ...(checkIn && checkOut
            ? {
                bookings: {
                  none: {
                    status: { in: ["CONFIRMED", "CHECKED_IN"] },
                    checkInDate: { lt: new Date(checkOut) },
                    checkOutDate: { gt: new Date(checkIn) },
                  },
                },
              }
            : {}),
        },
        orderBy: { basePrice: "asc" },
      },
      reviews: {
        where: { isVisible: true },
        include: { guest: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 8,
      },
      _count: { select: { reviews: true } },
    },
  });
}

export default async function HotelDetailPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const hotel = await getHotel(slug, sp.checkIn, sp.checkOut);

  if (!hotel) notFound();

  const avgRating =
    hotel.reviews.length > 0
      ? hotel.reviews.reduce((s, r) => s + r.rating, 0) / hotel.reviews.length
      : null;

  const heroImage = hotel.images[0] ?? "/images/hero.jpg";
  const hasDateFilter = !!(sp.checkIn && sp.checkOut);

  return (
    <div className="min-h-screen bg-[#071209]">
      <Navbar />

      {/* ── Hero strip ─────────────────────────────── */}
      <div className="relative h-56 md:h-72 overflow-hidden mt-16">
        <Image
          src={heroImage}
          alt={hotel.name}
          fill
          className="object-cover opacity-40"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-amber-950/30 via-transparent to-[#071209]" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#071209] via-transparent to-transparent" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />

        <div className="relative z-10 h-full flex flex-col justify-end px-5 pb-7 max-w-7xl mx-auto">
          {avgRating && (
            <div className="flex items-center gap-1.5 mb-2 w-fit bg-amber-500/15 border border-amber-500/25 px-3 py-1 rounded-full">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span className="text-amber-300 text-xs font-bold">{avgRating.toFixed(1)}</span>
              <span className="text-white/30 text-xs">· {hotel._count.reviews} reviews</span>
            </div>
          )}
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">{hotel.name}</h1>
          <p className="text-white/45 text-sm flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" />
            {hotel.address}, {hotel.city}, {hotel.state}
          </p>
        </div>
      </div>

      {/* ── Main grid ──────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 pb-16 -mt-2">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left: rooms + reviews */}
          <div className="lg:col-span-2 space-y-8">

            {/* Description */}
            {hotel.description && (
              <div className="glass-card glass-shimmer glass-top-highlight rounded-3xl p-6">
                <p className="text-white/60 text-sm leading-relaxed">{hotel.description}</p>
              </div>
            )}

            {/* Amenities */}
            {hotel.amenities.length > 0 && (
              <div>
                <h2 className="text-white/50 text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5" /> Amenities
                </h2>
                <div className="flex flex-wrap gap-2">
                  {hotel.amenities.map((a) => (
                    <span
                      key={a}
                      className="glass-badge flex items-center gap-1.5 text-sm text-white/60 px-4 py-2 rounded-full"
                    >
                      <span className="text-amber-400/70">{AMENITY_ICONS[a] ?? null}</span>
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Rooms */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold text-lg">
                  {hasDateFilter ? "Available Rooms" : "Our Rooms"}
                </h2>
                {hasDateFilter && (
                  <span className="text-xs text-amber-400/70 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full flex items-center gap-1.5">
                    <CalendarDays className="w-3 h-3" />
                    {sp.checkIn} → {sp.checkOut}
                  </span>
                )}
              </div>

              {hotel.rooms.length === 0 ? (
                <div className="bg-amber-500/8 border border-amber-500/20 rounded-3xl p-8 text-center">
                  <p className="text-amber-300 font-semibold mb-1">No rooms available for selected dates</p>
                  <p className="text-white/40 text-sm">Try different dates or contact us directly.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {hotel.rooms.map((room) => (
                    <RoomCard
                      key={room.id}
                      room={room}
                      hotelSlug={hotel.slug}
                      searchParams={sp}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Reviews */}
            {hotel.reviews.length > 0 && (
              <div>
                <h2 className="text-white font-semibold text-lg mb-4">Guest Reviews</h2>
                <div className="space-y-3">
                  {hotel.reviews.map((review) => (
                    <div
                      key={review.id}
                      className="glass-card glass-top-highlight rounded-2xl p-5"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-semibold text-sm text-white/80">{review.guest.name}</p>
                        <span className="text-amber-400 text-sm tracking-widest">
                          {"★".repeat(review.rating)}
                          <span className="text-white/15">{"★".repeat(5 - review.rating)}</span>
                        </span>
                      </div>
                      {review.title && (
                        <p className="text-sm font-medium text-white/60 mb-1">{review.title}</p>
                      )}
                      {review.comment && (
                        <p className="text-xs text-white/35 leading-relaxed">{review.comment}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: info sidebar */}
          <div>
            <div className="sticky top-24 glass-card glass-shimmer rounded-3xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.12)]">
              {/* Sidebar hotel image */}
              <div className="relative h-40 overflow-hidden">
                <Image
                  src={hotel.images[1] ?? heroImage}
                  alt={hotel.name}
                  fill
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/50 to-transparent" />
              </div>

              <div className="p-5 space-y-5">
                <div>
                  <h3 className="font-bold text-white">{hotel.name}</h3>
                  <p className="text-white/35 text-xs mt-0.5">{hotel.city}, {hotel.state}</p>
                </div>

                {/* ── Date / availability search ── */}
                <div className="border-t border-white/8 pt-4">
                  <p className="text-xs font-bold text-white/50 uppercase tracking-widest mb-3">
                    Check Availability
                  </p>
                  <HotelDateSearch
                    hotelSlug={hotel.slug}
                    defaultCheckIn={sp.checkIn}
                    defaultCheckOut={sp.checkOut}
                    defaultGuests={sp.guests ? Number(sp.guests) : 2}
                  />
                </div>

                {/* Hotel info */}
                <div className="space-y-3 text-sm border-t border-white/8 pt-4">
                  <div className="flex items-center gap-3 text-white/55">
                    <Phone className="w-4 h-4 text-amber-400/60 shrink-0" />
                    <a href={`tel:${hotel.phone}`} className="hover:text-amber-300 transition-colors">
                      {hotel.phone}
                    </a>
                  </div>
                  <div className="flex items-start gap-3 text-white/55">
                    <Clock className="w-4 h-4 text-amber-400/60 shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <p>Check-in: <span className="text-white/70">{hotel.checkInTime}</span></p>
                      <p>Check-out: <span className="text-white/70">{hotel.checkOutTime}</span></p>
                    </div>
                  </div>
                  {hotel.gstin && (
                    <p className="text-xs text-white/25">GSTIN: {hotel.gstin}</p>
                  )}
                </div>

                <div className="glass-card rounded-xl p-4 text-xs text-white/40 space-y-1.5">
                  <p>✅ Instant WhatsApp confirmation</p>
                  <p>📱 Online check-in before arrival</p>
                  <p>🔒 Secured payment via Razorpay</p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
