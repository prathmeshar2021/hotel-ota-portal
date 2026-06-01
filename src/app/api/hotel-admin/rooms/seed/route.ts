/**
 * POST /api/hotel-admin/rooms/seed
 * Admin-only: creates / upserts all 15 physical rooms for the hotel.
 * Safe to call multiple times — uses upsert.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

const ROOM_DEFINITIONS = [
  // Non-AC Rooms
  { roomNumber: "101", roomType: "NON_AC_ROOM", basePrice: 1500, capacity: 2, floor: 1 },
  { roomNumber: "102", roomType: "NON_AC_ROOM", basePrice: 1500, capacity: 2, floor: 1 },
  { roomNumber: "103", roomType: "NON_AC_ROOM", basePrice: 1500, capacity: 2, floor: 1 },
  { roomNumber: "104", roomType: "NON_AC_ROOM", basePrice: 1500, capacity: 2, floor: 1 },
  // Premium AC Rooms
  { roomNumber: "201", roomType: "PREMIUM_AC_ROOM", basePrice: 2500, capacity: 2, floor: 2 },
  { roomNumber: "202", roomType: "PREMIUM_AC_ROOM", basePrice: 2500, capacity: 2, floor: 2 },
  { roomNumber: "203", roomType: "PREMIUM_AC_ROOM", basePrice: 2500, capacity: 2, floor: 2 },
  // Cave Theme AC Rooms
  { roomNumber: "Cave1", roomType: "CAVE_AC_ROOM", basePrice: 3000, capacity: 2, floor: 1 },
  { roomNumber: "Cave2", roomType: "CAVE_AC_ROOM", basePrice: 3000, capacity: 2, floor: 1 },
  // Cottages
  { roomNumber: "Cottage1", roomType: "LUXURY_COTTAGE",   basePrice: 4500, capacity: 4, floor: 0 },
  { roomNumber: "Cottage2", roomType: "THEATRE_COTTAGE",  basePrice: 5000, capacity: 4, floor: 0 },
  { roomNumber: "Cottage3", roomType: "PINEWOOD_COTTAGE", basePrice: 3500, capacity: 4, floor: 0 },
  { roomNumber: "Cottage4", roomType: "PINEWOOD_COTTAGE", basePrice: 3500, capacity: 4, floor: 0 },
  { roomNumber: "Cottage5", roomType: "LUXURY_COTTAGE",   basePrice: 4500, capacity: 4, floor: 0 },
  { roomNumber: "Cottage6", roomType: "LUXURY_COTTAGE",   basePrice: 4500, capacity: 4, floor: 0 },
] as const;

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.hotelId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "HOTEL_ADMIN" && session.user.role !== "SUPER_ADMIN")
      return NextResponse.json({ error: "Admin only" }, { status: 403 });

    const hotelId = session.user.hotelId;

    const results = await Promise.all(
      ROOM_DEFINITIONS.map((def) =>
        prisma.room.upsert({
          where: { hotelId_roomNumber: { hotelId, roomNumber: def.roomNumber } },
          // Only update the type — preserve whatever price/capacity the admin has already set
          update: { roomType: def.roomType as never },
          create: {
            hotelId,
            roomNumber: def.roomNumber,
            roomType: def.roomType as never,
            basePrice: def.basePrice,
            capacity: def.capacity,
            floor: def.floor,
            isActive: true,
            status: "AVAILABLE",
            amenities: [],
            images: [],
          },
        })
      )
    );

    return NextResponse.json({
      success: true,
      message: `${results.length} rooms created/updated`,
      rooms: results.map((r) => ({ roomNumber: r.roomNumber, roomType: r.roomType, id: r.id })),
    });
  } catch (err) {
    console.error("[Rooms/Seed]", err);
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
