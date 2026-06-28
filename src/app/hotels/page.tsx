export const revalidate = 60;

import Navbar from "@/components/customer/Navbar";
import SearchBar from "@/components/customer/SearchBar";
import HotelCard from "@/components/customer/HotelCard";
import { prisma } from "@/lib/db/prisma";
import { discountedNightlyPrice, type UniversalDiscount } from "@/lib/utils/booking-calc";
import { MapPin, SlidersHorizontal } from "lucide-react";

/** Map of hotelId → active marketing discount, for struck-through "from" pricing. */
async function getUniversalDiscounts(
  hotelIds: string[]
): Promise<Record<string, UniversalDiscount>> {
  if (hotelIds.length === 0) return {};
  const rows = await prisma.coupon.findMany({
    where: {
      hotelId: { in: hotelIds },
      isUniversal: true,
      isActive: true,
      OR: [{ expiryDate: null }, { expiryDate: { gte: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
  });
  const map: Record<string, UniversalDiscount> = {};
  for (const c of rows) {
    if (c.hotelId && !map[c.hotelId]) {
      map[c.hotelId] = {
        id: c.id,
        code: c.code,
        label: c.label,
        discountType: c.discountType,
        discountValue: c.discountValue,
        maxDiscount: c.maxDiscount,
      };
    }
  }
  return map;
}

interface Props {
  searchParams: Promise<{
    city?: string;
    checkIn?: string;
    checkOut?: string;
    guests?: string;
    type?: string;
  }>;
}

async function getHotels(params: Awaited<Props["searchParams"]>) {
  const guests = parseInt(params.guests ?? "1");
  const checkIn = params.checkIn;
  const checkOut = params.checkOut;

  return prisma.hotel.findMany({
    where: {
      isActive: true,
      isApproved: true,
      ...(params.city && {
        OR: [
          { city: { contains: params.city, mode: "insensitive" } },
          { name: { contains: params.city, mode: "insensitive" } },
        ],
      }),
      rooms: {
        some: {
          isActive: true,
          capacity: { gte: guests },
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
      },
    },
    include: {
      rooms: {
        where: {
          isActive: true,
          capacity: { gte: guests },
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
        select: { basePrice: true, roomType: true, capacity: true },
        orderBy: { basePrice: "asc" },
      },
      reviews: { select: { rating: true } },
      _count: { select: { reviews: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export default async function HotelsPage({ searchParams }: Props) {
  const params = await searchParams;
  const hotels = await getHotels(params);
  const universalByHotel = await getUniversalDiscounts(hotels.map((h) => h.id));

  return (
    <div className="min-h-screen bg-[#071209]">
      <Navbar />

      {/* Search bar */}
      <div className="bg-[#0D1B0E] border-b border-white/5 py-5 px-4">
        <div className="max-w-7xl mx-auto">
          <SearchBar
            variant="compact"
            defaultCity={params.city ?? ""}
            defaultCheckIn={params.checkIn ?? ""}
            defaultCheckOut={params.checkOut ?? ""}
            defaultGuests={parseInt(params.guests ?? "2")}
          />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Results header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">
              {params.city ? (
                <span className="flex items-center gap-1">
                  <MapPin className="w-5 h-5 text-amber-400" />
                  Hotels in {params.city}
                </span>
              ) : (
                "All Hotels & Resorts"
              )}
            </h1>
            <p className="text-sm text-white/40 mt-0.5">
              {hotels.length} {hotels.length === 1 ? "property" : "properties"} found
              {params.checkIn && params.checkOut && (
                <> · {params.checkIn} → {params.checkOut}</>
              )}
            </p>
          </div>
          <button className="glass-badge flex items-center gap-2 text-sm text-white/55 rounded-lg px-3 py-2 hover:text-white transition-colors">
            <SlidersHorizontal className="w-4 h-4" />
            Filters
          </button>
        </div>

        {/* Hotel list */}
        {hotels.length === 0 ? (
          <div className="text-center py-24 text-white/40">
            <div className="text-5xl mb-4">🏨</div>
            <p className="text-lg font-medium text-white/60">No hotels found</p>
            <p className="text-sm mt-1">Try a different city or date range.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {hotels.map((hotel) => {
              const avgRating =
                hotel.reviews.length > 0
                  ? hotel.reviews.reduce((s, r) => s + r.rating, 0) / hotel.reviews.length
                  : null;
              const originalMinPrice = hotel.rooms[0]?.basePrice ?? null;
              const universal = universalByHotel[hotel.id] ?? null;
              const minPrice =
                originalMinPrice != null
                  ? discountedNightlyPrice(universal, originalMinPrice)
                  : null;

              return (
                <HotelCard
                  key={hotel.id}
                  hotel={{
                    id: hotel.id,
                    name: hotel.name,
                    slug: hotel.slug,
                    city: hotel.city,
                    state: hotel.state,
                    images: hotel.images,
                    amenities: hotel.amenities,
                    starRating: hotel.starRating,
                    avgRating,
                    reviewCount: hotel._count.reviews,
                    minPrice,
                    originalMinPrice,
                    availableRooms: hotel.rooms.length,
                  }}
                  searchParams={{
                    checkIn: params.checkIn,
                    checkOut: params.checkOut,
                    guests: params.guests,
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
