import { prisma } from "@/lib/db/prisma";
import { CATEGORY_META, type RoomCategoryType } from "@/lib/utils/room-categories";
import type { RoomType, Prisma } from "@prisma/client";

/**
 * How long an unpaid online booking (PENDING_PAYMENT) holds inventory while the
 * guest completes payment. After this window the hold self-releases, so an
 * abandoned checkout never permanently blocks a room.
 */
export const PAYMENT_HOLD_MINUTES = 15;

/**
 * How long a phone booking holds inventory while the guest pays via the WhatsApp
 * payment link. Longer than the website window because the guest has to leave the
 * call, open WhatsApp, and complete payment. The Razorpay link is set to expire at
 * the same instant, so a guest can never pay for an already-released room.
 */
export const PHONE_HOLD_MINUTES = 30;

/** PENDING_PAYMENT bookings created before this no longer occupy inventory. */
export function paymentHoldCutoff(): Date {
  return new Date(Date.now() - PAYMENT_HOLD_MINUTES * 60_000);
}

/**
 * Prisma `where` fragment matching every booking that currently *occupies*
 * inventory for a date range:
 *   • CONFIRMED / CHECKED_IN     — firm holds
 *   • PENDING_PAYMENT (recent)   — transient payment holds, so two guests can't
 *                                  both pay for the last room; auto-released
 *                                  once PAYMENT_HOLD_MINUTES elapse.
 *
 * Spread alongside the date-overlap filters, e.g.:
 *   where: { hotelId, roomCategory, ...inventoryHoldFilter(),
 *            checkInDate: { lt: checkOut }, checkOutDate: { gt: checkIn } }
 */
export function inventoryHoldFilter(): Prisma.BookingWhereInput {
  return {
    OR: [
      { status: { in: ["CONFIRMED", "CHECKED_IN"] } },
      // Explicit-expiry holds (e.g. phone bookings) occupy inventory until their
      // holdExpiresAt passes.
      { status: "PENDING_PAYMENT", holdExpiresAt: { gte: new Date() } },
      // Default holds (website checkout, no explicit expiry) use the 15-min
      // createdAt window.
      {
        status: "PENDING_PAYMENT",
        holdExpiresAt: null,
        createdAt: { gte: paymentHoldCutoff() },
      },
    ],
  };
}

/** List of date strings (YYYY-MM-DD at UTC midnight) for each night of a stay. */
function nightsBetween(checkIn: Date, checkOut: Date): Date[] {
  const out: Date[] = [];
  const d = new Date(checkIn);
  d.setHours(0, 0, 0, 0);
  const end = new Date(checkOut);
  end.setHours(0, 0, 0, 0);
  while (d < end) {
    out.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return out.length ? out : [new Date(checkIn)];
}

/** Default capacity for a category (from static meta). */
export function defaultCapacity(roomType: string): number {
  return CATEGORY_META[roomType as RoomCategoryType]?.totalRooms ?? 0;
}

/**
 * Effective sellable capacity for a category across a stay.
 *
 * For each night we use the RoomInventory override if one exists for that date,
 * otherwise the static default. We return the **minimum** across nights so the
 * stay is only offered when every night has capacity.
 */
export async function resolveCategoryCapacity(
  hotelId: string,
  roomType: RoomType,
  checkIn: Date,
  checkOut: Date
): Promise<number> {
  const nights = nightsBetween(checkIn, checkOut);
  const overrides = await prisma.roomInventory.findMany({
    where: {
      hotelId,
      roomType,
      date: { gte: nights[0], lte: nights[nights.length - 1] },
    },
    select: { date: true, units: true },
  });

  const byDate = new Map(
    overrides.map((o) => [o.date.toISOString().slice(0, 10), o.units])
  );
  const def = defaultCapacity(roomType);

  let min = Infinity;
  for (const n of nights) {
    const key = n.toISOString().slice(0, 10);
    min = Math.min(min, byDate.has(key) ? byDate.get(key)! : def);
  }
  return min === Infinity ? def : min;
}

/**
 * Batch version: effective capacity for every category over a stay.
 * Returns a Record keyed by roomType. Categories without overrides use default.
 */
export async function getCategoryCapacities(
  hotelId: string,
  checkIn: Date,
  checkOut: Date
): Promise<Record<string, number>> {
  const nights = nightsBetween(checkIn, checkOut);
  const overrides = await prisma.roomInventory.findMany({
    where: {
      hotelId,
      date: { gte: nights[0], lte: nights[nights.length - 1] },
    },
    select: { roomType: true, date: true, units: true },
  });

  // group overrides by roomType → date → units
  const byType = new Map<string, Map<string, number>>();
  for (const o of overrides) {
    const m = byType.get(o.roomType) ?? new Map<string, number>();
    m.set(o.date.toISOString().slice(0, 10), o.units);
    byType.set(o.roomType, m);
  }

  const result: Record<string, number> = {};
  for (const roomType of Object.keys(CATEGORY_META)) {
    const def = defaultCapacity(roomType);
    const dateMap = byType.get(roomType);
    if (!dateMap) {
      result[roomType] = def;
      continue;
    }
    let min = Infinity;
    for (const n of nights) {
      const key = n.toISOString().slice(0, 10);
      min = Math.min(min, dateMap.has(key) ? dateMap.get(key)! : def);
    }
    result[roomType] = min === Infinity ? def : min;
  }
  return result;
}
