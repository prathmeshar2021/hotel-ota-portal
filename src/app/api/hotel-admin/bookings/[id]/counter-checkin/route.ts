import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";

const CompanionSchema = z.object({
  name:       z.string().min(1, "Companion name is required"),
  relation:   z.string().optional(),
  idType:     z.string().optional(),
  idNumber:   z.string().min(1, "Companion ID number is required"),
  idFrontUrl: z.string().url("Companion ID front photo is required"),
  idBackUrl:  z.string().url("Companion ID back photo is required"),
});

const CounterCheckinSchema = z.object({
  idType:     z.enum(["AADHAR", "DRIVING_LICENSE", "PASSPORT", "VOTER_ID", "OTHER"]),
  idNumber:   z.string().min(1, "Primary guest ID number is required"),
  idFrontUrl: z.string().url("Primary guest ID front photo is required"),
  idBackUrl:  z.string().url("Primary guest ID back photo is required"),
  comingFrom: z.string().min(1, "Coming from is required"),
  goingTo:    z.string().min(1, "Going to is required"),
  purpose:    z.string().min(1, "Purpose of visit is required"),
  vehicleNo:  z.string().optional(),
  companions: z.array(CompanionSchema).optional(),
});

type IdTypeEnum = "AADHAR" | "DRIVING_LICENSE" | "PASSPORT" | "VOTER_ID" | "OTHER";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.hotelId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "HOTEL_ADMIN" && session.user.role !== "HOTEL_STAFF") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body   = await req.json();
  const parsed = CounterCheckinSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? "Validation failed";
    return NextResponse.json({ error: firstError }, { status: 400 });
  }

  const data = parsed.data;

  const booking = await prisma.booking.findFirst({
    where: { id, hotelId: session.user.hotelId, status: "CONFIRMED" },
    select: { id: true, roomId: true, primaryGuestId: true, noOfPersons: true },
  });

  if (!booking) {
    return NextResponse.json(
      { error: "Booking not found or not eligible for check-in" },
      { status: 404 }
    );
  }

  // Enforce companion requirement for group bookings
  if (booking.noOfPersons > 1) {
    const valid = (data.companions ?? []).filter(
      c => c.name.trim() && c.idNumber.trim() && c.idFrontUrl && c.idBackUrl
    );
    if (valid.length < 1) {
      return NextResponse.json(
        { error: `Group booking (${booking.noOfPersons} guests) requires at least 1 companion with name, ID number, and ID photos` },
        { status: 400 }
      );
    }
  }

  const now         = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  // 1. Update primary guest identity on their profile
  await prisma.guest.update({
    where: { id: booking.primaryGuestId },
    data: {
      idType:     data.idType,
      idNumber:   data.idNumber,
      idFrontUrl: data.idFrontUrl,
      idBackUrl:  data.idBackUrl,
    },
  });

  // 2. Upsert check-in record
  await prisma.onlineCheckin.upsert({
    where: { bookingId: booking.id },
    create: {
      bookingId:             booking.id,
      guestId:               booking.primaryGuestId,
      comingFrom:            data.comingFrom,
      goingTo:               data.goingTo,
      purpose:               data.purpose,
      vehicleNo:             data.vehicleNo,
      expectedCheckInTime:   currentTime,
      expectedCheckOutTime:  "11:00",
      completedAt:           now,
    },
    update: {
      comingFrom:           data.comingFrom,
      goingTo:              data.goingTo,
      purpose:              data.purpose,
      vehicleNo:            data.vehicleNo,
      expectedCheckInTime:  currentTime,
      completedAt:          now,
    },
  });

  // 3. Remove old companions
  await prisma.bookingCompanion.deleteMany({ where: { bookingId: booking.id } });

  // 4. For each companion: upsert Guest record, then create BookingCompanion linked to it
  const validCompanions = (data.companions ?? []).filter(c => c.name.trim());
  for (const c of validCompanions) {
    // Try to find existing Guest by idNumber (most reliable unique key)
    let guestId: string | undefined;

    if (c.idNumber) {
      const existing = await prisma.guest.findFirst({
        where: { idNumber: c.idNumber },
        select: { id: true },
      });

      if (existing) {
        // Update existing record with latest info
        await prisma.guest.update({
          where: { id: existing.id },
          data: {
            name:       c.name,
            idType:     c.idType as IdTypeEnum | undefined,
            idNumber:   c.idNumber,
            idFrontUrl: c.idFrontUrl || undefined,
            idBackUrl:  c.idBackUrl  || undefined,
          },
        });
        guestId = existing.id;
      } else {
        // Create new Guest record for this companion
        const newGuest = await prisma.guest.create({
          data: {
            name:       c.name,
            idType:     c.idType as IdTypeEnum | undefined,
            idNumber:   c.idNumber,
            idFrontUrl: c.idFrontUrl || undefined,
            idBackUrl:  c.idBackUrl  || undefined,
          },
        });
        guestId = newGuest.id;
      }
    }

    // Create the BookingCompanion entry linked to the Guest record
    await prisma.bookingCompanion.create({
      data: {
        bookingId:  booking.id,
        guestId:    guestId,
        name:       c.name,
        relation:   c.relation,
        idType:     c.idType as IdTypeEnum | undefined,
        idNumber:   c.idNumber,
        idFrontUrl: c.idFrontUrl || undefined,
        idBackUrl:  c.idBackUrl  || undefined,
      },
    });
  }

  // 5. Transition booking + room
  await Promise.all([
    prisma.booking.update({
      where: { id: booking.id },
      data: { status: "CHECKED_IN", checkedInAt: now, onlineCheckinDone: true },
    }),
    prisma.room.update({
      where: { id: booking.roomId },
      data: { status: "OCCUPIED" },
    }),
  ]);

  return NextResponse.json({ success: true, message: "Guest checked in successfully" });
}
