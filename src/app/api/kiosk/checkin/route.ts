import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";
import { requireKiosk, isKioskError } from "@/lib/auth/kiosk";
import { performCheckin, CheckinError } from "@/lib/services/checkin";

/**
 * Step 3 of self check-in. Complete the register using a VERIFIED lookup
 * session. The token proves the guest passed second-factor verification on
 * this device; there is no other way to reach this endpoint. Single-use.
 */

const CompanionSchema = z.object({
  name: z.string(),
  relation: z.string().optional(),
  idType: z.string().optional(),
  idNumber: z.string().optional(),
  idFrontUrl: z.string().optional(),
  idBackUrl: z.string().optional(),
});

const Schema = z.object({
  lookupToken: z.string().min(10),
  idType: z.enum(["AADHAR", "DRIVING_LICENSE", "PASSPORT", "VOTER_ID", "OTHER"]),
  idNumber: z.string().min(1, "ID number is required"),
  idFrontUrl: z.string().url("ID front photo is required"),
  idBackUrl: z.string().url("ID back photo is required"),
  comingFrom: z.string().min(1, "Coming from is required"),
  goingTo: z.string().min(1, "Going to is required"),
  purpose: z.string().min(1, "Purpose is required"),
  vehicleNo: z.string().optional(),
  expectedCheckInTime: z.string().min(1),
  expectedCheckOutTime: z.string().min(1),
  companions: z.array(CompanionSchema).optional(),
});

export async function POST(req: NextRequest) {
  const ctx = await requireKiosk(req);
  if (isKioskError(ctx)) return ctx;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed" },
      { status: 400 }
    );
  }
  const { lookupToken, ...data } = parsed.data;

  const lookup = await prisma.kioskLookup.findUnique({ where: { token: lookupToken } });
  if (
    !lookup ||
    lookup.deviceId !== ctx.deviceId ||
    lookup.status !== "VERIFIED" ||
    lookup.expiresAt < new Date()
  ) {
    return NextResponse.json({ error: "This session expired. Please start again." }, { status: 401 });
  }

  const booking = await prisma.booking.findFirst({
    where: { id: lookup.bookingId, hotelId: ctx.hotelId },
    select: { id: true, bookingRef: true, primaryGuestId: true, noOfPersons: true },
  });
  if (!booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  try {
    await performCheckin({
      bookingId: booking.id,
      primaryGuestId: booking.primaryGuestId,
      noOfPersons: booking.noOfPersons,
      data,
    });
  } catch (e) {
    if (e instanceof CheckinError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  // Consume the session so the token can't be replayed; tag the booking as
  // kiosk-completed (staff badge on the bookings dashboard).
  await prisma.kioskLookup.update({
    where: { id: lookup.id },
    data: { status: "USED" },
  });
  await prisma.booking.update({
    where: { id: booking.id },
    data: { viaKiosk: true },
  });

  // The booking's onlineCheckinDone flag is the staff signal on the bookings
  // dashboard: "assign room & hand over keys". (A dedicated WhatsApp staff
  // ping can be added once an approved template exists.)
  return NextResponse.json({
    success: true,
    bookingRef: booking.bookingRef,
    message: "Check-in complete. Please collect your keys at the reception desk.",
  });
}
