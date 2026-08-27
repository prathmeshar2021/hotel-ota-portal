import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma, prismaBase } from "@/lib/db/prisma";
import { z } from "zod";
import { format } from "date-fns";
import { getCategoryMeta } from "@/lib/utils/room-categories";
import { gupshup } from "@/lib/services/gupshup";
import { email } from "@/lib/services/email";
import { recordStaffAction } from "@/lib/services/staff-action";

/**
 * Delete a booking (archive).
 *
 * The row is kept and only stamped `deletedAt` — its payments and any GST
 * invoice are records the hotel is required to retain, and the invoice
 * numbering has to stay unbroken. Everything else behaves like a delete: the
 * central Prisma filter in lib/db/prisma hides archived bookings from every
 * read, so the booking leaves the lists, the room board, availability and the
 * accounts statement in one step.
 *
 * No owner OTP — staff need this to be quick at the desk. The owner is told
 * immediately instead, on WhatsApp and by email, because this is the one action
 * that makes a booking and its money disappear from the panel.
 */

const DeleteSchema = z.object({
  reason: z.string().trim().max(300).optional(),
});

function staffGuard(role?: string) {
  return role === "HOTEL_ADMIN" || role === "HOTEL_STAFF" || role === "SUPER_ADMIN";
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.hotelId || !staffGuard(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = DeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const booking = await prisma.booking.findFirst({
    where: { id, hotelId: session.user.hotelId },
    select: {
      id: true, bookingRef: true, status: true, roomId: true, roomCategory: true,
      checkInDate: true, checkOutDate: true, totalAmount: true,
      cashPaid: true, onlinePaid: true, depositCollected: true,
      primaryGuest: { select: { name: true, phone: true } },
      room: { select: { id: true, roomNumber: true } },
    },
  });

  if (!booking) {
    // Either it doesn't exist or it's already archived — same answer either way.
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const deletedByName = session.user.name || session.user.email || "Staff";
  const reason = parsed.data.reason?.trim() || undefined;

  await prisma.booking.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      deletedById: session.user.id,
      deletedByName,
      deleteReason: reason,
    },
  });

  // A guest standing in a room that no longer has a booking would leave the
  // room stuck on OCCUPIED, so release it for cleaning.
  if (booking.roomId && booking.status === "CHECKED_IN") {
    await prisma.room.update({
      where: { id: booking.roomId },
      data: { status: "CLEANING" },
    });
  }

  const amountPaid = +(booking.cashPaid + booking.onlinePaid).toFixed(2);
  const catLabel = getCategoryMeta(booking.roomCategory).displayName;
  const notif = {
    bookingRef: booking.bookingRef,
    guestName: booking.primaryGuest.name,
    guestPhone: booking.primaryGuest.phone ?? undefined,
    roomType: booking.room ? `${catLabel} #${booking.room.roomNumber}` : catLabel,
    checkIn: format(booking.checkInDate, "dd MMM yyyy"),
    checkOut: format(booking.checkOutDate, "dd MMM yyyy"),
    status: booking.status,
    totalAmount: booking.totalAmount,
    amountPaid,
    deletedBy: deletedByName,
    reason,
  };

  // Best-effort: a notification that fails must not undo the deletion or leave
  // the desk staring at an error for something that already worked.
  await Promise.allSettled([
    gupshup.sendOwnerBookingDeleted(notif),
    email.sendOwnerBookingDeleted(notif),
  ]);

  // Also lands in the activity log, so every sensitive desk action is reviewable
  // from one place rather than only in the owner's inbox.
  const actionId = await recordStaffAction({
    hotelId: session.user.hotelId,
    kind: "DELETE_BOOKING",
    summary: `Booking ${booking.bookingRef} was deleted from the panel.`,
    amount: amountPaid > 0 ? amountPaid : null,
    refType: "booking",
    refId: booking.id,
    bookingRef: booking.bookingRef,
    guestName: booking.primaryGuest.name,
    reason,
    actorId: session.user.id,
    actorName: deletedByName,
    actorRole: session.user.role ?? "HOTEL_STAFF",
    details: { statusWhenDeleted: booking.status, totalAmount: booking.totalAmount, amountPaid },
    notifyLines: amountPaid > 0
      ? [`₹${amountPaid.toLocaleString("en-IN")} had been paid — check if it needs refunding`]
      : [],
  });

  return NextResponse.json({
    success: true,
    // Lets the desk undo straight from the toast, while it is still on screen.
    actionId,
    bookingRef: booking.bookingRef,
    amountPaid,
    message:
      amountPaid > 0
        ? `${booking.bookingRef} deleted — ₹${amountPaid.toLocaleString("en-IN")} was paid on it, owner notified`
        : `${booking.bookingRef} deleted — owner notified`,
  });
}

/** Restore an archived booking. Super admin only — undoing a desk decision. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.hotelId || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  // Reads through the filtered client can't see archived rows, so this one
  // deliberately goes around it.
  const booking = await prismaBase.booking.findFirst({
    where: { id, hotelId: session.user.hotelId, deletedAt: { not: null } },
    select: { id: true, bookingRef: true },
  });
  if (!booking) {
    return NextResponse.json({ error: "No deleted booking with that id" }, { status: 404 });
  }

  await prismaBase.booking.update({
    where: { id },
    data: { deletedAt: null, deletedById: null, deletedByName: null, deleteReason: null },
  });

  return NextResponse.json({ success: true, message: `${booking.bookingRef} restored` });
}
