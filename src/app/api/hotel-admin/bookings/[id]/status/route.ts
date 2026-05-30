import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

const VALID_TRANSITIONS: Record<string, string[]> = {
  CONFIRMED: ["CHECKED_IN", "NO_SHOW", "CANCELLED"],
  CHECKED_IN: ["CHECKED_OUT"],
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.hotelId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "HOTEL_ADMIN" && session.user.role !== "HOTEL_STAFF") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { status: newStatus } = await req.json();

  // Verify booking belongs to this hotel
  const booking = await prisma.booking.findFirst({
    where: { id, hotelId: session.user.hotelId },
    select: { id: true, status: true, roomId: true },
  });

  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const allowed = VALID_TRANSITIONS[booking.status] ?? [];
  if (!allowed.includes(newStatus)) {
    return NextResponse.json(
      { error: `Cannot transition from ${booking.status} to ${newStatus}` },
      { status: 400 }
    );
  }

  const now = new Date();
  const updateData: Record<string, unknown> = { status: newStatus };

  if (newStatus === "CHECKED_IN") {
    updateData.checkedInAt = now;
    // Update room status to OCCUPIED
    await prisma.room.update({
      where: { id: booking.roomId },
      data: { status: "OCCUPIED" },
    });
  }

  if (newStatus === "CHECKED_OUT") {
    updateData.checkedOutAt = now;
    // Free up the room
    await prisma.room.update({
      where: { id: booking.roomId },
      data: { status: "CLEANING" }, // Needs cleaning after checkout
    });
  }

  await prisma.booking.update({
    where: { id },
    data: updateData,
  });

  const messages: Record<string, string> = {
    CHECKED_IN: "Guest checked in successfully",
    CHECKED_OUT: "Guest checked out. Room marked for cleaning.",
    NO_SHOW: "Booking marked as No Show",
    CANCELLED: "Booking cancelled",
  };

  return NextResponse.json({ success: true, message: messages[newStatus] ?? "Status updated" });
}
