import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { ensureRoomAssigned, isConsentConfirmed, CHECKIN_GATE_MESSAGES } from "@/lib/services/checkin-gate";

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
  const { status: newStatus, settlement } = body;

  // Verify booking belongs to this hotel
  const booking = await prisma.booking.findFirst({
    where: { id, hotelId: session.user.hotelId },
    select: {
      id: true, status: true, roomId: true, checkInDate: true, checkOutDate: true,
      hotelId: true, roomCategory: true,
      depositCollected: true, additionalCharges: true, balanceDue: true,
      cashPaid: true, onlinePaid: true,
    },
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

  // A booking can only be a no-show once its stay has started — you can't
  // no-show a future reservation. Compare against the start of the check-in day.
  if (newStatus === "NO_SHOW") {
    const checkInDay = new Date(booking.checkInDate);
    checkInDay.setHours(0, 0, 0, 0);
    if (Date.now() < checkInDay.getTime()) {
      return NextResponse.json(
        { error: "Can't mark No Show before the check-in date." },
        { status: 400 }
      );
    }
  }

  const now = new Date();
  const updateData: Record<string, unknown> = { status: newStatus };

  if (newStatus === "CHECKED_IN") {
    // Gate: a stay cannot be checked in until (1) a physical room is assigned
    // (auto-allot as a fallback) and (2) the guest's consent is confirmed.
    const roomId = await ensureRoomAssigned({
      id: booking.id,
      hotelId: booking.hotelId,
      roomId: booking.roomId,
      roomCategory: booking.roomCategory,
      checkInDate: booking.checkInDate,
      checkOutDate: booking.checkOutDate,
    });
    if (!roomId) {
      return NextResponse.json({ error: CHECKIN_GATE_MESSAGES.noRoom }, { status: 409 });
    }
    if (!(await isConsentConfirmed(booking.id))) {
      return NextResponse.json({ error: CHECKIN_GATE_MESSAGES.consent }, { status: 409 });
    }

    updateData.checkedInAt = now;
    await prisma.room.update({
      where: { id: roomId },
      data: { status: "OCCUPIED" },
    });
  }

  if (newStatus === "CHECKED_OUT") {
    updateData.checkedOutAt = now;

    // Final settlement (server-authoritative): the deposit held nets against
    // everything still owed (unpaid room balance + extra charges).
    //   net = depositCollected − (balanceDue + additionalCharges)
    //   net ≥ 0 → refund net to guest;  net < 0 → collect −net from guest.
    const owed = +(booking.balanceDue + booking.additionalCharges).toFixed(2);
    const net = +(booking.depositCollected - owed).toFixed(2);
    const refund = Math.max(0, net);
    const collect = Math.max(0, -net);
    const depositUsed = Math.min(booking.depositCollected, owed); // deposit applied to what was owed

    updateData.balanceDue = 0; // everything is settled at checkout
    updateData.depositDeducted = depositUsed;
    updateData.depositRefunded = refund > 0;

    // Record any amount collected now (excess beyond the deposit) as a payment.
    if (collect > 0) {
      const mode = settlement?.collectMode === "ONLINE" ? "ONLINE" : "CASH";
      if (mode === "ONLINE") updateData.onlinePaid = booking.onlinePaid + collect;
      else updateData.cashPaid = booking.cashPaid + collect;
    }

    const summary = refund > 0 ? `Refunded ₹${refund} deposit` : collect > 0 ? `Collected ₹${collect} at checkout` : "Settled — no refund/collection";
    updateData.depositNotes = settlement?.notes ? `${summary} — ${settlement.notes}` : summary;

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
