import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { z } from "zod";

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

type IdTypeEnum = "AADHAR" | "DRIVING_LICENSE" | "PASSPORT" | "VOTER_ID" | "OTHER";

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

  // Group booking: require at least 1 companion with name + idNumber + photos
  if (booking.noOfPersons > 1) {
    const validCompanions = (data.companions ?? []).filter(
      c => c.name?.trim() && c.idNumber?.trim() && c.idFrontUrl && c.idBackUrl
    );
    if (validCompanions.length < 1) {
      return NextResponse.json(
        { error: "Group booking requires at least 1 companion's name, ID number, and ID photos" },
        { status: 400 }
      );
    }
  }

  // 1. Update primary guest ID on their profile
  await prisma.guest.update({
    where: { id: session.user.id },
    data: {
      idType:     data.idType,
      idNumber:   data.idNumber,
      idFrontUrl: data.idFrontUrl,
      idBackUrl:  data.idBackUrl,
    },
  });

  // 2. Upsert online check-in record
  await prisma.onlineCheckin.upsert({
    where: { bookingId: booking.id },
    create: {
      bookingId:            booking.id,
      guestId:              session.user.id,
      comingFrom:           data.comingFrom,
      goingTo:              data.goingTo,
      purpose:              data.purpose,
      vehicleNo:            data.vehicleNo,
      expectedCheckInTime:  data.expectedCheckInTime,
      expectedCheckOutTime: data.expectedCheckOutTime,
      completedAt:          new Date(),
    },
    update: {
      comingFrom:           data.comingFrom,
      goingTo:              data.goingTo,
      purpose:              data.purpose,
      vehicleNo:            data.vehicleNo,
      expectedCheckInTime:  data.expectedCheckInTime,
      expectedCheckOutTime: data.expectedCheckOutTime,
      completedAt:          new Date(),
    },
  });

  // 3. Remove old companions
  await prisma.bookingCompanion.deleteMany({ where: { bookingId: booking.id } });

  // 4. For each companion: upsert Guest record, then link via BookingCompanion
  const companions = (data.companions ?? []).filter(c => c.name?.trim());
  for (const c of companions) {
    let guestId: string | undefined;

    if (c.idNumber?.trim()) {
      const existing = await prisma.guest.findFirst({
        where: { idNumber: c.idNumber },
        select: { id: true },
      });

      if (existing) {
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

  // 5. Mark online check-in complete on the booking
  await prisma.booking.update({
    where: { id: booking.id },
    data: { onlineCheckinDone: true },
  });

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
