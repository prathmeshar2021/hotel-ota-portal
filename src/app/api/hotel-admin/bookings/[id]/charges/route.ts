import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";

function staffGuard(role?: string) {
  return role === "HOTEL_ADMIN" || role === "HOTEL_STAFF" || role === "SUPER_ADMIN";
}

const AddChargeSchema = z.object({
  chargeType: z.string().min(1, "Charge type is required"),
  description: z.string().optional(),
  quantity: z.number().positive("Quantity must be > 0").default(1),
  // 0 is valid — a complimentary juice is still worth recording, so the item
  // shows on the guest's bill at no charge rather than going unlogged.
  unitPrice: z.number().min(0, "Price can't be negative"),
  // How the guest is settling it. DEPOSIT leaves it on the tab to be offset
  // against the refundable deposit at checkout (the usual case); CASH/ONLINE
  // mean they paid at the counter there and then.
  settlement: z.enum(["DEPOSIT", "CASH", "ONLINE"]).default("DEPOSIT"),
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

  const { chargeType, description, quantity, unitPrice, settlement } = parsed.data;
  const amount = Math.round(quantity * unitPrice * 100) / 100; // round to 2 dp
  const paidNow = settlement !== "DEPOSIT";

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
        mode: paidNow && settlement === "ONLINE" ? "ONLINE" : "CASH",
        paidNow,
      },
    }),
    // Only an unpaid charge accrues into additionalCharges. That figure is what
    // checkout offsets against the deposit, so anything already paid for must
    // stay out of it or the guest would be charged for it twice.
    ...(paidNow
      ? []
      : [
          prisma.booking.update({
            where: { id },
            data: { additionalCharges: { increment: amount } },
          }),
        ]),
  ]);

  return NextResponse.json(
    {
      ...charge,
      message: paidNow
        ? `₹${amount} collected in ${settlement === "ONLINE" ? "UPI" : "cash"}`
        : `₹${amount} added — will come off the deposit at checkout`,
    },
    { status: 201 }
  );
}
