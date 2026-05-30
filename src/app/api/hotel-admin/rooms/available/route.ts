import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

// GET /api/hotel-admin/rooms/available?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.hotelId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "HOTEL_ADMIN" && session.user.role !== "HOTEL_STAFF") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const checkIn = req.nextUrl.searchParams.get("checkIn");
  const checkOut = req.nextUrl.searchParams.get("checkOut");

  if (!checkIn || !checkOut) {
    return NextResponse.json({ error: "checkIn and checkOut required" }, { status: 400 });
  }

  const checkInDate = new Date(checkIn);
  const checkOutDate = new Date(checkOut);

  if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
    return NextResponse.json({ error: "Invalid dates" }, { status: 400 });
  }
  if (checkOutDate <= checkInDate) {
    return NextResponse.json({ error: "Check-out must be after check-in" }, { status: 400 });
  }

  const rooms = await prisma.room.findMany({
    where: {
      hotelId: session.user.hotelId,
      isActive: true,
      status: { not: "MAINTENANCE" },
      bookings: {
        none: {
          status: { in: ["CONFIRMED", "CHECKED_IN"] },
          checkInDate: { lt: checkOutDate },
          checkOutDate: { gt: checkInDate },
        },
      },
    },
    select: {
      id: true,
      roomNumber: true,
      roomType: true,
      capacity: true,
      basePrice: true,
      description: true,
      images: true,
      amenities: true,
      status: true,
    },
    orderBy: [{ roomType: "asc" }, { basePrice: "asc" }],
  });

  return NextResponse.json(rooms);
}
