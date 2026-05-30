import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";
import { generateBookingRef, computeTotals } from "@/lib/utils/booking";

const AdminBookingSchema = z.object({
  roomId: z.string(),
  checkInDate: z.string(),
  checkOutDate: z.string(),
  noOfPersons: z.number().min(1).max(10),
  // Guest — either existing guestId or details to create
  guestId: z.string().optional(),
  guestName: z.string().min(2),
  guestPhone: z.string().regex(/^\d{10}$/),
  guestEmail: z.string().email().optional().or(z.literal("")),
  guestIdType: z.string().optional(),
  guestIdNumber: z.string().optional(),
  guestIdFrontUrl: z.string().url().optional().or(z.literal("")),
  guestIdBackUrl: z.string().url().optional().or(z.literal("")),
  // Travel details (optional, for same-day online check-in)
  comingFrom: z.string().optional(),
  goingTo: z.string().optional(),
  purpose: z.string().optional(),
  vehicleNo: z.string().optional(),
  // Payment
  source: z.enum(["WALK_IN", "PHONE", "OTHER"]),
  paymentMode: z.enum(["CASH", "ONLINE", "MIXED"]),
  cashPaid: z.number().min(0).default(0),
  onlinePaid: z.number().min(0).default(0),
  refundableDeposit: z.number().min(0).default(0),
  specialRequests: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.hotelId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "HOTEL_ADMIN" && session.user.role !== "HOTEL_STAFF") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const hotelId = session.user.hotelId;
  const body = await req.json();
  const parsed = AdminBookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const d = parsed.data;
  const checkIn = new Date(d.checkInDate);
  const checkOut = new Date(d.checkOutDate);
  const noOfNights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / 86400000);

  if (noOfNights < 1) return NextResponse.json({ error: "Invalid dates" }, { status: 400 });

  // Verify room belongs to this hotel
  const room = await prisma.room.findFirst({
    where: { id: d.roomId, hotelId, isActive: true },
  });
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  // Availability check
  const conflict = await prisma.booking.findFirst({
    where: {
      roomId: d.roomId,
      status: { in: ["CONFIRMED", "CHECKED_IN"] },
      checkInDate: { lt: checkOut },
      checkOutDate: { gt: checkIn },
    },
  });
  if (conflict) return NextResponse.json({ error: "Room not available for selected dates" }, { status: 409 });

  // Resolve guest — find by phone or use provided guestId
  let guestId = d.guestId;
  if (!guestId) {
    const existing = await prisma.guest.findUnique({ where: { phone: d.guestPhone } });
    if (existing) {
      guestId = existing.id;
      // Update ID info if not already set
      if (!existing.idNumber && d.guestIdNumber) {
        await prisma.guest.update({
          where: { id: existing.id },
          data: {
            idType: d.guestIdType as never ?? existing.idType,
            idNumber: d.guestIdNumber,
            idFrontUrl: d.guestIdFrontUrl || existing.idFrontUrl || undefined,
            idBackUrl: d.guestIdBackUrl || existing.idBackUrl || undefined,
          },
        });
      }
    } else {
      const created = await prisma.guest.create({
        data: {
          name: d.guestName,
          phone: d.guestPhone,
          email: d.guestEmail || undefined,
          idType: d.guestIdType as never ?? undefined,
          idNumber: d.guestIdNumber || undefined,
          idFrontUrl: d.guestIdFrontUrl || undefined,
          idBackUrl: d.guestIdBackUrl || undefined,
        },
      });
      guestId = created.id;
    }
  }

  // Compute totals
  const totals = computeTotals({
    roomRentPerNight: room.basePrice,
    noOfNights,
    refundableDeposit: d.refundableDeposit,
  });

  const totalPaid = d.cashPaid + d.onlinePaid;
  const balanceDue = Math.max(0, totals.totalAmount - totalPaid);

  const bookingRef = await generateBookingRef();

  // Create booking — CONFIRMED immediately (admin-side, payment handled at counter)
  const booking = await prisma.booking.create({
    data: {
      bookingRef,
      hotelId,
      roomId: d.roomId,
      primaryGuestId: guestId,
      source: d.source,
      status: "CONFIRMED",
      checkInDate: checkIn,
      checkOutDate: checkOut,
      noOfNights,
      noOfPersons: d.noOfPersons,
      roomRent: totals.roomRent,
      taxableAmount: totals.taxableAmount,
      cgst: totals.cgst,
      sgst: totals.sgst,
      totalAmount: totals.totalAmount,
      cashPaid: d.cashPaid,
      onlinePaid: d.onlinePaid,
      balanceDue,
      refundableDeposit: d.refundableDeposit,
      specialRequests: d.specialRequests || undefined,
    },
  });

  // Payment record (cash/online split is tracked on the Booking itself)
  await prisma.payment.create({
    data: {
      bookingId: booking.id,
      amount: totals.totalAmount,
      mode: d.paymentMode,
      status: balanceDue === 0 ? "paid" : "partial",
      notes: d.paymentMode === "MIXED"
        ? `Cash: ₹${d.cashPaid}, Online: ₹${d.onlinePaid}`
        : undefined,
    },
  });

  // If ID details provided, create online check-in record (pre-filled)
  const hasCheckinData = d.guestIdNumber || d.comingFrom || d.purpose;
  if (hasCheckinData) {
    await prisma.onlineCheckin.create({
      data: {
        bookingId: booking.id,
        guestId: guestId,
        comingFrom: d.comingFrom || undefined,
        goingTo: d.goingTo || undefined,
        purpose: d.purpose || undefined,
        vehicleNo: d.vehicleNo || undefined,
        completedAt: d.guestIdNumber ? new Date() : undefined,
      },
    });
    // Update guest ID details
    if (d.guestIdNumber) {
      await prisma.guest.update({
        where: { id: guestId },
        data: {
          idType: d.guestIdType as never ?? undefined,
          idNumber: d.guestIdNumber,
        },
      });
    }
  }

  return NextResponse.json({ bookingId: booking.id, bookingRef }, { status: 201 });
}
