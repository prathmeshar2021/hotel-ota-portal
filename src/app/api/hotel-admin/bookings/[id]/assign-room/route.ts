/**
 * PATCH /api/hotel-admin/bookings/[id]/assign-room
 * Assign or change the physical room for a booking.
 * Allowed for CONFIRMED and CHECKED_IN bookings.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { computeTotalsForPrice } from "@/lib/utils/booking-calc";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.hotelId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "HOTEL_ADMIN" && session.user.role !== "HOTEL_STAFF" && session.user.role !== "SUPER_ADMIN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    // customTotal: optional new GST-inclusive price, for a move that changes
    // what the guest pays (an upgrade, or a downgrade worth less).
    const { roomId, customTotal } = await req.json();

    if (!roomId) return NextResponse.json({ error: "roomId required" }, { status: 400 });

    // Fetch booking
    const booking = await prisma.booking.findFirst({
      where: { id, hotelId: session.user.hotelId },
      select: {
        id: true, status: true, roomId: true, roomCategory: true,
        checkInDate: true, checkOutDate: true, noOfNights: true,
        cashPaid: true, onlinePaid: true, totalAmount: true,
      },
    });
    if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    if (!["CONFIRMED", "CHECKED_IN"].includes(booking.status))
      return NextResponse.json({ error: "Can only assign room to CONFIRMED or CHECKED_IN bookings" }, { status: 400 });

    // Any active room in this hotel — a guest can be moved across categories
    // (upgrade, maintenance, a better fit), not only within the one booked.
    const room = await prisma.room.findFirst({
      where: { id: roomId, hotelId: session.user.hotelId, isActive: true },
    });
    if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

    // Check the new room is not occupied by another booking in the same date range
    const conflict = await prisma.booking.findFirst({
      where: {
        roomId,
        id: { not: id }, // exclude current booking
        status: { in: ["CONFIRMED", "CHECKED_IN"] },
        checkInDate: { lt: booking.checkOutDate },
        checkOutDate: { gt: booking.checkInDate },
      },
    });
    if (conflict) return NextResponse.json({ error: "Selected room is already booked for these dates" }, { status: 409 });

    // Free the previously assigned room (set back to AVAILABLE) if booking was CHECKED_IN
    if (booking.status === "CHECKED_IN" && booking.roomId && booking.roomId !== roomId) {
      await prisma.room.update({
        where: { id: booking.roomId },
        data: { status: "AVAILABLE" },
      });
    }

    // Re-price only when staff asked for it; moving rooms must never silently
    // change what a guest was quoted. The figure is GST-inclusive, so tax is
    // derived from it against the slabs exactly as it is at booking time.
    const newPrice = typeof customTotal === "number" && customTotal >= 0
      ? Math.round(customTotal)
      : null;
    const repriced = newPrice !== null && Math.abs(newPrice - booking.totalAmount) > 0.5;
    const totals = repriced
      ? computeTotalsForPrice({ inclusiveTotal: newPrice!, noOfNights: booking.noOfNights })
      : null;

    await prisma.booking.update({
      where: { id },
      data: {
        roomId,
        // Keep the recorded category honest when the guest moves room type.
        roomCategory: room.roomType,
        ...(totals
          ? {
              roomRent: room.basePrice * booking.noOfNights,
              taxableAmount: totals.taxableAmount,
              cgst: totals.cgst,
              sgst: totals.sgst,
              totalAmount: totals.totalAmount,
              balanceDue: Math.max(
                0,
                +(totals.totalAmount - booking.cashPaid - booking.onlinePaid).toFixed(2)
              ),
            }
          : {}),
      },
    });

    // If CHECKED_IN, mark new room as OCCUPIED
    if (booking.status === "CHECKED_IN") {
      await prisma.room.update({
        where: { id: roomId },
        data: { status: "OCCUPIED" },
      });
    }

    return NextResponse.json({
      success: true,
      message: totals
        ? `Room ${room.roomNumber} assigned · total now ₹${totals.totalAmount.toLocaleString("en-IN")}`
        : `Room ${room.roomNumber} assigned successfully`,
      roomNumber: room.roomNumber,
      totalAmount: totals?.totalAmount ?? booking.totalAmount,
    });
  } catch (err) {
    console.error("[Assign Room]", err);
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
