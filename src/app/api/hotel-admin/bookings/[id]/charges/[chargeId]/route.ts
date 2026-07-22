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
    select: { id: true, amount: true },
  });

  if (!charge) {
    return NextResponse.json({ error: "Charge not found" }, { status: 404 });
  }

  // Delete the charge and reverse booking totals in a transaction
  await prisma.$transaction([
    prisma.additionalCharge.delete({ where: { id: chargeId } }),
    prisma.booking.update({
      where: { id: bookingId },
      data: {
        totalAmount: { decrement: charge.amount },
        balanceDue:  { decrement: charge.amount },
      },
    }),
  ]);

  return NextResponse.json({ success: true });
}
