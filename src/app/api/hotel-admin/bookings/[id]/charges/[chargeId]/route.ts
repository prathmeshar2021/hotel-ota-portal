import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

function staffGuard(role?: string) {
  return role === "HOTEL_ADMIN" || role === "HOTEL_STAFF" || role === "SUPER_ADMIN";
}

interface Params { id: string; chargeId: string }

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const session = await auth();
  if (!session?.user?.hotelId || !staffGuard(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: bookingId, chargeId } = await params;

  // Make sure the charge belongs to a booking in this hotel
  const charge = await prisma.additionalCharge.findFirst({
    where: {
      id: chargeId,
      bookingId,
      booking: { hotelId: session.user.hotelId },
    },
    select: { id: true, amount: true, paidNow: true },
  });

  if (!charge) {
    return NextResponse.json({ error: "Charge not found" }, { status: 404 });
  }

  // Reverse exactly what adding it applied. Charges accrue into
  // additionalCharges, never into the room total — decrementing totalAmount and
  // balanceDue here (as this used to) shrank the room bill by the price of a
  // water bottle and left additionalCharges overstated.
  // A charge the guest already paid for never touched the booking at all.
  await prisma.$transaction([
    prisma.additionalCharge.delete({ where: { id: chargeId } }),
    ...(charge.paidNow
      ? []
      : [
          prisma.booking.update({
            where: { id: bookingId },
            data: { additionalCharges: { decrement: charge.amount } },
          }),
        ]),
  ]);

  return NextResponse.json({ success: true });
}
