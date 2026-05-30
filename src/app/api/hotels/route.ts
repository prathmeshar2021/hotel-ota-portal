import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const city = searchParams.get("city");
  const checkIn = searchParams.get("checkIn");
  const checkOut = searchParams.get("checkOut");
  const guests = parseInt(searchParams.get("guests") ?? "1");

  const hotels = await prisma.hotel.findMany({
    where: {
      isActive: true,
      isApproved: true,
      ...(city && { city: { contains: city, mode: "insensitive" } }),
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
      },
      reviews: { select: { rating: true } },
      _count: { select: { reviews: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const result = hotels.map((h) => {
    const avgRating =
      h.reviews.length > 0
        ? h.reviews.reduce((s, r) => s + r.rating, 0) / h.reviews.length
        : null;
    const minPrice =
      h.rooms.length > 0 ? Math.min(...h.rooms.map((r) => r.basePrice)) : null;

    return {
      id: h.id,
      name: h.name,
      slug: h.slug,
      city: h.city,
      state: h.state,
      starRating: h.starRating,
      images: h.images,
      amenities: h.amenities,
      description: h.description,
      avgRating,
      reviewCount: h._count.reviews,
      minPrice,
      availableRooms: h.rooms.length,
    };
  });

  return NextResponse.json(result);
}
