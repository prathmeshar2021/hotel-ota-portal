/**
 * GET /api/assistant/availability?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD
 *
 * One-shot availability + pricing across EVERY room category for the given dates,
 * so the voice agent can answer "what do you have and what does it cost" in a
 * single tool call.
 *
 * Availability reuses the exact same capacity/hold logic as the website
 * (`getCategoryCapacities` + `inventoryHoldFilter`); pricing reuses `quoteBooking`
 * — so nothing the agent says can diverge from what the site would show or charge.
 *
 * Server-to-server only — requires `Authorization: Bearer <ASSISTANT_API_KEY>`.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAssistantAuth, assistantHotelId } from "@/lib/assistant/auth";
import { enforceRateLimit } from "@/lib/ratelimit";
import { prisma } from "@/lib/db/prisma";
import { quoteBooking, nightsBetween } from "@/lib/services/quote";
import {
  CATEGORY_META,
  ALL_CATEGORY_TYPES,
} from "@/lib/utils/room-categories";
import {
  getCategoryCapacities,
  inventoryHoldFilter,
} from "@/lib/utils/inventory";

// Sensitive, always request-time — never let Cache Components prerender it.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireAssistantAuth(req);
  if (denied) return denied;

  const limited = await enforceRateLimit(req, {
    name: "assistant-availability",
    limit: 60,
    windowSec: 60,
    identifier: "assistant",
  });
  if (limited) return limited;

  const hotelId = assistantHotelId();
  if (typeof hotelId !== "string") return hotelId; // 503 when unconfigured

  const { searchParams } = new URL(req.url);
  const checkInStr = searchParams.get("checkIn");
  const checkOutStr = searchParams.get("checkOut");

  if (!checkInStr || !checkOutStr) {
    return NextResponse.json(
      { error: "checkIn and checkOut are required" },
      { status: 400 }
    );
  }

  const checkIn = new Date(checkInStr);
  const checkOut = new Date(checkOutStr);
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

  // Effective capacity per category (honours super-admin inventory overrides),
  // and the count of bookings that currently occupy inventory over these dates.
  const [capacities, bookedRows] = await Promise.all([
    getCategoryCapacities(hotelId, checkIn, checkOut),
    prisma.booking.groupBy({
      by: ["roomCategory"],
      where: {
        hotelId,
        ...inventoryHoldFilter(),
        checkInDate: { lt: checkOut },
        checkOutDate: { gt: checkIn },
      },
      _count: { _all: true },
    }),
  ]);
  const bookedByType = new Map(
    bookedRows.map((r) => [r.roomCategory, r._count._all])
  );

  // Authoritative price per category (incl. universal discount + GST) via the
  // shared quote service. Parallelised — the agent is latency-sensitive.
  const categories = await Promise.all(
    ALL_CATEGORY_TYPES.map(async (type) => {
      const meta = CATEGORY_META[type];
      const total = capacities[type] ?? meta.totalRooms;
      const available = Math.max(0, total - (bookedByType.get(type) ?? 0));
      const quote = await quoteBooking({
        hotelId,
        roomCategory: type,
        checkIn,
        checkOut,
      });
      return {
        type,
        displayName: meta.displayName,
        group: meta.group,
        maxGuests: meta.maxGuests,
        total,
        available,
        pricePerNight: quote.pricePerNight,
        // All-in price for the whole stay (incl. GST + auto marketing discount).
        totalAmount: quote.totals.totalAmount,
      };
    })
  );

  return NextResponse.json({
    checkIn: checkInStr,
    checkOut: checkOutStr,
    nights: nightsBetween(checkIn, checkOut),
    categories,
  });
}
