import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// AppSheet fires this webhook when staff creates a walk-in booking
// This lets the portal mark the room unavailable for those dates
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-webhook-secret");
  if (secret !== process.env.APPSHEET_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  // AppSheet sends the row data from Table 2 (Bookings)
  const {
    event,        // "add" | "update" | "delete"
    bookingNo,
    roomNumber,
    checkInDate,
    checkOutDate,
    status,
    hotelSlug,
  } = body;

  // Find hotel and room
  const hotel = await prisma.hotel.findUnique({ where: { slug: hotelSlug ?? "the-urban-escape" } });
  if (!hotel) return NextResponse.json({ ok: true }); // ignore if hotel not found

  const room = await prisma.room.findFirst({
    where: { hotelId: hotel.id, roomNumber: String(roomNumber) },
  });
  if (!room) return NextResponse.json({ ok: true });

  if (event === "add" || event === "update") {
    // Upsert a shadow booking to block availability
    await prisma.booking.upsert({
      where: { bookingRef: `AS-${bookingNo}` },
      create: {
        bookingRef: `AS-${bookingNo}`,
        hotelId: hotel.id,
        roomId: room.id,
        primaryGuestId: hotel.id, // placeholder — walk-ins don't have portal guest accounts
        source: "WALK_IN",
        status: status === "CheckedIn" ? "CHECKED_IN" : "CONFIRMED",
        checkInDate: new Date(checkInDate),
        checkOutDate: new Date(checkOutDate),
        noOfNights: 1, // approximate — corrected below
        noOfPersons: 1,
        roomRent: 0,
        totalAmount: 0,
        appsheetBookingNo: Number(bookingNo),
      },
      update: {
        status: status === "CheckedIn" ? "CHECKED_IN"
              : status === "CheckedOUT" ? "CHECKED_OUT"
              : "CONFIRMED",
        checkInDate: new Date(checkInDate),
        checkOutDate: new Date(checkOutDate),
      },
    });
  }

  if (event === "delete") {
    await prisma.booking.deleteMany({
      where: { bookingRef: `AS-${bookingNo}` },
    });
  }

  await prisma.appsheetSyncLog.create({
    data: {
      hotelId: hotel.id,
      action: `receive_walkin_${event}`,
      status: "SUCCESS",
      payload: body,
      syncedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
