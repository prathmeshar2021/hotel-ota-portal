import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";

type IdTypeEnum = "AADHAR" | "DRIVING_LICENSE" | "PASSPORT" | "VOTER_ID" | "OTHER";

const Schema = z.object({
  name:       z.string().trim().min(1, "Guest name is required"),
  relation:   z.string().trim().max(60).optional(),
  phone:      z.string().optional(),
  email:      z.string().optional(),
  idType:     z.enum(["AADHAR", "DRIVING_LICENSE", "PASSPORT", "VOTER_ID", "OTHER"]).optional(),
  idNumber:   z.string().trim().min(1, "ID number is required"),
  idFrontUrl: z.string().url("ID front photo is required"),
  idBackUrl:  z.string().url("ID back photo is required"),
});

/**
 * POST → register one more guest on a stay that's already under way.
 *
 * Parties grow after check-in: someone joins, or a booking taken over the phone
 * turns out to be two people. Raising the guest count is only half the job —
 * the law still wants ID for everyone staying, so this captures the same
 * details the check-in form does, one guest at a time.
 *
 * Like check-in, the person is stored as a full Guest record so they're
 * searchable and auto-fill on a future visit, not just a row on this booking.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.hotelId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "HOTEL_ADMIN" && session.user.role !== "HOTEL_STAFF" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const parsed = Schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid details" }, { status: 400 });
  }
  const c = parsed.data;

  const booking = await prisma.booking.findFirst({
    where: { id, hotelId: session.user.hotelId },
    select: {
      id: true, status: true, noOfPersons: true,
      _count: { select: { companions: true } },
    },
  });
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  if (booking.status === "CANCELLED" || booking.status === "CHECKED_OUT") {
    return NextResponse.json(
      { error: "This stay is already closed — guests can't be added." },
      { status: 400 }
    );
  }

  // The booking says how many people are staying; registering more than that
  // means the count wasn't raised first.
  const registered = booking._count.companions + 1; // companions + primary guest
  if (registered >= booking.noOfPersons) {
    return NextResponse.json(
      {
        error: `This booking is for ${booking.noOfPersons} guest${booking.noOfPersons !== 1 ? "s" : ""} and all are registered. Raise the guest count first.`,
      },
      { status: 409 }
    );
  }

  const phone = c.phone ? c.phone.replace(/\D/g, "").slice(-10) : "";
  const email = c.email ? c.email.trim().toLowerCase() : "";

  // Same matching as check-in: ID number first (most reliable), then phone.
  let existing = await prisma.guest.findFirst({
    where: { idNumber: c.idNumber }, select: { id: true },
  });
  if (!existing && phone.length === 10) {
    existing = await prisma.guest.findFirst({ where: { phone }, select: { id: true } });
  }

  // phone/email are @unique — only write them when free, so a shared contact
  // can never abort registering a guest who is standing at the desk.
  const phoneFree = phone.length === 10
    ? !(await prisma.guest.findFirst({
        where: { phone, ...(existing ? { NOT: { id: existing.id } } : {}) }, select: { id: true },
      }))
    : false;
  const emailFree = email
    ? !(await prisma.guest.findFirst({
        where: { email, ...(existing ? { NOT: { id: existing.id } } : {}) }, select: { id: true },
      }))
    : false;

  const guestData = {
    name:       c.name,
    idType:     c.idType as IdTypeEnum | undefined,
    idNumber:   c.idNumber,
    idFrontUrl: c.idFrontUrl,
    idBackUrl:  c.idBackUrl,
    ...(phoneFree ? { phone } : {}),
    ...(emailFree ? { email } : {}),
  };

  const guestId = existing
    ? (await prisma.guest.update({ where: { id: existing.id }, data: guestData })).id
    : (await prisma.guest.create({ data: guestData })).id;

  await prisma.bookingCompanion.create({
    data: {
      bookingId:  booking.id,
      guestId,
      name:       c.name,
      relation:   c.relation || undefined,
      idType:     c.idType as IdTypeEnum | undefined,
      idNumber:   c.idNumber,
      idFrontUrl: c.idFrontUrl,
      idBackUrl:  c.idBackUrl,
    },
  });

  const nowRegistered = registered + 1;
  return NextResponse.json({
    success: true,
    registered: nowRegistered,
    pending: Math.max(0, booking.noOfPersons - nowRegistered),
    message: `${c.name} added${booking.noOfPersons - nowRegistered > 0 ? ` · ${booking.noOfPersons - nowRegistered} still to register` : ""}`,
  }, { status: 201 });
}
