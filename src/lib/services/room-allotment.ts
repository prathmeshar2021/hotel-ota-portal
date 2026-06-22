import { prisma } from "@/lib/db/prisma";

/**
 * Auto-allots the best available physical room for a booking.
 *
 * Algorithm (in priority order):
 *   1. Must be active, non-maintenance, and in the correct category.
 *   2. Must have no overlapping CONFIRMED / CHECKED_IN booking for the date range.
 *   3. Among free rooms, prefer the one with the fewest upcoming confirmed bookings
 *      (rotates room usage evenly, reducing wear on popular rooms).
 *   4. Tie-break: natural sort on room number (Room 1 before Room 2 before Room 10).
 *
 * When a group of rooms is being assigned at once, pass previously allotted IDs
 * via `excludeRoomIds` so sibling bookings in the same cart don't collide.
 *
 * @returns the room ID to assign, or null if the category is fully booked.
 */
export async function autoAllotRoom(params: {
  hotelId: string;
  roomCategory: string;
  checkInDate: Date;
  checkOutDate: Date;
  /** The booking being allotted — excluded from the conflict check so re-running
   *  this for an already-assigned booking doesn't block itself. */
  excludeBookingId?: string;
  /** Room IDs already assigned to sibling bookings in the same cart session. */
  excludeRoomIds?: string[];
}): Promise<string | null> {
  const { hotelId, roomCategory, checkInDate, checkOutDate, excludeBookingId, excludeRoomIds = [] } = params;

  const rooms = await prisma.room.findMany({
    where: {
      hotelId,
      roomType: roomCategory as never,
      isActive: true,
      status: { not: "MAINTENANCE" },
      ...(excludeRoomIds.length > 0 ? { id: { notIn: excludeRoomIds } } : {}),
      assignedBookings: {
        none: {
          ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
          status: { in: ["CONFIRMED", "CHECKED_IN"] },
          checkInDate: { lt: checkOutDate },
          checkOutDate: { gt: checkInDate },
        },
      },
    },
    select: {
      id: true,
      roomNumber: true,
      _count: {
        select: {
          assignedBookings: {
            where: {
              status: { in: ["CONFIRMED", "CHECKED_IN"] },
              checkOutDate: { gt: new Date() },
            },
          },
        },
      },
    },
  });

  if (rooms.length === 0) return null;

  // Sort: least loaded first, then natural room-number order
  rooms.sort((a, b) => {
    const diff = a._count.assignedBookings - b._count.assignedBookings;
    if (diff !== 0) return diff;
    return a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true, sensitivity: "base" });
  });

  return rooms[0].id;
}

/**
 * Assigns rooms to every booking in a group (or a single booking).
 * Skips bookings that already have a room assigned.
 *
 * Returns the number of rooms successfully allotted.
 */
export async function autoAllotGroup(params: {
  hotelId: string;
  bookings: Array<{
    id: string;
    roomCategory: string;
    checkInDate: Date;
    checkOutDate: Date;
    roomId: string | null;
  }>;
}): Promise<number> {
  const { hotelId, bookings } = params;
  const assignedRoomIds: string[] = [];
  let count = 0;

  for (const b of bookings) {
    if (b.roomId) {
      // already assigned — track it so siblings don't collide
      assignedRoomIds.push(b.roomId);
      continue;
    }
    const roomId = await autoAllotRoom({
      hotelId,
      roomCategory: b.roomCategory,
      checkInDate: b.checkInDate,
      checkOutDate: b.checkOutDate,
      excludeBookingId: b.id,
      excludeRoomIds: assignedRoomIds,
    });
    if (roomId) {
      await prisma.booking.update({ where: { id: b.id }, data: { roomId } });
      assignedRoomIds.push(roomId);
      count++;
    }
  }

  return count;
}
