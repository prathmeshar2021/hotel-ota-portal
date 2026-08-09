/**
 * POST /api/assistant/bookings/hold
 *
 * The one write the voice agent performs. Creates a PENDING_PAYMENT phone booking
 * that holds inventory for PHONE_HOLD_MINUTES, issues a Razorpay Payment Link, and
 * sends it to the guest over WhatsApp. The booking is only CONFIRMED later, by the
 * `payment_link.paid` webhook (guardrail G3) — this endpoint never confirms.
 *
 * `confirm: true` is required (guardrail G2): the agent must have read the details
 * back to the guest and gotten a verbal yes before calling this.
 *
 * Server-to-server only — requires `Authorization: Bearer <ASSISTANT_API_KEY>`.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAssistantAuth, assistantHotelId } from "@/lib/assistant/auth";
import { enforceRateLimit } from "@/lib/ratelimit";
import { prisma } from "@/lib/db/prisma";
import { quoteBooking } from "@/lib/services/quote";
import { generateBookingRef } from "@/lib/utils/booking";
import { REFUNDABLE_DEPOSIT, PARTIAL_PAYMENT_AMOUNT } from "@/lib/utils/booking-calc";
import { createPaymentLink } from "@/lib/services/razorpay";
import { gupshup } from "@/lib/services/gupshup";
import { linkGuestContact, normalizeEmail } from "@/lib/utils/guest";
import { CATEGORY_META, slugToCategory } from "@/lib/utils/room-categories";
import {
  resolveCategoryCapacity,
  inventoryHoldFilter,
  PHONE_HOLD_MINUTES,
} from "@/lib/utils/inventory";
import type { RoomType } from "@prisma/client";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

const HoldSchema = z.object({
  category: z.string(),
  checkIn: z.string(),
  checkOut: z.string(),
  noOfPersons: z.number().int().min(1),
  guestName: z.string().min(1),
  guestPhone: z.string().min(10),
  guestEmail: z.string().email().optional(),
  couponCode: z.string().optional(),
  payMode: z.enum(["PAY_NOW", "PAY_PARTIAL"]).default("PAY_NOW"),
  // Refuses to write unless the agent read the details back and the guest confirmed.
  confirm: z.literal(true),
});

export async function POST(req: NextRequest) {
  const denied = requireAssistantAuth(req);
  if (denied) return denied;

  const limited = await enforceRateLimit(req, {
    name: "assistant-hold",
    limit: 20,
    windowSec: 60,
    identifier: "assistant",
  });
  if (limited) return limited;

  const hotelId = assistantHotelId();
  if (typeof hotelId !== "string") return hotelId;

  const parsed = HoldSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  // Category
  const categoryType = data.category.includes("-")
    ? slugToCategory(data.category)
    : data.category.toUpperCase();
  const meta = CATEGORY_META[categoryType as keyof typeof CATEGORY_META];
  if (!meta || meta.totalRooms === 0) {
    return NextResponse.json({ error: "Unknown room category" }, { status: 404 });
  }
  if (data.noOfPersons > meta.maxGuests) {
    return NextResponse.json(
      { error: `${meta.displayName} holds up to ${meta.maxGuests} guests` },
      { status: 400 }
    );
  }

  // Dates
  const checkIn = new Date(data.checkIn);
  const checkOut = new Date(data.checkOut);
  if (
    isNaN(checkIn.getTime()) ||
    isNaN(checkOut.getTime()) ||
    checkOut <= checkIn
  ) {
    return NextResponse.json(
      { error: "Invalid dates — checkOut must be after checkIn" },
      { status: 400 }
    );
  }

  // Capacity — never trust the agent's earlier availability read.
  const [activeInCategory, capacity] = await Promise.all([
    prisma.booking.count({
      where: {
        hotelId,
        roomCategory: categoryType,
        ...inventoryHoldFilter(),
        checkInDate: { lt: checkOut },
        checkOutDate: { gt: checkIn },
      },
    }),
    resolveCategoryCapacity(hotelId, categoryType as RoomType, checkIn, checkOut),
  ]);
  if (activeInCategory >= capacity) {
    return NextResponse.json(
      { error: `${meta.displayName} is fully booked for these dates` },
      { status: 409 }
    );
  }

  // Resolve or create the guest account (one per person across contact methods).
  const email = normalizeEmail(data.guestEmail);
  let guest = await prisma.guest.findUnique({ where: { phone: data.guestPhone } });
  if (!guest && email) {
    guest = await prisma.guest.findUnique({ where: { email } });
  }
  const guestId =
    guest?.id ??
    (await prisma.guest.create({
      data: { phone: data.guestPhone, name: data.guestName, email },
    })).id;
  await linkGuestContact(guestId, {
    email: data.guestEmail,
    phone: data.guestPhone,
    name: data.guestName,
  });

  // Authoritative price (same service as website checkout).
  const quote = await quoteBooking({
    hotelId,
    roomCategory: categoryType,
    checkIn,
    checkOut,
    couponCode: data.couponCode,
  });

  const isPartial = data.payMode === "PAY_PARTIAL";
  const amountToPay = isPartial ? PARTIAL_PAYMENT_AMOUNT : quote.totals.totalAmount;

  const bookingRef = await generateBookingRef();
  const holdExpiresAt = new Date(Date.now() + PHONE_HOLD_MINUTES * 60_000);

  const booking = await prisma.booking.create({
    data: {
      bookingRef,
      hotelId,
      roomCategory: categoryType,
      roomId: null,
      primaryGuestId: guestId,
      source: "PHONE",
      status: "PENDING_PAYMENT",
      holdExpiresAt,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      noOfNights: quote.noOfNights,
      noOfPersons: data.noOfPersons,
      roomRent: quote.totals.roomRent,
      couponDiscount: quote.couponDiscount,
      refundableDeposit: REFUNDABLE_DEPOSIT,
      taxableAmount: quote.totals.taxableAmount,
      cgst: quote.totals.cgst,
      sgst: quote.totals.sgst,
      totalAmount: quote.totals.totalAmount,
      balanceDue: quote.totals.totalAmount,
      couponId: quote.couponId,
      guestPhone: data.guestPhone,
    },
  });

  const payment = await prisma.payment.create({
    data: {
      bookingId: booking.id,
      amount: amountToPay,
      mode: "ONLINE",
      status: "pending",
      notes: isPartial
        ? "Phone booking — partial advance; balance due at hotel"
        : "Phone booking — pay in full via WhatsApp link",
    },
  });

  // Payment link, expiring exactly when the hold releases.
  let link: { id: string; short_url: string };
  try {
    const created = await createPaymentLink({
      amountInPaise: Math.round(amountToPay * 100),
      bookingRef,
      expireBy: holdExpiresAt,
      description: `${meta.displayName} · ${bookingRef}`,
      customer: { name: data.guestName, contact: data.guestPhone },
    });
    link = { id: created.id as string, short_url: created.short_url as string };
  } catch (err) {
    // Roll the hold back so a link failure doesn't leave a phantom hold.
    await prisma.payment.delete({ where: { id: payment.id } }).catch(() => {});
    await prisma.booking.delete({ where: { id: booking.id } }).catch(() => {});
    console.error("[assistant/hold] payment link creation failed:", err);
    return NextResponse.json(
      { error: "Could not create the payment link — please try again." },
      { status: 502 }
    );
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: { razorpayLinkId: link.id },
  });

  // Deliver the link over WhatsApp (awaited so we can report success to the agent).
  let whatsappSent = false;
  try {
    await gupshup.sendPaymentLink(data.guestPhone, {
      guestName: data.guestName,
      hotelName: await getHotelName(hotelId),
      bookingRef,
      amount: amountToPay,
      checkIn: format(checkIn, "dd MMM yyyy"),
      checkOut: format(checkOut, "dd MMM yyyy"),
      paymentUrl: link.short_url,
      holdMinutes: PHONE_HOLD_MINUTES,
    });
    whatsappSent = true;
  } catch (err) {
    // Non-fatal: the link exists; the agent can read it out / retry.
    console.error("[assistant/hold] WhatsApp send failed:", err);
  }

  return NextResponse.json({
    bookingRef,
    category: categoryType,
    displayName: meta.displayName,
    nights: quote.noOfNights,
    totalAmount: quote.totals.totalAmount,
    amountToPay,
    isPartial,
    balanceDue: isPartial ? quote.totals.totalAmount - amountToPay : 0,
    paymentLinkUrl: link.short_url,
    holdExpiresAt: holdExpiresAt.toISOString(),
    holdMinutes: PHONE_HOLD_MINUTES,
    whatsappSent,
  });
}

/** Hotel display name for the WhatsApp message. */
async function getHotelName(hotelId: string): Promise<string> {
  const h = await prisma.hotel.findUnique({
    where: { id: hotelId },
    select: { name: true },
  });
  return h?.name ?? "The Hotel";
}
