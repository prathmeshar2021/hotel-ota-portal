/**
 * GET /api/assistant/bookings/{ref}/status
 *
 * Lets the voice agent poll whether a phone booking's WhatsApp payment has come
 * through, so it can confirm on the call ("I can see your payment — you're all
 * set") or tell the guest how long the link stays valid.
 *
 * Server-to-server only — requires `Authorization: Bearer <ASSISTANT_API_KEY>`.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAssistantAuth, assistantHotelId } from "@/lib/assistant/auth";
import { enforceRateLimit } from "@/lib/ratelimit";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ ref: string }> }
) {
  const denied = requireAssistantAuth(req);
  if (denied) return denied;

  const limited = await enforceRateLimit(req, {
    name: "assistant-booking-status",
    limit: 120,
    windowSec: 60,
    identifier: "assistant",
  });
  if (limited) return limited;

  const hotelId = assistantHotelId();
  if (typeof hotelId !== "string") return hotelId;

  const { ref } = await ctx.params;
  const booking = await prisma.booking.findUnique({
    where: { bookingRef: ref },
    select: {
      hotelId: true,
      status: true,
      holdExpiresAt: true,
      onlinePaid: true,
      balanceDue: true,
      totalAmount: true,
    },
  });
  // Scope to this hotel so the assistant can't probe other properties' refs.
  if (!booking || booking.hotelId !== hotelId) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const expired =
    booking.status === "PENDING_PAYMENT" &&
    booking.holdExpiresAt != null &&
    booking.holdExpiresAt < new Date();

  const paid = ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"].includes(
    booking.status
  );

  return NextResponse.json({
    bookingRef: ref,
    status: expired ? "EXPIRED" : booking.status,
    paid,
    onlinePaid: booking.onlinePaid,
    balanceDue: booking.balanceDue,
    totalAmount: booking.totalAmount,
    holdExpiresAt: booking.holdExpiresAt?.toISOString() ?? null,
  });
}
