/**
 * GET /api/assistant/quote
 *   ?category=LUXURY_COTTAGE   (enum value OR slug "luxury-cottage")
 *   &checkIn=YYYY-MM-DD
 *   &checkOut=YYYY-MM-DD
 *   &couponCode=OPTIONAL
 *
 * Authoritative price quote for the AI voice assistant. Uses the SAME
 * `quoteBooking()` service the website checkout uses, so a price quoted verbally
 * on a call can never diverge from the price the booking is created at.
 *
 * Server-to-server only — requires `Authorization: Bearer <ASSISTANT_API_KEY>`.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAssistantAuth, assistantHotelId } from "@/lib/assistant/auth";
import { enforceRateLimit } from "@/lib/ratelimit";
import { quoteBooking } from "@/lib/services/quote";
import { CATEGORY_META, slugToCategory } from "@/lib/utils/room-categories";

// Sensitive, always request-time — never let Cache Components prerender it.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireAssistantAuth(req);
  if (denied) return denied;

  const limited = await enforceRateLimit(req, {
    name: "assistant-quote",
    limit: 60,
    windowSec: 60,
    identifier: "assistant",
  });
  if (limited) return limited;

  const hotelId = assistantHotelId();
  if (typeof hotelId !== "string") return hotelId; // 503 when unconfigured

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const checkInStr = searchParams.get("checkIn");
  const checkOutStr = searchParams.get("checkOut");
  const couponCode = searchParams.get("couponCode") ?? undefined;

  if (!category || !checkInStr || !checkOutStr) {
    return NextResponse.json(
      { error: "category, checkIn and checkOut are required" },
      { status: 400 }
    );
  }

  // Accept either the raw enum ("LUXURY_COTTAGE") or a URL slug ("luxury-cottage").
  const categoryType = category.includes("-")
    ? slugToCategory(category)
    : category.toUpperCase();
  const meta = CATEGORY_META[categoryType as keyof typeof CATEGORY_META];
  if (!meta || meta.totalRooms === 0) {
    return NextResponse.json({ error: "Unknown room category" }, { status: 404 });
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

  const quote = await quoteBooking({
    hotelId,
    roomCategory: categoryType,
    checkIn,
    checkOut,
    couponCode,
  });

  return NextResponse.json({
    category: categoryType,
    displayName: meta.displayName,
    checkIn: checkInStr,
    checkOut: checkOutStr,
    nights: quote.noOfNights,
    pricePerNight: quote.pricePerNight,
    roomRent: quote.totals.roomRent,
    couponDiscount: quote.couponDiscount,
    taxableAmount: quote.totals.taxableAmount,
    cgst: quote.totals.cgst,
    sgst: quote.totals.sgst,
    totalAmount: quote.totals.totalAmount,
    refundableDeposit: quote.refundableDeposit,
  });
}
