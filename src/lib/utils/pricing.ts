import { prisma } from "@/lib/db/prisma";
import type { RoomType } from "@prisma/client";

/**
 * Resolve the nightly price for a room category on a given date.
 *
 * Pricing model:
 *   • Each Room of a category shares a `basePrice` (the default rate).
 *   • Date-specific overrides live in `RoomRate` (per room, date range).
 *
 * We treat pricing at the category (roomType) level: all rooms of a type are
 * priced identically, so we read the first active room's basePrice and look
 * for any RoomRate override covering `date` on that category's rooms.
 *
 * @returns nightly price, or `fallback` (default 2000) when no room exists.
 */
export async function resolveCategoryPrice(
  hotelId: string,
  roomType: RoomType,
  date?: Date,
  fallback = 2000
): Promise<number> {
  const rooms = await prisma.room.findMany({
    where: { hotelId, roomType, isActive: true },
    select: { id: true, basePrice: true },
  });
  if (rooms.length === 0) return fallback;

  const basePrice = rooms[0].basePrice;
  if (!date) return basePrice;

  // Normalize to start-of-day for range comparison
  const day = new Date(date);
  day.setHours(12, 0, 0, 0);

  const override = await prisma.roomRate.findFirst({
    where: {
      roomId: { in: rooms.map((r) => r.id) },
      fromDate: { lte: day },
      toDate: { gte: day },
    },
    orderBy: { fromDate: "desc" },
    select: { price: true },
  });

  return override?.price ?? basePrice;
}

/** Returns the base price for a category (no date override). */
export async function getCategoryBasePrice(
  hotelId: string,
  roomType: RoomType,
  fallback = 2000
): Promise<number> {
  const room = await prisma.room.findFirst({
    where: { hotelId, roomType, isActive: true },
    select: { basePrice: true },
  });
  return room?.basePrice ?? fallback;
}
