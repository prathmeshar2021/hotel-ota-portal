import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

// GET — returns (or creates) the support thread for the logged-in customer.
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "CUSTOMER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Customers book against a single hotel on this platform — find their hotel.
  const latestBooking = await prisma.booking.findFirst({
    where: { primaryGuestId: session.user.id },
    select: { hotelId: true },
    orderBy: { createdAt: "desc" },
  });

  // If they've never booked, fall back to the first active hotel.
  const hotelId =
    latestBooking?.hotelId ??
    (await prisma.hotel.findFirst({ select: { id: true } }))?.id;

  if (!hotelId) {
    return NextResponse.json({ error: "No hotel found" }, { status: 404 });
  }

  const thread = await prisma.supportThread.upsert({
    where: { hotelId_guestId: { hotelId, guestId: session.user.id } },
    create: { hotelId, guestId: session.user.id },
    update: {},
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  // Mark all staff messages as read when the customer opens the thread.
  await prisma.supportMessage.updateMany({
    where: { threadId: thread.id, senderRole: "STAFF", isRead: false },
    data: { isRead: true },
  });

  return NextResponse.json(thread);
}
