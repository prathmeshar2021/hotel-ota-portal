import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";

const Schema = z.object({
  noOfPersons: z.number().int().min(1).max(10),
});

/**
 * PATCH → change how many guests a booking is for.
 *
 * A phone booking is often taken before the count is known, and parties change
 * on arrival, so this stays editable right up to check-out. It only moves the
 * headcount: the rate is not re-derived, because the price staff agreed doesn't
 * automatically change when one more person turns up — that's a separate,
 * deliberate re-price.
 */
export async function PATCH(
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
    return NextResponse.json({ error: "Guests must be between 1 and 10" }, { status: 400 });
  }

  const booking = await prisma.booking.findFirst({
    where: { id, hotelId: session.user.hotelId },
    select: {
      id: true, status: true, noOfPersons: true,
      room: { select: { capacity: true, roomNumber: true } },
      _count: { select: { companions: true } },
    },
  });
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  if (booking.status === "CANCELLED" || booking.status === "CHECKED_OUT") {
    return NextResponse.json(
      { error: "This stay is already closed — the guest count can't be changed." },
      { status: 400 }
    );
  }

  const next = parsed.data.noOfPersons;

  // Companions are already registered against this booking; dropping below that
  // would leave people checked in who the booking says aren't there.
  const registered = booking._count.companions + 1; // companions + primary guest
  if (next < registered) {
    return NextResponse.json(
      { error: `${registered} guests are already registered on this booking — remove a companion first.` },
      { status: 409 }
    );
  }

  await prisma.booking.update({ where: { id }, data: { noOfPersons: next } });

  // Over capacity is allowed (an extra mattress is normal) but worth saying.
  const capacity = booking.room?.capacity ?? 0;
  const overCapacity = capacity > 0 && next > capacity;

  return NextResponse.json({
    success: true,
    noOfPersons: next,
    overCapacity,
    message: overCapacity
      ? `Updated to ${next} guests — above Room ${booking.room?.roomNumber}'s capacity of ${capacity}.`
      : `Updated to ${next} guest${next !== 1 ? "s" : ""}`,
  });
}
