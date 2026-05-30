import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";

function staffGuard(role?: string) {
  return role === "HOTEL_ADMIN" || role === "HOTEL_STAFF";
}

const AddChargeSchema = z.object({
  chargeType: z.string().min(1, "Charge type is required"),
  description: z.string().optional(),
  quantity: z.number().positive("Quantity must be > 0").default(1),
  unitPrice: z.number().positive("Unit price must be > 0"),
});

interface Params { id: string }

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const session = await auth();
  if (!session?.user?.hotelId || !staffGuard(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const booking = await prisma.booking.findFirst({
    where: { id, hotelId: session.user.hotelId },
    select: { id: true, status: true, totalAmount: true, balanceDue: true },
  });

  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if (booking.status === "CHECKED_OUT" || booking.status === "CANCELLED") {
    return NextResponse.json(
      { error: "Cannot add charges to a checked-out or cancelled booking" },
      { status: 400 }
    );
  }

  const body = await req.json();
  const parsed = AddChargeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { chargeType, description, quantity, unitPrice } = parsed.data;
  const amount = Math.round(quantity * unitPrice * 100) / 100; // round to 2 dp

  // Create the charge and update booking totals in a transaction
  const [charge] = await prisma.$transaction([
    prisma.additionalCharge.create({
      data: {
        bookingId: id,
        chargeTypes: [chargeType],
        description: description || null,
        quantity,
        unitPrice,
        amount,
        mode: "CASH", // default — collected via CollectPaymentModal at checkout
      },
    }),
    prisma.booking.update({
      where: { id },
      data: {
        totalAmount: { increment: amount },
        balanceDue: { increment: amount },
      },
    }),
  ]);

  return NextResponse.json(charge, { status: 201 });
}
