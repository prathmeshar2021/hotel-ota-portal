import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { z } from "zod";
import { performCheckin, CheckinError } from "@/lib/services/checkin";

const CompanionSchema = z.object({
  name:       z.string(),
  relation:   z.string().optional(),
  idType:     z.string().optional(),
  idNumber:   z.string().optional(),
  idFrontUrl: z.string().optional(),
  idBackUrl:  z.string().optional(),
});

const CheckinSchema = z.object({
  bookingRef: z.string(),
  // Primary guest identity — required
  idType:     z.enum(["AADHAR", "DRIVING_LICENSE", "PASSPORT", "VOTER_ID", "OTHER"]),
  idNumber:   z.string().min(1, "ID number is required"),
  idFrontUrl: z.string().url("ID front photo is required"),
  idBackUrl:  z.string().url("ID back photo is required"),
  // Travel — required
  comingFrom: z.string().min(1, "Coming from is required"),
  goingTo:    z.string().min(1, "Going to is required"),
  purpose:    z.string().min(1, "Purpose is required"),
  // Travel — optional
  vehicleNo:  z.string().optional(),
  // Times — required
  expectedCheckInTime:  z.string().min(1, "Expected check-in time is required"),
  expectedCheckOutTime: z.string().min(1, "Expected check-out time is required"),
  // Companions
  companions: z.array(CompanionSchema).optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "CUSTOMER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body   = await req.json();
  const parsed = CheckinSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? "Validation failed";
    return NextResponse.json({ error: firstError }, { status: 400 });
  }

  const data = parsed.data;

  const booking = await prisma.booking.findFirst({
    where: {
      bookingRef:    data.bookingRef,
      primaryGuestId: session.user.id,
      status: { in: ["CONFIRMED"] },
    },
    select: { id: true, noOfPersons: true },
  });

  if (!booking) {
    return NextResponse.json({ error: "Booking not found or not eligible for check-in" }, { status: 404 });
  }

  try {
    await performCheckin({
      bookingId:      booking.id,
      primaryGuestId: session.user.id,
      noOfPersons:    booking.noOfPersons,
      data,
    });
  } catch (e) {
    if (e instanceof CheckinError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  return NextResponse.json({ success: true, message: "Online check-in complete. Show this at the hotel." });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const bookingRef = searchParams.get("ref");
  if (!bookingRef) return NextResponse.json({ error: "ref required" }, { status: 400 });

  const booking = await prisma.booking.findUnique({
    where: { bookingRef },
    include: {
      primaryGuest: {
        select: { name: true, phone: true, idType: true, idFrontUrl: true },
      },
      onlineCheckin: true,
      companions:    true,
      hotel: { select: { name: true, address: true, phone: true } },
      room:  { select: { roomNumber: true, roomType: true } },
    },
  });

  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(booking);
}
