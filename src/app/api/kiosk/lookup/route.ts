import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { format } from "date-fns";
import { requireKiosk, isKioskError, randomToken, maskName, generate6DigitCode } from "@/lib/auth/kiosk";
import { enforceRateLimit } from "@/lib/ratelimit";
import { getCategoryMeta } from "@/lib/utils/room-categories";
import { gupshup } from "@/lib/services/gupshup";

/**
 * Step 1 of self check-in. Find a booking by reference (+ later last-4 of
 * phone) or by phone (+ OTP). Returns ONLY a masked summary and an opaque
 * lookup token — never full PII, never a list. Misses return a generic
 * "not found" so the kiosk can't be used to fish for others' bookings.
 *
 * Phone→OTP lookup is feature-flagged (KIOSK_PHONE_OTP=true) until a dedicated
 * WhatsApp Authentication template is approved; booking-ref→last-4 needs no
 * external dependency and is always available.
 */

const PHONE_OTP_ENABLED = process.env.KIOSK_PHONE_OTP === "true";
const LOOKUP_TTL_MIN = 10;

const Schema = z.object({
  bookingRef: z.string().trim().min(3).max(40).optional(),
  phone: z.string().regex(/^\d{10}$/).optional(),
}).refine((d) => !!d.bookingRef !== !!d.phone, {
  message: "Provide either a booking number or a phone number.",
});

const NOT_FOUND = { found: false as const };

export async function POST(req: NextRequest) {
  const ctx = await requireKiosk(req);
  if (isKioskError(ctx)) return ctx;

  const limited = await enforceRateLimit(req, { name: "kiosk-lookup", limit: 12, windowSec: 600 });
  if (limited) return limited;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter your booking number or phone number." }, { status: 400 });
  }
  const { bookingRef, phone } = parsed.data;

  // Resolve the target booking, scoped to this device's hotel. Only current /
  // upcoming, check-in-eligible bookings are surfaced.
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const baseWhere = {
    hotelId: ctx.hotelId,
    status: { in: ["CONFIRMED", "CHECKED_IN"] },
    checkOutDate: { gte: todayStart },
  } satisfies import("@prisma/client").Prisma.BookingWhereInput;

  let method: "LAST4" | "OTP";
  let booking;

  if (bookingRef) {
    method = "LAST4";
    booking = await prisma.booking.findFirst({
      where: { ...baseWhere, bookingRef: bookingRef.toUpperCase() },
      select: bookingSelect,
      orderBy: { checkInDate: "asc" },
    });
  } else {
    if (!PHONE_OTP_ENABLED) {
      return NextResponse.json(
        { error: "Phone check-in is unavailable right now. Please use your booking number." },
        { status: 400 }
      );
    }
    method = "OTP";
    booking = await prisma.booking.findFirst({
      where: { ...baseWhere, primaryGuest: { phone } },
      select: bookingSelect,
      orderBy: { checkInDate: "asc" },
    });
  }

  // Generic miss — identical shape whether the booking doesn't exist or isn't
  // eligible, so nothing can be inferred.
  if (!booking) return NextResponse.json(NOT_FOUND);

  const alreadyCheckedIn = booking.status === "CHECKED_IN" || booking.onlineCheckinDone;

  // Create the challenge row (device-bound, attempt-limited, single-use).
  const token = randomToken();
  const expiresAt = new Date(Date.now() + LOOKUP_TTL_MIN * 60_000);

  let otpHash: string | undefined;
  let phoneHint: string | undefined;
  if (method === "OTP") {
    const otp = generate6DigitCode();
    otpHash = await bcrypt.hash(otp, 10);
    const guestPhone = booking.primaryGuest?.phone ?? booking.guestPhone ?? undefined;
    if (!guestPhone) return NextResponse.json(NOT_FOUND);
    phoneHint = `••••${guestPhone.slice(-2)}`;
    // Stopgap template until a dedicated kiosk OTP template exists.
    gupshup.sendPasswordResetOtp(guestPhone, { otp, name: booking.primaryGuest?.name })
      .catch((e) => console.error("[kiosk] OTP send failed:", e));
  }

  await prisma.kioskLookup.create({
    data: {
      token, deviceId: ctx.deviceId, bookingId: booking.id,
      method, otpHash, expiresAt,
    },
  });

  const meta = getCategoryMeta(booking.roomCategory);
  return NextResponse.json({
    found: true,
    lookupToken: token,
    method,
    phoneHint,
    alreadyCheckedIn,
    masked: {
      name: maskName(booking.primaryGuest?.name ?? "Guest"),
      guests: booking.noOfPersons,
      category: meta.displayName,
      checkIn: format(booking.checkInDate, "dd MMM"),
      checkOut: format(booking.checkOutDate, "dd MMM"),
      nights: booking.noOfNights,
    },
  });
}

const bookingSelect = {
  id: true,
  status: true,
  noOfPersons: true,
  noOfNights: true,
  roomCategory: true,
  checkInDate: true,
  checkOutDate: true,
  onlineCheckinDone: true,
  guestPhone: true,
  primaryGuest: { select: { name: true, phone: true } },
} as const;
