import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const { searchParams } = new URL(req.url);
  const checkIn = searchParams.get("checkIn");
  const checkOut = searchParams.get("checkOut");

  const hotel = await prisma.hotel.findUnique({
    where: { slug, isActive: true },
    include: {
      rooms: {
        where: {
          isActive: true,
          status: { not: "MAINTENANCE" }, // blocked rooms are never shown to customers
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
        include: { rates: true },
        orderBy: { basePrice: "asc" },
      },
      reviews: {
        where: { isVisible: true },
        include: { guest: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      _count: { select: { reviews: true } },
    },
  });

  if (!hotel) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const avgRating =
    hotel.reviews.length > 0
      ? hotel.reviews.reduce((s, r) => s + r.rating, 0) / hotel.reviews.length
      : null;

  return NextResponse.json({ ...hotel, avgRating });
}
