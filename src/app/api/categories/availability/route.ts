import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { CATEGORY_META, CATEGORY_IMAGES, categoryToSlug, type RoomCategoryType } from "@/lib/utils/room-categories";
import { getCategoryCapacities, inventoryHoldFilter } from "@/lib/utils/inventory";
import { getUniversalDiscount } from "@/lib/utils/booking";
import { discountedNightlyPrice } from "@/lib/utils/booking-calc";

/**
 * GET /api/categories/availability?hotelId=&checkIn=&checkOut=
 * Availability + pricing for every configured room category over the dates.
 * Used by the cart to gate quantities and offer other available room types.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const hotelId = searchParams.get("hotelId");
  const checkInStr = searchParams.get("checkIn");
  const checkOutStr = searchParams.get("checkOut");
  if (!hotelId || !checkInStr || !checkOutStr) {
    return NextResponse.json({ error: "hotelId, checkIn, checkOut required" }, { status: 400 });
  }
  const checkIn = new Date(checkInStr);
  const checkOut = new Date(checkOutStr);
  if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime()) || checkOut <= checkIn) {
    return NextResponse.json({ error: "Invalid dates" }, { status: 400 });
  }

  const rooms = await prisma.room.findMany({
    where: { hotelId, isActive: true },
    select: { roomType: true, basePrice: true },
  });
  const basePrice: Record<string, number> = {};
  for (const r of rooms) if (!(r.roomType in basePrice)) basePrice[r.roomType] = r.basePrice;

  const [universal, capacities, booked] = await Promise.all([
    getUniversalDiscount(hotelId),
    getCategoryCapacities(hotelId, checkIn, checkOut),
    prisma.booking.groupBy({
      by: ["roomCategory"],
      where: { hotelId, ...inventoryHoldFilter(), checkInDate: { lt: checkOut }, checkOutDate: { gt: checkIn } },
      _count: { id: true },
    }),
  ]);
  const bookedMap = Object.fromEntries(booked.map((b) => [b.roomCategory, b._count.id]));

  const categories = (Object.keys(CATEGORY_META) as RoomCategoryType[])
    .filter((type) => (basePrice[type] ?? 0) > 0)
    .map((type) => {
      const meta = CATEGORY_META[type];
      const cap = capacities[type] ?? meta.totalRooms;
      const base = basePrice[type];
      return {
        type,
        slug: categoryToSlug(type),
        displayName: meta.displayName,
        capacity: meta.maxGuests,
        available: Math.max(0, cap - (bookedMap[type] ?? 0)),
        originalPricePerNight: base,
        pricePerNight: discountedNightlyPrice(universal, base),
        image: CATEGORY_IMAGES[type]?.[0] ?? null,
        accentColor: meta.accentColor,
      };
    });

  return NextResponse.json({ categories });
}
