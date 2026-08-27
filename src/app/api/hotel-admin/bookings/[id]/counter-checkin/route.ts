import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { syncDepositTaken } from "@/lib/services/booking-ledger";
import { z } from "zod";
import { ensureRoomAssigned } from "@/lib/services/checkin-gate";
import { ensureConsent } from "@/lib/services/consent";

const CompanionSchema = z.object({
  name:       z.string().min(1, "Companion name is required"),
  relation:   z.string().optional(),
  phone:      z.string().optional(),
  email:      z.string().optional(),
  idType:     z.string().optional(),
  idNumber:   z.string().min(1, "Companion ID number is required"),
  idFrontUrl: z.string().url("Companion ID front photo is required"),
  idBackUrl:  z.string().url("Companion ID back photo is required"),
});

const CounterCheckinSchema = z.object({
  name:       z.string().min(1).optional(),
  idType:     z.enum(["AADHAR", "DRIVING_LICENSE", "PASSPORT", "VOTER_ID", "OTHER"]),
  idNumber:   z.string().min(1, "Primary guest ID number is required"),
  idFrontUrl: z.string().url("Primary guest ID front photo is required"),
  idBackUrl:  z.string().url("Primary guest ID back photo is required"),
  comingFrom: z.string().min(1, "Coming from is required"),
  goingTo:    z.string().min(1, "Going to is required"),
  purpose:    z.string().min(1, "Purpose of visit is required"),
  vehicleNo:  z.string().optional(),
  // Refundable deposit collected at check-in (editable, may be 0 / skipped).
  depositCollected: z.number().min(0).optional(),
  depositMode:      z.enum(["CASH", "ONLINE"]).optional(),
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
  if (session.user.role !== "HOTEL_ADMIN" && session.user.role !== "HOTEL_STAFF" && session.user.role !== "SUPER_ADMIN") {
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
    select: {
      id: true, roomId: true, primaryGuestId: true, noOfPersons: true,
      roomCategory: true, checkInDate: true, checkOutDate: true,
      // Set once the guest paid the deposit through the WhatsApp link.
      depositPaymentId: true,
    },
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
      ...(data.name ? { name: data.name } : {}),
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
      expectedCheckOutTime:  "10:00",
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

  // 4. For each companion: upsert a full Guest record (so they're searchable and
  //    auto-fill on a future visit), then create the BookingCompanion linked to it.
  const validCompanions = (data.companions ?? []).filter(c => c.name.trim());
  for (const c of validCompanions) {
    const phone = c.phone ? c.phone.replace(/\D/g, "") : "";        // store digits
    const email = c.email ? c.email.trim().toLowerCase() : "";

    // Match an existing guest by ID number first (most reliable), then by phone.
    let existing = await prisma.guest.findFirst({
      where: { idNumber: c.idNumber },
      select: { id: true },
    });
    if (!existing && phone) {
      existing = await prisma.guest.findFirst({ where: { phone }, select: { id: true } });
    }

    // phone/email are @unique — only write them if free (or already this guest's),
    // so a shared/duplicate contact never aborts the whole check-in.
    const phoneFree = phone
      ? !(await prisma.guest.findFirst({
          where: { phone, ...(existing ? { NOT: { id: existing.id } } : {}) },
          select: { id: true },
        }))
      : false;
    const emailFree = email
      ? !(await prisma.guest.findFirst({
          where: { email, ...(existing ? { NOT: { id: existing.id } } : {}) },
          select: { id: true },
        }))
      : false;

    const guestData = {
      name:       c.name,
      idType:     c.idType as IdTypeEnum | undefined,
      idNumber:   c.idNumber,
      idFrontUrl: c.idFrontUrl || undefined,
      idBackUrl:  c.idBackUrl  || undefined,
      ...(phoneFree ? { phone } : {}),
      ...(emailFree ? { email } : {}),
    };

    const guestId = existing
      ? (await prisma.guest.update({ where: { id: existing.id }, data: guestData })).id
      : (await prisma.guest.create({ data: guestData })).id;

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

  // 5. Save the registration (travel details + companions above) and record the
  //    refundable deposit if collected at the counter. This does NOT complete the
  //    check-in — a stay is only CHECKED_IN once a room is assigned AND the
  //    consent form is signed/accepted, via the gated "Complete Check-In" action.
  // A deposit already paid online owns its own record — the form's defaults
  // (₹200 / CASH) must not overwrite it and lose the fact it can be refunded
  // straight back to the guest's account.
  const paidOnline = !!booking.depositPaymentId;
  const depositTaken =
    !paidOnline && typeof data.depositCollected === "number" && data.depositCollected > 0;
  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      onlineCheckinDone: true,
      ...(depositTaken ? { depositCollected: data.depositCollected, depositMode: data.depositMode ?? "CASH" } : {}),
    },
  });

  // Put it on the booking's account too, so the desk can see what is being
  // held. Taking and returning the same amount cancels out and never reaches
  // the hotel's statement.
  if (depositTaken) {
    await syncDepositTaken({
      hotelId: session.user.hotelId,
      bookingId: booking.id,
      depositCollected: data.depositCollected!,
      depositMode: data.depositMode ?? "CASH",
      recordedBy: session.user.name ?? session.user.email ?? "Staff",
    });
  }

  // 6. Assign a physical room now (auto-allot fallback) so it's ready for the
  //    consent form and the final check-in step.
  const roomId = await ensureRoomAssigned({
    id: booking.id,
    hotelId: session.user.hotelId,
    roomId: booking.roomId,
    roomCategory: booking.roomCategory,
    checkInDate: booking.checkInDate,
    checkOutDate: booking.checkOutDate,
  });

  // 7. Ensure a consent record + token exists so staff can immediately print or
  //    send the registration & consent form.
  await ensureConsent(booking.id);

  const roomMsg = roomId
    ? "Room assigned."
    : "No room could be auto-assigned — please assign one manually.";
  return NextResponse.json({
    success: true,
    completed: false,
    message: `Registration saved. ${roomMsg} Get the consent form signed or accepted, then click "Complete Check-In".`,
  });
}
