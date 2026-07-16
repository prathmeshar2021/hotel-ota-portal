import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { format } from "date-fns";
import { requireKiosk, isKioskError } from "@/lib/auth/kiosk";
import { enforceRateLimit } from "@/lib/ratelimit";
import { getCategoryMeta } from "@/lib/utils/room-categories";

/**
 * Step 2 of self check-in. Verify the second factor (last-4 of phone, or OTP)
 * against the lookup challenge. On success the lookup token is promoted to a
 * 15-minute VERIFIED check-in session and full booking details are returned
 * for wizard prefill. Attempt-limited to defeat guessing.
 */

const MAX_ATTEMPTS = 5;
const SESSION_TTL_MIN = 15;

const Schema = z.object({
  lookupToken: z.string().min(10),
  code: z.string().regex(/^\d{4,6}$/),
});

export async function POST(req: NextRequest) {
  const ctx = await requireKiosk(req);
  if (isKioskError(ctx)) return ctx;

  const limited = await enforceRateLimit(req, { name: "kiosk-verify", limit: 15, windowSec: 600 });
  if (limited) return limited;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter the verification code." }, { status: 400 });
  }
  const { lookupToken, code } = parsed.data;

  const lookup = await prisma.kioskLookup.findUnique({ where: { token: lookupToken } });

  // Bind to this device, must be pending & unexpired & under attempt cap.
  if (
    !lookup ||
    lookup.deviceId !== ctx.deviceId ||
    lookup.status !== "PENDING" ||
    lookup.expiresAt < new Date() ||
    lookup.attempts >= MAX_ATTEMPTS
  ) {
    return NextResponse.json({ error: "This session expired. Please start again." }, { status: 400 });
  }

  // Check the factor.
  let valid = false;
  if (lookup.method === "OTP") {
    valid = !!lookup.otpHash && (await bcrypt.compare(code, lookup.otpHash));
  } else {
    // LAST4 — compare against the phone on the booking.
    const booking = await prisma.booking.findUnique({
      where: { id: lookup.bookingId },
      select: { guestPhone: true, primaryGuest: { select: { phone: true } } },
    });
    const phone = booking?.primaryGuest?.phone ?? booking?.guestPhone ?? "";
    valid = code.length === 4 && phone.slice(-4) === code;
  }

  if (!valid) {
    const attempts = lookup.attempts + 1;
    await prisma.kioskLookup.update({
      where: { id: lookup.id },
      // Lock the challenge once attempts are exhausted.
      data: { attempts, status: attempts >= MAX_ATTEMPTS ? "USED" : "PENDING" },
    });
    const remaining = MAX_ATTEMPTS - attempts;
    return NextResponse.json(
      {
        error: remaining > 0
          ? `Incorrect. ${remaining} ${remaining === 1 ? "try" : "tries"} left.`
          : "Too many attempts. Please start again.",
      },
      { status: 400 }
    );
  }

  // Promote to a verified check-in session.
  await prisma.kioskLookup.update({
    where: { id: lookup.id },
    data: { status: "VERIFIED", expiresAt: new Date(Date.now() + SESSION_TTL_MIN * 60_000) },
  });

  // Full details for prefill (now that identity is proven).
  const booking = await prisma.booking.findUnique({
    where: { id: lookup.bookingId },
    select: {
      noOfPersons: true, noOfNights: true, roomCategory: true,
      checkInDate: true, checkOutDate: true, onlineCheckinDone: true,
      primaryGuest: { select: { name: true, phone: true, email: true, idType: true, idNumber: true } },
      onlineCheckin: { select: { comingFrom: true, goingTo: true, purpose: true, vehicleNo: true } },
    },
  });
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  const meta = getCategoryMeta(booking.roomCategory);
  return NextResponse.json({
    verified: true,
    booking: {
      guestName: booking.primaryGuest?.name ?? "",
      guestPhone: booking.primaryGuest?.phone ?? "",
      guestEmail: booking.primaryGuest?.email ?? "",
      idType: booking.primaryGuest?.idType ?? null,
      idNumber: booking.primaryGuest?.idNumber ?? null,
      guests: booking.noOfPersons,
      nights: booking.noOfNights,
      category: meta.displayName,
      checkIn: format(booking.checkInDate, "dd MMM yyyy"),
      checkOut: format(booking.checkOutDate, "dd MMM yyyy"),
      alreadyCheckedIn: booking.onlineCheckinDone,
      prefill: booking.onlineCheckin ?? null,
    },
  });
}
