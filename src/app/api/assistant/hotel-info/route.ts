/**
 * GET /api/assistant/hotel-info
 *
 * Static-ish reference the voice agent uses to answer queries: address, timings,
 * amenities, room categories (NO prices — those come from the availability tool),
 * policies, and confirmed FAQs.
 *
 * Structured facts (address, timings, amenities, payment toggles) are read LIVE
 * from the Hotel record; narrative content (policies, FAQs) comes from the
 * knowledge base. Draft FAQs are filtered out (guardrail G1).
 *
 * Server-to-server only — requires `Authorization: Bearer <ASSISTANT_API_KEY>`.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAssistantAuth, assistantHotelId } from "@/lib/assistant/auth";
import { enforceRateLimit } from "@/lib/ratelimit";
import { prisma } from "@/lib/db/prisma";
import { ALL_CATEGORY_TYPES, CATEGORY_META } from "@/lib/utils/room-categories";
import {
  ASSISTANT_PERSONA,
  POLICIES,
  confirmedFaqs,
} from "@/lib/assistant/knowledge";

// Sensitive, always request-time — never let Cache Components prerender it.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireAssistantAuth(req);
  if (denied) return denied;

  const limited = await enforceRateLimit(req, {
    name: "assistant-hotel-info",
    limit: 60,
    windowSec: 60,
    identifier: "assistant",
  });
  if (limited) return limited;

  const hotelId = assistantHotelId();
  if (typeof hotelId !== "string") return hotelId; // 503 when unconfigured

  const hotel = await prisma.hotel.findUnique({
    where: { id: hotelId },
    select: {
      name: true,
      address: true,
      city: true,
      state: true,
      pincode: true,
      phone: true,
      email: true,
      amenities: true,
      checkInTime: true,
      checkOutTime: true,
      allowPayAtHotel: true,
      allowPartialPay: true,
    },
  });
  if (!hotel) {
    return NextResponse.json({ error: "Hotel not found" }, { status: 404 });
  }

  // Payment options depend on live per-hotel toggles — build the sentence from
  // them so the agent never states an option the hotel has switched off.
  const paymentModes: string[] = [
    "pay securely online via a link we send on WhatsApp",
  ];
  if (hotel.allowPartialPay) {
    paymentModes.push("pay a small advance now and the rest at the hotel");
  }
  if (hotel.allowPayAtHotel) {
    paymentModes.push("pay in full at the hotel");
  }
  const paymentPolicy = `You can ${orList(paymentModes)}.`;

  const categories = ALL_CATEGORY_TYPES.map((type) => {
    const m = CATEGORY_META[type];
    return {
      type,
      displayName: m.displayName,
      group: m.group,
      maxGuests: m.maxGuests,
      description: m.description,
    };
  });

  return NextResponse.json({
    name: hotel.name,
    tagline: ASSISTANT_PERSONA.tagline,
    address: hotel.address,
    city: hotel.city,
    state: hotel.state,
    pincode: hotel.pincode,
    phone: hotel.phone,
    email: hotel.email,
    googleMaps: ASSISTANT_PERSONA.googleMaps,
    checkInTime: hotel.checkInTime,
    checkOutTime: hotel.checkOutTime,
    amenities: hotel.amenities,
    categories,
    policies: { ...POLICIES, payment: paymentPolicy },
    faqs: confirmedFaqs(),
    greetingDisclosure: ASSISTANT_PERSONA.greetingDisclosure,
    pricingNote:
      "Prices vary by date. Always fetch prices and availability from the availability tool — never quote a price from this reference.",
  });
}

/** Join a list as "a, b or c" for natural speech. */
function orList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}
