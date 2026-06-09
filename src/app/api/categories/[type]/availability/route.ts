/**
 * GET /api/categories/[type]/availability?hotelId=...&checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD
 *
 * Returns how many rooms of that category are available for the given dates.
 * { available: number, total: number, booked: number }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { CATEGORY_META, slugToCategory } from "@/lib/utils/room-categories";
import { resolveCategoryCapacity, inventoryHoldFilter } from "@/lib/utils/inventory";
import type { RoomType } from "@prisma/client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;
  const { searchParams } = new URL(req.url);
  const hotelId   = searchParams.get("hotelId");
  const checkInStr  = searchParams.get("checkIn");
  const checkOutStr = searchParams.get("checkOut");

  if (!hotelId || !checkInStr || !checkOutStr) {
    return NextResponse.json({ error: "hotelId, checkIn, checkOut required" }, { status: 400 });
  }

  const checkIn  = new Date(checkInStr);
  const checkOut = new Date(checkOutStr);

  if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime()) || checkOut <= checkIn) {
    return NextResponse.json({ error: "Invalid dates" }, { status: 400 });
  }

  // type param is a URL slug like "luxury-cottage" OR the raw enum value "LUXURY_COTTAGE"
  const categoryType = type.includes("-") ? slugToCategory(type) : type.toUpperCase();
  const meta = CATEGORY_META[categoryType as keyof typeof CATEGORY_META];
  if (!meta) {
    return NextResponse.json({ error: "Unknown category type" }, { status: 404 });
  }

  // Count active bookings for this category in the date range
  const booked = await prisma.booking.count({
    where: {
      hotelId,
      roomCategory: categoryType,
      ...inventoryHoldFilter(),
      checkInDate: { lt: checkOut },
      checkOutDate: { gt: checkIn },
    },
  });

  // Effective capacity honours any super-admin inventory overrides for the dates
  const capacity = await resolveCategoryCapacity(
    hotelId,
    categoryType as RoomType,
    checkIn,
    checkOut
  );

  const available = Math.max(0, capacity - booked);

  return NextResponse.json({
    categoryType,
    total: capacity,
    booked,
    available,
  });
}
