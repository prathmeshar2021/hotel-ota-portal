import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import {
  computeTotals,
  getUniversalDiscount,
  universalDiscountAmount,
} from "@/lib/utils/booking";
import { REFUNDABLE_DEPOSIT, PARTIAL_PAYMENT_AMOUNT } from "@/lib/utils/booking-calc";
import { createOrder } from "@/lib/services/razorpay";
import { enforceRateLimit } from "@/lib/ratelimit";
import { gupshup } from "@/lib/services/gupshup";
import { email } from "@/lib/services/email";
import { format } from "date-fns";
import type { Booking } from "@prisma/client";
import { z } from "zod";

const ItemSchema = z.object({
  roomCategory: z.string(),
  qty: z.number().int().min(1).max(10),
  noOfPersons: z.number().int().min(1).max(10),
});

const Schema = z.object({
  hotelId: z.string(),
  checkInDate: z.string(),
  checkOutDate: z.string(),
  items: z.array(ItemSchema).min(1).max(15),
  payMode: z.enum(["PAY_NOW", "PAY_PARTIAL", "PAY_AT_HOTEL"]).default("PAY_NOW"),
  guestName: z.string().optional(),
  guestPhone: z.string().optional(),
  guestEmail: z.string().email().optional(),
  specialRequests: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, { name: "booking-create", limit: 8, windowSec: 60 });
  if (limited) return limited;

  try {
    const session = await auth();
    const parsed = Schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", detail: parsed.error.flatten() }, { status: 400 });
    }
    const data = parsed.data;

    const checkIn = new Date(data.checkInDate);
    const checkOut = new Date(data.checkOutDate);
    if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
      return NextResponse.json({ error: "Invalid dates" }, { status: 400 });
    }
    const noOfNights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / 86400000);
    if (noOfNights < 1) {
      return NextResponse.json({ error: "Check-out must be after check-in." }, { status: 400 });
    }

    const { getCategoryMeta } = await import("@/lib/utils/room-categories");
    const { resolveCategoryCapacity, inventoryHoldFilter } = await import("@/lib/utils/inventory");
    const { resolveCategoryPrice } = await import("@/lib/utils/pricing");

    // ── Resolve / link guest ──
    const { linkGuestContact, normalizeEmail } = await import("@/lib/utils/guest");
    let guestId: string;
    if (session?.user.role === "CUSTOMER") {
      guestId = session.user.id;
    } else if (data.guestPhone) {
      let existing = await prisma.guest.findUnique({ where: { phone: data.guestPhone } });
      if (!existing) {
        const email = normalizeEmail(data.guestEmail);
        if (email) existing = await prisma.guest.findUnique({ where: { email } });
      }
      guestId =
        existing?.id ??
        (await prisma.guest.create({
          data: { phone: data.guestPhone, name: data.guestName ?? "Guest", email: normalizeEmail(data.guestEmail) },
        })).id;
    } else {
      return NextResponse.json({ error: "Guest details required" }, { status: 400 });
    }
    await linkGuestContact(guestId, { email: data.guestEmail, phone: data.guestPhone, name: data.guestName });

    const universal = await getUniversalDiscount(data.hotelId);

    // ── Validate availability + price every line, then expand into room rows ──
    interface RoomRow {
      roomCategory: string;
      noOfPersons: number;
      roomRent: number;
      couponDiscount: number;
      couponId?: string;
      taxableAmount: number;
      cgst: number;
      sgst: number;
      totalAmount: number;
    }
    const rows: RoomRow[] = [];

    for (const item of data.items) {
      const meta = getCategoryMeta(item.roomCategory);
      if (!meta || meta.totalRooms === 0) {
        return NextResponse.json({ error: `Invalid room category: ${item.roomCategory}` }, { status: 400 });
      }
      const capacity = await resolveCategoryCapacity(data.hotelId, item.roomCategory as never, checkIn, checkOut);
      const active = await prisma.booking.count({
        where: {
          hotelId: data.hotelId,
          roomCategory: item.roomCategory,
          ...inventoryHoldFilter(),
          checkInDate: { lt: checkOut },
          checkOutDate: { gt: checkIn },
        },
      });
      const available = Math.max(0, capacity - active);
      if (item.qty > available) {
        return NextResponse.json(
          { error: `Only ${available} ${meta.displayName}${available !== 1 ? "s" : ""} available for these dates.` },
          { status: 409 }
        );
      }

      const pricePerNight = await resolveCategoryPrice(data.hotelId, item.roomCategory as never, checkIn);
      const roomRent = pricePerNight * noOfNights;
      const couponDiscount = universalDiscountAmount(universal, roomRent);
      const totals = computeTotals({
        roomRentPerNight: pricePerNight,
        noOfNights,
        couponDiscount,
        refundableDeposit: REFUNDABLE_DEPOSIT, // per room
      });
      for (let i = 0; i < item.qty; i++) {
        rows.push({
          roomCategory: item.roomCategory,
          noOfPersons: item.noOfPersons,
          roomRent: totals.roomRent,
          couponDiscount,
          couponId: couponDiscount > 0 ? universal?.id : undefined,
          taxableAmount: totals.taxableAmount,
          cgst: totals.cgst,
          sgst: totals.sgst,
          totalAmount: totals.totalAmount,
        });
      }
    }

    const groupTotal = rows.reduce((s, r) => s + r.totalAmount, 0);
    const bookingGroupId = randomUUID();

    // Generate one distinct ref per room. generateBookingRef() is count-based, so
    // calling it N times (in parallel or not) before any insert yields identical
    // refs — derive a unique sequence here instead, with a random suffix to avoid
    // collisions with concurrent bookings.
    const now = new Date();
    const dateStr =
      now.getFullYear().toString() +
      (now.getMonth() + 1).toString().padStart(2, "0") +
      now.getDate().toString().padStart(2, "0");
    const baseCount = await prisma.booking.count();
    const refs = rows.map((_, i) => {
      const seq = (baseCount + 1 + i).toString().padStart(4, "0");
      const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
      return `BK-${dateStr}-${seq}${rows.length > 1 ? `-${rand}` : ""}`;
    });
    const status = data.payMode === "PAY_AT_HOTEL" ? "CONFIRMED" : "PENDING_PAYMENT";
    const isPartial = data.payMode === "PAY_PARTIAL";
    // For partial pay: ₹500 booking advance per room
    const onlineAmount = isPartial ? PARTIAL_PAYMENT_AMOUNT * rows.length : groupTotal;

    // ── Razorpay order for online modes ──
    let razorpayOrderId: string | undefined;
    if (data.payMode === "PAY_NOW" || isPartial) {
      const order = await createOrder(Math.round(onlineAmount * 100), `GRP-${bookingGroupId.slice(0, 8)}`);
      razorpayOrderId = order.id;
    }

    // ── Persist all rooms + one shared payment on the primary booking ──
    const created = await prisma.$transaction(async (tx) => {
      const bookings: Booking[] = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const b = await tx.booking.create({
          data: {
            bookingRef: refs[i],
            hotelId: data.hotelId,
            bookingGroupId,
            roomCategory: r.roomCategory,
            roomId: null,
            primaryGuestId: guestId,
            source: "PORTAL",
            status,
            checkInDate: checkIn,
            checkOutDate: checkOut,
            noOfNights,
            noOfPersons: r.noOfPersons,
            roomRent: r.roomRent,
            couponDiscount: r.couponDiscount,
            refundableDeposit: REFUNDABLE_DEPOSIT,
            taxableAmount: r.taxableAmount,
            cgst: r.cgst,
            sgst: r.sgst,
            totalAmount: r.totalAmount,
            balanceDue: r.totalAmount,
            couponId: r.couponId,
            specialRequests: i === 0 ? data.specialRequests : undefined,
          },
        });
        bookings.push(b);
      }
      // Single payment row on the primary booking covers the whole group.
      await tx.payment.create({
        data: {
          bookingId: bookings[0].id,
          razorpayOrderId,
          amount: onlineAmount,
          mode: data.payMode === "PAY_AT_HOTEL" ? "CASH" : "ONLINE",
          status: "pending",
          notes: isPartial
            ? `Group booking · ${rows.length} room(s) · deposit only; balance due at hotel`
            : `Group booking · ${rows.length} room(s)`,
        },
      });
      return bookings;
    });

    const primary = created[0];

    // ── PAY AT HOTEL: confirmed now, notify ──
    if (data.payMode === "PAY_AT_HOTEL") {
      const guest = await prisma.guest.findUnique({ where: { id: guestId }, select: { phone: true, email: true, name: true } });
      const hotelName = (await prisma.hotel.findUnique({ where: { id: data.hotelId }, select: { name: true } }))?.name ?? "The Hotel";
      const groupNotifData = {
        guestName: guest?.name ?? "",
        bookingRef: primary.bookingRef,
        hotelName,
        roomType: `${rows.length} room(s)`,
        checkIn: format(checkIn, "dd MMM yyyy"),
        checkOut: format(checkOut, "dd MMM yyyy"),
        totalAmount: groupTotal,
        payAtHotel: true,
      };
      await Promise.allSettled([
        guest?.phone
          ? gupshup.sendBookingConfirmation(guest.phone, groupNotifData)
          : Promise.resolve(),
        guest?.email
          ? email.sendBookingConfirmation(guest.email, groupNotifData)
          : Promise.resolve(),
      ]);
      return NextResponse.json({
        bookingGroupId,
        bookingId: primary.id,
        bookingRef: primary.bookingRef,
        payAtHotel: true,
        amount: groupTotal,
        rooms: rows.length,
      });
    }

    // ── PAY NOW / PAY PARTIAL ──
    return NextResponse.json({
      bookingGroupId,
      bookingId: primary.id,
      bookingRef: primary.bookingRef,
      razorpayOrderId,
      amount: onlineAmount,
      rooms: rows.length,
      isPartial,
    });
  } catch (err) {
    console.error("[POST /api/bookings/group]", err);
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
