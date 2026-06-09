import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { generateBookingRef, computeTotals, getUniversalDiscount, resolveBookingDiscount } from "@/lib/utils/booking";
import { REFUNDABLE_DEPOSIT } from "@/lib/utils/booking-calc";
import { createOrder } from "@/lib/services/razorpay";
import { gupshup } from "@/lib/services/gupshup";
import { format } from "date-fns";
import { z } from "zod";

const CreateBookingSchema = z.object({
  hotelId: z.string(),
  roomCategory: z.string(), // category type e.g. "LUXURY_COTTAGE"
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
  const { CATEGORY_META, getCategoryMeta } = await import("@/lib/utils/room-categories");

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

  // Validate category
  const categoryMeta = getCategoryMeta(data.roomCategory);
  if (!categoryMeta || categoryMeta.totalRooms === 0) {
    return NextResponse.json({ error: "Invalid room category" }, { status: 400 });
  }
  void CATEGORY_META; // suppress unused import warning

  const checkIn = new Date(data.checkInDate);
  const checkOut = new Date(data.checkOutDate);

  if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
    return NextResponse.json({ error: "Please select valid check-in and check-out dates." }, { status: 400 });
  }

  const noOfNights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / 86400000);
  if (noOfNights < 1) {
    return NextResponse.json({ error: "Check-out must be after check-in." }, { status: 400 });
  }

  // Category-level availability check: count active bookings in this category for the date range
  const { resolveCategoryCapacity, inventoryHoldFilter } = await import("@/lib/utils/inventory");
  const activeInCategory = await prisma.booking.count({
    where: {
      hotelId: data.hotelId,
      roomCategory: data.roomCategory,
      ...inventoryHoldFilter(),
      checkInDate: { lt: checkOut },
      checkOutDate: { gt: checkIn },
    },
  });
  // Effective capacity honours any super-admin inventory overrides for the dates
  const capacity = await resolveCategoryCapacity(
    data.hotelId,
    data.roomCategory as never,
    checkIn,
    checkOut
  );
  if (activeInCategory >= capacity) {
    return NextResponse.json(
      { error: `${categoryMeta.displayName} is fully booked for the selected dates` },
      { status: 409 }
    );
  }

  // Resolve category price for the check-in date — honours any date-wise
  // override set by the super admin, else falls back to the base price.
  const { resolveCategoryPrice } = await import("@/lib/utils/pricing");
  const pricePerNight = await resolveCategoryPrice(
    data.hotelId,
    data.roomCategory as never,
    checkIn
  );

  // Resolve discounts: the always-on hotel-wide marketing discount + an optional
  // guest coupon (which either stacks on top of, or replaces, the universal one).
  const roomRentBeforeDiscount = pricePerNight * noOfNights;
  const universal = await getUniversalDiscount(data.hotelId);

  let guestCoupon: {
    id: string;
    discountType: string;
    discountValue: number;
    maxDiscount: number | null;
    minAmount: number;
    stacksOnUniversal: boolean;
  } | null = null;

  if (data.couponCode) {
    const coupon = await prisma.coupon.findFirst({
      where: {
        code: data.couponCode.toUpperCase(),
        isActive: true,
        isUniversal: false,
        AND: [
          { OR: [{ hotelId: data.hotelId }, { hotelId: null }] },
          { OR: [{ expiryDate: null }, { expiryDate: { gte: new Date() } }] },
        ],
      },
    });
    if (coupon) {
      guestCoupon = {
        id: coupon.id,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        maxDiscount: coupon.maxDiscount,
        minAmount: coupon.minAmount,
        stacksOnUniversal: coupon.stacksOnUniversal,
      };
    }
  }

  const breakdown = resolveBookingDiscount({
    roomRent: roomRentBeforeDiscount,
    universal,
    coupon: guestCoupon,
  });
  const couponDiscount = breakdown.totalDiscount;
  // Link the guest coupon when one was used; otherwise link the universal discount
  // so the saving is still traceable on the booking record.
  const couponId: string | undefined =
    guestCoupon?.id ?? (breakdown.universalDiscount > 0 ? universal?.id : undefined);

  const totals = computeTotals({
    roomRentPerNight: pricePerNight,
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
        roomCategory: data.roomCategory,
        roomId: null, // admin assigns physical room at check-in
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

    // Send WhatsApp confirmation (fire-and-forget)
    const guestPhone = (await prisma.guest.findUnique({
      where: { id: guestId },
      select: { phone: true, name: true },
    }));
    const hotelName = (await prisma.hotel.findUnique({
      where: { id: data.hotelId },
      select: { name: true },
    }))?.name ?? "The Hotel";

    if (guestPhone?.phone) {
      gupshup.sendBookingConfirmation(guestPhone.phone, {
        guestName: guestPhone.name,
        bookingRef,
        hotelName,
        roomType: categoryMeta.displayName,
        checkIn: format(checkIn, "dd MMM yyyy"),
        checkOut: format(checkOut, "dd MMM yyyy"),
        totalAmount: totals.totalAmount,
        payAtHotel: true,
      }).catch((e) => console.error("[WhatsApp] PAY_AT_HOTEL confirmation failed:", e));
    }

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
      roomCategory: data.roomCategory,
      roomId: null, // assigned by admin at check-in
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
      room: { select: { roomNumber: true, roomType: true, images: true } }, // nullable — may be null until assigned
      hotel: { select: { name: true, city: true, images: true } },
      payment: { select: { status: true, razorpayPaymentId: true } },
      onlineCheckin: { select: { completedAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(bookings);
}
