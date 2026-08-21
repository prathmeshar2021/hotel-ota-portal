import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { resolvePayMode } from "@/lib/services/pay-mode-guard";
import { auth } from "@/lib/auth/auth";
import { generateBookingRef } from "@/lib/utils/booking";
import { REFUNDABLE_DEPOSIT, PARTIAL_PAYMENT_AMOUNT } from "@/lib/utils/booking-calc";
import { quoteBooking } from "@/lib/services/quote";
import { createOrder } from "@/lib/services/razorpay";
import { enforceRateLimit } from "@/lib/ratelimit";
import { gupshup } from "@/lib/services/gupshup";
import { email } from "@/lib/services/email";
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
  payMode: z.enum(["PAY_NOW", "PAY_PARTIAL", "PAY_AT_HOTEL"]).default("PAY_NOW"),
  // Guest details for new/unauthenticated bookings
  guestName: z.string().optional(),
  guestPhone: z.string().optional(),
  guestEmail: z.string().email().optional(),
});

export async function POST(req: NextRequest) {
  // Public guest checkout — rate limit to prevent booking/order spam.
  const limited = await enforceRateLimit(req, { name: "booking-create", limit: 8, windowSec: 60 });
  if (limited) return limited;

  try {
  const session = await auth();
  const body = await req.json();
  const parsed = CreateBookingSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const { CATEGORY_META, getCategoryMeta } = await import("@/lib/utils/room-categories");

  // Resolve or create guest, keeping one account per person across login methods.
  const { linkGuestContact, normalizeEmail } = await import("@/lib/utils/guest");
  let guestId: string;
  if (session?.user.role === "CUSTOMER") {
    guestId = session.user.id;
  } else if (data.guestPhone) {
    // Guest checkout (no account) — reuse an existing account by phone, then by
    // email (so a Google-created account isn't duplicated), else create one.
    let existing = await prisma.guest.findUnique({ where: { phone: data.guestPhone } });
    if (!existing) {
      const email = normalizeEmail(data.guestEmail);
      if (email) existing = await prisma.guest.findUnique({ where: { email } });
    }
    if (existing) {
      guestId = existing.id;
    } else {
      const created = await prisma.guest.create({
        data: {
          phone: data.guestPhone,
          name: data.guestName ?? "Guest",
          email: normalizeEmail(data.guestEmail),
        },
      });
      guestId = created.id;
    }
  } else {
    return NextResponse.json({ error: "Guest details required" }, { status: 400 });
  }

  // Fill in any missing email/phone/name on the account from this booking, so it
  // becomes reachable by both phone-login and Google-login.
  await linkGuestContact(guestId, {
    email: data.guestEmail,
    phone: data.guestPhone,
    name: data.guestName,
  });

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

  // Price + discounts + GST totals. Shared with the AI phone-assistant quote
  // endpoint (see services/quote.ts) so a price quoted on a call can never diverge
  // from the price the booking is actually created at.
  const { couponDiscount, couponId, totals } = await quoteBooking({
    hotelId: data.hotelId,
    roomCategory: data.roomCategory,
    checkIn,
    checkOut,
    couponCode: data.couponCode,
  });

  // The owner's payment settings are enforced here, not just in the booking UI —
  // this endpoint is public, so a hidden button is not a closed door.
  const payModeCheck = await resolvePayMode(data.hotelId, data.payMode);
  if (!payModeCheck.ok) {
    return NextResponse.json({ error: payModeCheck.error }, { status: 400 });
  }

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
        guestPhone: data.guestPhone,
      },
    });

    // Auto-allot the best available physical room for this booking
    const { autoAllotRoom } = await import("@/lib/services/room-allotment");
    const allottedRoomId = await autoAllotRoom({
      hotelId: data.hotelId,
      roomCategory: data.roomCategory,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      excludeBookingId: booking.id,
    });
    if (allottedRoomId) {
      await prisma.booking.update({ where: { id: booking.id }, data: { roomId: allottedRoomId } });
    }

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

    // Notifications (fire-and-forget)
    const guestContact = await prisma.guest.findUnique({
      where: { id: guestId },
      select: { phone: true, email: true, name: true },
    });
    const hotelName = (await prisma.hotel.findUnique({
      where: { id: data.hotelId },
      select: { name: true },
    }))?.name ?? "The Hotel";
    const notifData = {
      guestName: guestContact?.name ?? "",
      bookingRef,
      hotelName,
      roomType: categoryMeta.displayName,
      checkIn: format(checkIn, "dd MMM yyyy"),
      checkOut: format(checkOut, "dd MMM yyyy"),
      totalAmount: totals.totalAmount,
      payAtHotel: true,
    };
    const notifPhone = guestContact?.phone ?? data.guestPhone;
    const ownerAlertData = {
      guestName: guestContact?.name ?? "",
      guestPhone: notifPhone ?? undefined,
      bookingRef,
      roomType: categoryMeta.displayName,
      checkIn: format(checkIn, "dd MMM yyyy"),
      checkOut: format(checkOut, "dd MMM yyyy"),
      nights: noOfNights,
      totalAmount: totals.totalAmount,
      payMode: "PAY_AT_HOTEL",
    };
    await Promise.allSettled([
      notifPhone
        ? gupshup.sendBookingConfirmation(notifPhone, notifData)
        : Promise.resolve(),
      guestContact?.email
        ? email.sendBookingConfirmation(guestContact.email, notifData)
        : Promise.resolve(),
      gupshup.sendOwnerBookingAlert(ownerAlertData),
      email.sendOwnerBookingAlert(ownerAlertData),
    ]);

    return NextResponse.json({
      bookingId: booking.id,
      bookingRef,
      payAtHotel: true,
      amount: totals.totalAmount,
      totals,
    });
  }

  // ── PAY PARTIAL / PAY NOW (Razorpay) ──────────────────────────────────────
  const isPartial = data.payMode === "PAY_PARTIAL";
  const onlineAmount = isPartial ? PARTIAL_PAYMENT_AMOUNT : totals.totalAmount;

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
      guestPhone: data.guestPhone,
    },
  });

  // Create Razorpay order for deposit only (partial) or full amount (pay now)
  const razorpayOrder = await createOrder(
    Math.round(onlineAmount * 100),
    bookingRef
  );

  // Create payment record
  await prisma.payment.create({
    data: {
      bookingId: booking.id,
      razorpayOrderId: razorpayOrder.id,
      amount: onlineAmount,
      mode: "ONLINE",
      status: "pending",
      ...(isPartial ? { notes: "Partial payment — deposit only; balance due at hotel" } : {}),
    },
  });

  return NextResponse.json({
    bookingId: booking.id,
    bookingRef,
    razorpayOrderId: razorpayOrder.id,
    amount: onlineAmount,
    totals,
    isPartial,
  });
  } catch (err) {
    // Log the full object — Razorpay/Prisma errors carry detail beyond `.message`.
    console.error("[POST /api/bookings]", JSON.stringify(err, Object.getOwnPropertyNames(err ?? {})), err);
    return NextResponse.json({ error: extractErrorMessage(err) }, { status: 500 });
  }
}

/**
 * Pull a human-readable reason out of whatever was thrown. The Razorpay SDK
 * rejects with a plain object like `{ statusCode, error: { description } }`
 * (NOT an Error), which would otherwise surface as a useless generic message.
 */
function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const e = err as {
      error?: { description?: string; reason?: string };
      description?: string;
      message?: string;
    };
    return (
      e.error?.description ??
      e.error?.reason ??
      e.description ??
      e.message ??
      "Payment could not be initiated — please check the payment gateway configuration."
    );
  }
  return "Unexpected server error";
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
