import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";
import { generateBookingRef } from "@/lib/utils/booking";
import { computeTotals, computeTotalsForPrice, REFUNDABLE_DEPOSIT } from "@/lib/utils/booking-calc";

/**
 * POST → block a room in one step for a booking taken over the phone.
 *
 * The owner is on a call and has seconds, so every guest detail is optional:
 * whatever is known gets recorded, the room stops being bookable, and the rest
 * is filled in at check-in exactly like any other booking. Only the room and
 * dates are required, because without them there is nothing to block.
 */
const InstantSchema = z.object({
  roomId: z.string(),
  checkInDate: z.string(),
  checkOutDate: z.string(),
  noOfPersons: z.number().min(1).max(10).optional(),
  // Set when staff picked a returning guest from search — links to that exact
  // person instead of re-matching on phone (which they may not have on file).
  guestId: z.string().optional(),
  guestName: z.string().trim().max(120).optional(),
  guestPhone: z.string().optional(),
  // What the owner quoted, GST included. Omitted → the room's standard tariff.
  price: z.number().min(0).max(1_000_000).optional(),
  notes: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.hotelId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "HOTEL_ADMIN" && session.user.role !== "HOTEL_STAFF" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const hotelId = session.user.hotelId;
  const parsed = InstantSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid details" }, { status: 400 });
  }
  const d = parsed.data;

  const checkIn = new Date(d.checkInDate);
  const checkOut = new Date(d.checkOutDate);
  const noOfNights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / 86400000);
  if (!Number.isFinite(noOfNights) || noOfNights < 1) {
    return NextResponse.json({ error: "Check-out must be after check-in" }, { status: 400 });
  }

  const room = await prisma.room.findFirst({ where: { id: d.roomId, hotelId, isActive: true } });
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  // Same availability rule as every other booking path — an instant booking must
  // never double-book a room someone already holds.
  const conflict = await prisma.booking.findFirst({
    where: {
      roomId: d.roomId,
      status: { in: ["CONFIRMED", "CHECKED_IN"] },
      checkInDate: { lt: checkOut },
      checkOutDate: { gt: checkIn },
    },
    select: { bookingRef: true },
  });
  if (conflict) {
    return NextResponse.json(
      { error: `Room already booked for these dates (${conflict.bookingRef})` },
      { status: 409 }
    );
  }

  // Resolve the guest from whatever was given. With no phone we can't match an
  // existing person, so a placeholder is created and corrected at check-in.
  const phone = d.guestPhone ? d.guestPhone.replace(/\D/g, "").slice(-10) : "";
  const name = d.guestName?.trim() || `Guest — Room ${room.roomNumber}`;
  let guestId: string;

  // A guest chosen from search wins over phone matching; otherwise fall back to
  // the number, and only then create someone new.
  const existing = d.guestId
    ? await prisma.guest.findUnique({ where: { id: d.guestId }, select: { id: true, name: true, phone: true } })
    : phone.length === 10
      ? await prisma.guest.findUnique({ where: { phone }, select: { id: true, name: true, phone: true } })
      : null;

  if (existing) {
    guestId = existing.id;
    // Only overwrite a stored name when the owner actually typed one, and fill
    // in a number for a guest who had none — never clobber an existing one.
    const patch: { name?: string; phone?: string } = {};
    if (d.guestName?.trim()) patch.name = d.guestName.trim();
    if (!existing.phone && phone.length === 10) {
      const clash = await prisma.guest.findFirst({
        where: { phone, NOT: { id: existing.id } }, select: { id: true },
      });
      if (!clash) patch.phone = phone;
    }
    if (Object.keys(patch).length > 0) {
      await prisma.guest.update({ where: { id: existing.id }, data: patch });
    }
  } else {
    const created = await prisma.guest.create({
      data: { name, ...(phone.length === 10 ? { phone } : {}) },
    });
    guestId = created.id;
  }

  const totals = typeof d.price === "number"
    ? computeTotalsForPrice({ inclusiveTotal: d.price, noOfNights })
    : computeTotals({ roomRentPerNight: room.basePrice, noOfNights });

  const bookingRef = await generateBookingRef();
  const booking = await prisma.booking.create({
    data: {
      bookingRef,
      hotelId,
      roomId: room.id,
      roomCategory: room.roomType,
      primaryGuestId: guestId,
      source: "PHONE",
      status: "CONFIRMED",          // blocks the room straight away
      instantBooking: true,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      noOfNights,
      noOfPersons: d.noOfPersons ?? 1,
      roomRent: "roomRent" in totals ? totals.roomRent : totals.taxableAmount,
      taxableAmount: totals.taxableAmount,
      cgst: totals.cgst,
      sgst: totals.sgst,
      totalAmount: totals.totalAmount,
      // Nothing collected on the call — the whole amount is due at the hotel.
      balanceDue: totals.totalAmount,
      refundableDeposit: REFUNDABLE_DEPOSIT,
      guestPhone: phone.length === 10 ? phone : undefined,
      specialRequests: d.notes?.trim() || undefined,
    },
    select: { id: true, bookingRef: true, totalAmount: true },
  });

  return NextResponse.json(
    {
      bookingId: booking.id,
      bookingRef: booking.bookingRef,
      totalAmount: booking.totalAmount,
      message: `Room ${room.roomNumber} blocked · ${booking.bookingRef}`,
    },
    { status: 201 }
  );
}
