import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING_PAYMENT: ["CONFIRMED", "CANCELLED"],
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
  if (session.user.role !== "HOTEL_ADMIN" && session.user.role !== "HOTEL_STAFF" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { status: newStatus, depositRefunded, depositDeducted, depositNotes } = body;

  // Verify booking belongs to this hotel
  const booking = await prisma.booking.findFirst({
    where: { id, hotelId: session.user.hotelId },
    select: { id: true, status: true, roomId: true, refundableDeposit: true },
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
    // Only mark room occupied if one has been assigned
    if (booking.roomId) {
      await prisma.room.update({
        where: { id: booking.roomId },
        data: { status: "OCCUPIED" },
      });
    }
  }

  if (newStatus === "CHECKED_OUT") {
    updateData.checkedOutAt = now;
    // Deposit decision — must be provided by the frontend
    updateData.depositRefunded = depositRefunded ?? true;
    updateData.depositDeducted = typeof depositDeducted === "number" ? depositDeducted : 0;
    if (depositNotes) updateData.depositNotes = depositNotes;
    // Free up the room if one was assigned
    if (booking.roomId) {
      await prisma.room.update({
        where: { id: booking.roomId },
        data: { status: "CLEANING" },
      });
    }
  }

  await prisma.booking.update({
    where: { id },
    data: updateData,
  });

  // Issue the GST tax invoice at check-out so every completed stay gets a
  // sequential invoice number automatically. Idempotent; never blocks check-out.
  // (Delivery stays manual — the invoice is only sent on WhatsApp when staff press Send.)
  if (newStatus === "CHECKED_OUT") {
    try {
      const { ensureGstInvoice } = await import("@/lib/services/invoice");
      await ensureGstInvoice(id);
    } catch (e) {
      console.error("[status] auto-issue invoice failed:", e);
    }
  }

  const messages: Record<string, string> = {
    CONFIRMED: "Booking confirmed",
    CHECKED_IN: "Guest checked in successfully",
    CHECKED_OUT: "Guest checked out. Room marked for cleaning.",
    NO_SHOW: "Booking marked as No Show",
    CANCELLED: "Booking cancelled",
  };

  return NextResponse.json({ success: true, message: messages[newStatus] ?? "Status updated" });
}
