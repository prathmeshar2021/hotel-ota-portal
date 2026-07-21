import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";
import { generateBookingRef, computeTotals, applyCoupon } from "@/lib/utils/booking";
import { REFUNDABLE_DEPOSIT } from "@/lib/utils/booking-calc";
import { gupshup } from "@/lib/services/gupshup";
import { format } from "date-fns";
import { getCategoryMeta } from "@/lib/utils/room-categories";

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
  depositCollected: z.number().min(0).default(0),
  depositMode: z.enum(["CASH", "ONLINE"]).optional(),
  couponCode: z.string().optional(),
  specialRequests: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.hotelId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "HOTEL_ADMIN" && session.user.role !== "HOTEL_STAFF" && session.user.role !== "SUPER_ADMIN") {
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

  // Validate coupon (if provided)
  let couponDiscount = 0;
  let couponId: string | undefined;

  if (d.couponCode) {
    const coupon = await prisma.coupon.findFirst({
      where: {
        code: d.couponCode.toUpperCase(),
        isActive: true,
        OR: [{ hotelId }, { hotelId: null }],
        AND: [
          { OR: [{ expiryDate: null }, { expiryDate: { gte: new Date() } }] },
        ],
      },
    });
    if (coupon) {
      const hasUseLimit = coupon.maxUses !== null;
      if (!hasUseLimit || coupon.usedCount < coupon.maxUses!) {
        couponDiscount = applyCoupon(coupon, room.basePrice * noOfNights);
        couponId = coupon.id;
      }
    }
  }

  // Compute totals — server always enforces REFUNDABLE_DEPOSIT
  const totals = computeTotals({
    roomRentPerNight: room.basePrice,
    noOfNights,
    couponDiscount,
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
      roomCategory: room.roomType,   // always set from physical room's type
      primaryGuestId: guestId,
      source: d.source,
      status: "CONFIRMED",
      checkInDate: checkIn,
      checkOutDate: checkOut,
      noOfNights,
      noOfPersons: d.noOfPersons,
      roomRent: totals.roomRent,
      couponDiscount,
      couponId: couponId ?? undefined,
      taxableAmount: totals.taxableAmount,
      cgst: totals.cgst,
      sgst: totals.sgst,
      totalAmount: totals.totalAmount,
      cashPaid: d.cashPaid,
      onlinePaid: d.onlinePaid,
      balanceDue,
      refundableDeposit: REFUNDABLE_DEPOSIT,
      depositCollected: d.depositCollected,
      depositMode: d.depositCollected > 0 ? (d.depositMode ?? "CASH") : undefined,
      specialRequests: d.specialRequests || undefined,
    },
  });

  // Increment coupon usage count
  if (couponId) {
    await prisma.coupon.update({
      where: { id: couponId },
      data: { usedCount: { increment: 1 } },
    });
  }

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

  // Send WhatsApp confirmation to guest (fire-and-forget)
  if (d.guestPhone) {
    const hotel = await prisma.hotel.findUnique({
      where: { id: hotelId },
      select: { name: true },
    });
    gupshup.sendBookingConfirmation(d.guestPhone, {
      guestName: d.guestName,
      bookingRef,
      hotelName: hotel?.name ?? "The Hotel",
      roomType: getCategoryMeta(room.roomType).displayName,
      checkIn: format(checkIn, "dd MMM yyyy"),
      checkOut: format(checkOut, "dd MMM yyyy"),
      totalAmount: totals.totalAmount,
      payAtHotel: true,
    }).catch((e) => console.error("[WhatsApp] Admin booking confirmation failed:", e));
  }

  return NextResponse.json({ bookingId: booking.id, bookingRef }, { status: 201 });
}
