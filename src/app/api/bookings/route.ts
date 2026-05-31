import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { generateBookingRef, computeTotals, applyCoupon } from "@/lib/utils/booking";
import { REFUNDABLE_DEPOSIT } from "@/lib/utils/booking-calc";
import { createOrder } from "@/lib/services/razorpay";
import { z } from "zod";

const CreateBookingSchema = z.object({
  hotelId: z.string(),
  roomId: z.string(),
  checkInDate: z.string(),
  checkOutDate: z.string(),
  noOfPersons: z.number().min(1),
  refundableDeposit: z.number().default(0),
  couponCode: z.string().optional(),
  specialRequests: z.string().optional(),
  guestGstin: z.string().optional(),
  payMode: z.enum(["PAY_NOW", "PAY_AT_HOTEL"]).default("PAY_NOW"),
  // Guest details for new/unauthenticated bookings
  guestName: z.string().optional(),
  guestPhone: z.string().optional(),
  guestEmail: z.string().email().optional(),
});

export async function POST(req: NextRequest) {
  try {
  const session = await auth();
  const body = await req.json();
  const parsed = CreateBookingSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  // Resolve or create guest
  let guestId: string;
  if (session?.user.role === "CUSTOMER") {
    guestId = session.user.id;
  } else if (data.guestPhone) {
    // Guest checkout (no account) — find or create
    const existing = await prisma.guest.findUnique({
      where: { phone: data.guestPhone },
    });
    if (existing) {
      guestId = existing.id;
    } else {
      const created = await prisma.guest.create({
        data: {
          phone: data.guestPhone,
          name: data.guestName ?? "Guest",
          email: data.guestEmail,
        },
      });
      guestId = created.id;
    }
  } else {
    return NextResponse.json({ error: "Guest details required" }, { status: 400 });
  }

  // Validate room availability
  const room = await prisma.room.findUnique({
    where: { id: data.roomId, hotelId: data.hotelId, isActive: true },
  });
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  // Reject booking if admin has blocked the room
  if (room.status === "MAINTENANCE") {
    return NextResponse.json(
      { error: "This room is currently unavailable for booking" },
      { status: 409 }
    );
  }

  const checkIn = new Date(data.checkInDate);
  const checkOut = new Date(data.checkOutDate);

  if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
    return NextResponse.json({ error: "Please select valid check-in and check-out dates." }, { status: 400 });
  }

  const noOfNights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / 86400000);

  if (noOfNights < 1) {
    return NextResponse.json({ error: "Check-out must be after check-in." }, { status: 400 });
  }

  // Check for conflicting booking
  const conflict = await prisma.booking.findFirst({
    where: {
      roomId: data.roomId,
      status: { in: ["CONFIRMED", "CHECKED_IN"] },
      checkInDate: { lt: checkOut },
      checkOutDate: { gt: checkIn },
    },
  });
  if (conflict) {
    return NextResponse.json({ error: "Room not available for selected dates" }, { status: 409 });
  }

  // Apply coupon
  let couponId: string | undefined;
  let couponDiscount = 0;
  if (data.couponCode) {
    const coupon = await prisma.coupon.findFirst({
      where: {
        code: data.couponCode.toUpperCase(),
        isActive: true,
        AND: [
          { OR: [{ hotelId: data.hotelId }, { hotelId: null }] },
          { OR: [{ expiryDate: null }, { expiryDate: { gte: new Date() } }] },
        ],
      },
    });
    if (coupon) {
      couponId = coupon.id;
      couponDiscount = applyCoupon(coupon, room.basePrice * noOfNights);
    }
  }

  const totals = computeTotals({
    roomRentPerNight: room.basePrice,
    noOfNights,
    couponDiscount,
    refundableDeposit: REFUNDABLE_DEPOSIT, // always Rs 200, server-enforced
  });

  const bookingRef = await generateBookingRef();

  // ── PAY AT HOTEL ────────────────────────────────────────────────────────────
  if (data.payMode === "PAY_AT_HOTEL") {
    const booking = await prisma.booking.create({
      data: {
        bookingRef,
        hotelId: data.hotelId,
        roomId: data.roomId,
        primaryGuestId: guestId,
        source: "PORTAL",
        status: "CONFIRMED",          // immediately confirmed, no payment yet
        checkInDate: checkIn,
        checkOutDate: checkOut,
        noOfNights,
        noOfPersons: data.noOfPersons,
        roomRent: totals.roomRent,
        couponDiscount,
        refundableDeposit: REFUNDABLE_DEPOSIT,
        taxableAmount: totals.taxableAmount,
        cgst: totals.cgst,
        sgst: totals.sgst,
        totalAmount: totals.totalAmount,
        cashPaid: 0,
        onlinePaid: 0,
        balanceDue: totals.totalAmount, // full amount due at hotel
        couponId,
        specialRequests: data.specialRequests,
        guestGstin: data.guestGstin,
      },
    });

    // Create a pending CASH payment record so the admin can collect it at check-in
    await prisma.payment.create({
      data: {
        bookingId: booking.id,
        amount: totals.totalAmount,
        mode: "CASH",
        status: "pending",
        notes: `Pay-at-hotel booking created on ${new Date().toISOString()}`,
      },
    });

    return NextResponse.json({
      bookingId: booking.id,
      bookingRef,
      payAtHotel: true,
      amount: totals.totalAmount,
      totals,
    });
  }

  // ── PAY NOW (Razorpay) ──────────────────────────────────────────────────────
  const booking = await prisma.booking.create({
    data: {
      bookingRef,
      hotelId: data.hotelId,
      roomId: data.roomId,
      primaryGuestId: guestId,
      source: "PORTAL",
      status: "PENDING_PAYMENT",
      checkInDate: checkIn,
      checkOutDate: checkOut,
      noOfNights,
      noOfPersons: data.noOfPersons,
      roomRent: totals.roomRent,
      couponDiscount,
      refundableDeposit: REFUNDABLE_DEPOSIT,
      taxableAmount: totals.taxableAmount,
      cgst: totals.cgst,
      sgst: totals.sgst,
      totalAmount: totals.totalAmount,
      balanceDue: totals.totalAmount,
      couponId,
      specialRequests: data.specialRequests,
      guestGstin: data.guestGstin,
    },
  });

  // Create Razorpay order
  const razorpayOrder = await createOrder(
    Math.round(totals.totalAmount * 100),
    bookingRef
  );

  // Create payment record
  await prisma.payment.create({
    data: {
      bookingId: booking.id,
      razorpayOrderId: razorpayOrder.id,
      amount: totals.totalAmount,
      mode: "ONLINE",
      status: "pending",
    },
  });

  return NextResponse.json({
    bookingId: booking.id,
    bookingRef,
    razorpayOrderId: razorpayOrder.id,
    amount: totals.totalAmount,
    totals,
  });
  } catch (err) {
    console.error("[POST /api/bookings]", err);
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const bookings = await prisma.booking.findMany({
    where:
      session.user.role === "CUSTOMER"
        ? { primaryGuestId: session.user.id }
        : { hotelId: session.user.hotelId },
    include: {
      room: { select: { roomNumber: true, roomType: true, images: true } },
      hotel: { select: { name: true, city: true, images: true } },
      payment: { select: { status: true, razorpayPaymentId: true } },
      onlineCheckin: { select: { completedAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(bookings);
}
