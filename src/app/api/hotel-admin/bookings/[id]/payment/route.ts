import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";
import { postSplit } from "@/lib/services/booking-ledger";

const CollectSchema = z.object({
  amount: z.number().positive("Amount must be greater than 0"),
  mode: z.enum(["CASH", "ONLINE", "MIXED"]),
  /** For MIXED: how much of the amount came in as cash. The rest is UPI. */
  cashAmount: z.number().min(0).optional(),
  notes: z.string().optional(),
});

interface Params { id: string }

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const session = await auth();
  if (!session?.user?.hotelId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "HOTEL_ADMIN" && session.user.role !== "HOTEL_STAFF" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const booking = await prisma.booking.findFirst({
    where: { id, hotelId: session.user.hotelId },
    include: { payment: true },
  });

  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if (booking.balanceDue <= 0) {
    return NextResponse.json({ error: "No balance due on this booking" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = CollectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { amount, mode, notes } = parsed.data;

  // Clamp: can't collect more than what's due
  const collected = Math.min(amount, booking.balanceDue);
  const newBalance = Math.max(0, booking.balanceDue - collected);

  // A guest can settle part in notes and part by UPI. Each side is tracked
  // against the method it actually arrived by, so the till stays exact.
  const cashIn = mode === "MIXED"
    ? Math.min(Math.max(0, parsed.data.cashAmount ?? 0), collected)
    : mode === "CASH" ? collected : 0;
  const onlineIn = +(collected - cashIn).toFixed(2);

  const newCashPaid   = +(booking.cashPaid + cashIn).toFixed(2);
  const newOnlinePaid = +(booking.onlinePaid + onlineIn).toFixed(2);
  const totalCash = newCashPaid;
  const totalOnline = newOnlinePaid;
  let updatedMode: "CASH" | "ONLINE" | "MIXED" = "CASH";
  if (totalCash > 0 && totalOnline > 0) updatedMode = "MIXED";
  else if (totalOnline > 0) updatedMode = "ONLINE";
  else updatedMode = "CASH";

  const isFullyPaid = newBalance === 0;
  const collectedBy = session.user.name ?? session.user.email ?? "Staff";
  const timestamp   = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const how = mode === "MIXED"
    ? `₹${cashIn.toLocaleString("en-IN")} in cash and ₹${onlineIn.toLocaleString("en-IN")} via UPI/Card`
    : mode === "CASH" ? "in cash" : "via UPI/Card";
  const noteEntry   = `[${timestamp}] ₹${collected.toLocaleString("en-IN")} collected ${how} by ${collectedBy}${notes ? ` — ${notes}` : ""}`;

  // Collecting payment at the counter confirms a still-pending booking,
  // so it holds inventory and front-desk actions (assign room / check-in) unlock.
  const willConfirm = booking.status === "PENDING_PAYMENT";

  // Update booking amounts
  await prisma.booking.update({
    where: { id },
    data: {
      cashPaid: newCashPaid,
      onlinePaid: newOnlinePaid,
      balanceDue: newBalance,
      ...(willConfirm ? { status: "CONFIRMED" } : {}),
    },
  });

  // Ledger entry — this instalment on its own date, so the accounts statement
  // shows it as its own line rather than folding it into the booking total.
  await postSplit({
    hotelId: session.user.hotelId,
    bookingId: id,
    kind: "ROOM_PAYMENT",
    note: isFullyPaid ? "Balance settled at the counter" : "Part payment at the counter",
    recordedBy: collectedBy,
    cashAmount: cashIn,
    onlineAmount: onlineIn,
  });

  // Upsert payment record
  if (booking.payment) {
    await prisma.payment.update({
      where: { id: booking.payment.id },
      data: {
        amount: booking.payment.amount + collected,
        mode: updatedMode,
        status: isFullyPaid ? "captured" : "partial",
        paidAt: isFullyPaid ? new Date() : booking.payment.paidAt,
        notes: booking.payment.notes
          ? `${booking.payment.notes}\n${noteEntry}`
          : noteEntry,
      },
    });
  } else {
    // Walk-in bookings may not have a Payment row yet
    await prisma.payment.create({
      data: {
        bookingId: id,
        amount: collected,
        mode: updatedMode,
        status: isFullyPaid ? "captured" : "partial",
        paidAt: isFullyPaid ? new Date() : undefined,
        notes: noteEntry,
      },
    });
  }

  return NextResponse.json({
    success: true,
    collected,
    newBalance,
    isFullyPaid,
    confirmed: willConfirm,
    message: isFullyPaid
      ? `₹${collected.toLocaleString("en-IN")} collected — booking ${willConfirm ? "confirmed & " : ""}fully settled`
      : `₹${collected.toLocaleString("en-IN")} collected${willConfirm ? " — booking confirmed" : ""} — ₹${newBalance.toLocaleString("en-IN")} still due`,
  });
}
