import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";
import { requireKiosk, isKioskError } from "@/lib/auth/kiosk";
import { enforceRateLimit } from "@/lib/ratelimit";
import { inventoryHoldFilter } from "@/lib/utils/inventory";
import { CATEGORY_META, ALL_CATEGORY_TYPES, getCategoryImages, type RoomCategoryType } from "@/lib/utils/room-categories";
import { getUniversalDiscount, generateBookingRef } from "@/lib/utils/booking";
import { computeTotals, discountedNightlyPrice, REFUNDABLE_DEPOSIT } from "@/lib/utils/booking-calc";

/**
 * Walk-in booking at the kiosk. Creates a CATEGORY-level PENDING_PAYMENT
 * booking (no physical room assigned) — staff assign the room and collect
 * payment at the desk ("pay at desk"). This keeps the kiosk simple and leaves
 * the money/key moment with a human.
 *
 *   GET  → tonight's available categories (photo, price, count)
 *   POST → create the walk-in booking
 */

/** today 00:00 and tomorrow 00:00 (local), or `nights` out. */
function stayWindow(nights = 1) {
  const now = new Date();
  const checkIn = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const checkOut = new Date(checkIn);
  checkOut.setDate(checkOut.getDate() + nights);
  return { checkIn, checkOut, nights };
}

/** available count per category for a window (totalRooms − occupying bookings). */
async function availabilityByCategory(hotelId: string, checkIn: Date, checkOut: Date) {
  const rows = await prisma.booking.groupBy({
    by: ["roomCategory"],
    where: {
      hotelId,
      ...inventoryHoldFilter(),
      checkInDate: { lt: checkOut },
      checkOutDate: { gt: checkIn },
    },
    _count: { id: true },
  });
  const booked: Record<string, number> = Object.fromEntries(
    rows.map((r) => [r.roomCategory, r._count.id])
  );
  const available: Record<string, number> = {};
  for (const type of ALL_CATEGORY_TYPES) {
    available[type] = Math.max(0, CATEGORY_META[type].totalRooms - (booked[type] ?? 0));
  }
  return available;
}

export async function GET(req: NextRequest) {
  const ctx = await requireKiosk(req);
  if (isKioskError(ctx)) return ctx;

  const { checkIn, checkOut, nights } = stayWindow(1);

  // Price map from the hotel's actual rooms (first room per category).
  const rooms = await prisma.room.findMany({
    where: { hotelId: ctx.hotelId, isActive: true },
    select: { roomType: true, basePrice: true },
  });
  const priceByCategory: Record<string, number> = {};
  for (const r of rooms) if (priceByCategory[r.roomType] == null) priceByCategory[r.roomType] = r.basePrice;

  const universal = await getUniversalDiscount(ctx.hotelId);
  const available = await availabilityByCategory(ctx.hotelId, checkIn, checkOut);

  const categories = ALL_CATEGORY_TYPES
    .filter((type) => priceByCategory[type] != null)
    .map((type) => {
      const base = priceByCategory[type];
      const meta = CATEGORY_META[type];
      return {
        category: type,
        name: meta.displayName,
        maxGuests: meta.maxGuests,
        image: getCategoryImages(type)[0] ?? null,
        price: discountedNightlyPrice(universal, base),
        originalPrice: base,
        available: available[type] ?? 0,
      };
    });

  return NextResponse.json({
    checkIn: checkIn.toISOString(),
    checkOut: checkOut.toISOString(),
    nights,
    categories,
  });
}

const CreateSchema = z.object({
  category: z.string(),
  guestName: z.string().trim().min(2, "Name is required"),
  guestPhone: z.string().regex(/^\d{10}$/, "Enter a 10-digit phone number"),
  guests: z.number().int().min(1).max(10),
  nights: z.number().int().min(1).max(14).default(1),
});

export async function POST(req: NextRequest) {
  const ctx = await requireKiosk(req);
  if (isKioskError(ctx)) return ctx;

  const limited = await enforceRateLimit(req, { name: "kiosk-walkin", limit: 20, windowSec: 600 });
  if (limited) return limited;

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid details" }, { status: 400 });
  }
  const d = parsed.data;

  const category = d.category as RoomCategoryType;
  if (!ALL_CATEGORY_TYPES.includes(category)) {
    return NextResponse.json({ error: "Unknown room type." }, { status: 400 });
  }
  if (d.guests > CATEGORY_META[category].maxGuests) {
    return NextResponse.json(
      { error: `This room holds up to ${CATEGORY_META[category].maxGuests} guests.` },
      { status: 400 }
    );
  }

  const { checkIn, checkOut, nights } = stayWindow(d.nights);

  // Price from a real room of this category.
  const room = await prisma.room.findFirst({
    where: { hotelId: ctx.hotelId, roomType: category, isActive: true },
    select: { basePrice: true },
  });
  if (!room) return NextResponse.json({ error: "This room type isn't offered here." }, { status: 400 });

  // Re-check availability at creation time to avoid overbooking the last room.
  const available = await availabilityByCategory(ctx.hotelId, checkIn, checkOut);
  if ((available[category] ?? 0) < 1) {
    return NextResponse.json({ error: "That room type just sold out. Please pick another." }, { status: 409 });
  }

  // Upsert guest by phone.
  const existing = await prisma.guest.findUnique({ where: { phone: d.guestPhone }, select: { id: true } });
  const guestId = existing
    ? existing.id
    : (await prisma.guest.create({ data: { name: d.guestName, phone: d.guestPhone }, select: { id: true } })).id;

  const universal = await getUniversalDiscount(ctx.hotelId);
  const nightly = discountedNightlyPrice(universal, room.basePrice);
  const totals = computeTotals({ roomRentPerNight: nightly, noOfNights: nights });
  const bookingRef = await generateBookingRef();

  // Category-level, unpaid — staff assign room + collect payment at the desk.
  const booking = await prisma.booking.create({
    data: {
      bookingRef,
      hotelId: ctx.hotelId,
      roomCategory: category,
      primaryGuestId: guestId,
      source: "WALK_IN",
      status: "PENDING_PAYMENT",
      checkInDate: checkIn,
      checkOutDate: checkOut,
      noOfNights: nights,
      noOfPersons: d.guests,
      roomRent: totals.roomRent,
      taxableAmount: totals.taxableAmount,
      cgst: totals.cgst,
      sgst: totals.sgst,
      totalAmount: totals.totalAmount,
      balanceDue: totals.totalAmount,
      refundableDeposit: REFUNDABLE_DEPOSIT,
      guestPhone: d.guestPhone,
      viaKiosk: true,
    },
    select: { bookingRef: true, totalAmount: true },
  });

  return NextResponse.json(
    {
      success: true,
      bookingRef: booking.bookingRef,
      totalAmount: booking.totalAmount,
      message: "Booking created. Please complete payment at the reception desk.",
    },
    { status: 201 }
  );
}
