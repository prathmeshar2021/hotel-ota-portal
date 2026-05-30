import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

/**
 * GET /api/rooms/[id]/availability?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD
 *
 * Returns { available: boolean, reason?: string }
 * Used by BookingForm for real-time availability feedback.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const checkInStr = searchParams.get("checkIn");
  const checkOutStr = searchParams.get("checkOut");

  if (!checkInStr || !checkOutStr) {
    return NextResponse.json({ available: false, reason: "Dates required" }, { status: 400 });
  }

  const checkIn = new Date(checkInStr);
  const checkOut = new Date(checkOutStr);

  if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime()) || checkOut <= checkIn) {
    return NextResponse.json({ available: false, reason: "Invalid dates" }, { status: 400 });
  }

  // 1. Room must exist, be active, and not blocked
  const room = await prisma.room.findUnique({
    where: { id, isActive: true },
    select: { id: true, status: true },
  });

  if (!room) {
    return NextResponse.json({ available: false, reason: "Room not found" });
  }

  if (room.status === "MAINTENANCE") {
    return NextResponse.json({ available: false, reason: "Room is currently unavailable" });
  }

  // 2. Check for overlapping confirmed / checked-in bookings
  const conflict = await prisma.booking.findFirst({
    where: {
      roomId: id,
      status: { in: ["CONFIRMED", "CHECKED_IN"] },
      checkInDate: { lt: checkOut },
      checkOutDate: { gt: checkIn },
    },
    select: { id: true },
  });

  if (conflict) {
    return NextResponse.json({ available: false, reason: "Room is already booked for these dates" });
  }

  return NextResponse.json({ available: true });
}
