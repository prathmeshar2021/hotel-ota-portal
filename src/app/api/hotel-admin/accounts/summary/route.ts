import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { startOfDay, startOfMonth } from "date-fns";
import { OTA_PREPAID_SOURCES } from "@/lib/ota/sources";

export async function GET() {
  try {
  const session = await auth();
  if (!session?.user?.hotelId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "HOTEL_ADMIN" && session.user.role !== "HOTEL_STAFF" && session.user.role !== "SUPER_ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const hotelId = session.user.hotelId;
  const todayStart = startOfDay(new Date());
  const monthStart = startOfMonth(new Date());

  const [
    bookingAgg,
    cashChargeAgg,
    onlineChargeAgg,
    collectionAgg,
    pendingAgg,
    todayBookingAgg,
    todayCashChargeAgg,
    lastCollection,
    cancellationAgg,
    damageAgg,
    cashExpenseAgg,       // all-time cash expenses → for Cash in Hand formula
    cashCreditAgg,        // all-time cash credits  → for Cash in Hand formula
    // Monthly figures for the revenue & expense cards
    monthBookingAgg,
    monthCashChargeAgg,
    monthOnlineChargeAgg,
    monthExpenseAgg,
  ] = await Promise.all([
    prisma.booking.aggregate({ where: { hotelId, source: { notIn: OTA_PREPAID_SOURCES } }, _sum: { cashPaid: true, onlinePaid: true } }),
    prisma.additionalCharge.aggregate({ where: { booking: { hotelId, source: { notIn: OTA_PREPAID_SOURCES } }, mode: "CASH" }, _sum: { amount: true } }),
    prisma.additionalCharge.aggregate({ where: { booking: { hotelId, source: { notIn: OTA_PREPAID_SOURCES } }, mode: "ONLINE" }, _sum: { amount: true } }),
    prisma.cashCollection.aggregate({ where: { hotelId }, _sum: { amount: true } }),
    prisma.booking.aggregate({
      where: { hotelId, status: { in: ["CONFIRMED", "CHECKED_IN"] }, source: { notIn: OTA_PREPAID_SOURCES } },
      _sum: { balanceDue: true }, _count: { _all: true },
    }),
    prisma.booking.aggregate({ where: { hotelId, createdAt: { gte: todayStart }, source: { notIn: OTA_PREPAID_SOURCES } }, _sum: { cashPaid: true, onlinePaid: true } }),
    prisma.additionalCharge.aggregate({ where: { booking: { hotelId, source: { notIn: OTA_PREPAID_SOURCES } }, addedAt: { gte: todayStart }, mode: "CASH" }, _sum: { amount: true } }),
    prisma.cashCollection.findFirst({ where: { hotelId }, orderBy: { createdAt: "desc" } }),
    prisma.booking.aggregate({ where: { hotelId, status: "CANCELLED", cancellationCharge: { gt: 0 }, source: { notIn: OTA_PREPAID_SOURCES } }, _sum: { cancellationCharge: true } }),
    prisma.booking.aggregate({ where: { hotelId, status: "CHECKED_OUT", depositDeducted: { gt: 0 }, source: { notIn: OTA_PREPAID_SOURCES } }, _sum: { depositDeducted: true } }),
    // All-time cash expenses (debits paid in cash) — used for Cash in Hand
    prisma.hotelExpense.aggregate({ where: { hotelId, entryType: "DEBIT", mode: "CASH" }, _sum: { amount: true } }),
    // All-time cash credits — used for Cash in Hand
    prisma.hotelExpense.aggregate({ where: { hotelId, entryType: "CREDIT", mode: "CASH" }, _sum: { amount: true } }),
    // This month's bookings revenue
    prisma.booking.aggregate({ where: { hotelId, createdAt: { gte: monthStart }, source: { notIn: OTA_PREPAID_SOURCES } }, _sum: { cashPaid: true, onlinePaid: true } }),
    // This month's additional charges — cash
    prisma.additionalCharge.aggregate({ where: { booking: { hotelId, source: { notIn: OTA_PREPAID_SOURCES } }, addedAt: { gte: monthStart }, mode: "CASH" }, _sum: { amount: true } }),
    // This month's additional charges — online
    prisma.additionalCharge.aggregate({ where: { booking: { hotelId, source: { notIn: OTA_PREPAID_SOURCES } }, addedAt: { gte: monthStart }, mode: "ONLINE" }, _sum: { amount: true } }),
    // This month's ledger expenses (any mode)
    prisma.hotelExpense.aggregate({ where: { hotelId, entryType: "DEBIT", expenseDate: { gte: monthStart } }, _sum: { amount: true } }),
  ]);

  const cashFromBookings = bookingAgg._sum.cashPaid ?? 0;
  const onlineFromBookings = bookingAgg._sum.onlinePaid ?? 0;
  const cashFromCharges = cashChargeAgg._sum.amount ?? 0;
  const onlineFromCharges = onlineChargeAgg._sum.amount ?? 0;
  const totalCollected = collectionAgg._sum.amount ?? 0;
  const cancellationRevenue = cancellationAgg._sum.cancellationCharge ?? 0;
  const damageRevenue = damageAgg._sum.depositDeducted ?? 0;
  const cashExpenses = cashExpenseAgg._sum.amount ?? 0;
  const cashCredits = cashCreditAgg._sum.amount ?? 0;

  // Cash in Hand — all-time formula (unchanged)
  const cashInHand = cashFromBookings + cashFromCharges + cashCredits - cashExpenses - totalCollected;
  const onlineTotal = onlineFromBookings + onlineFromCharges;

  // This month's revenue card
  const totalRevenue =
    (monthBookingAgg._sum.cashPaid ?? 0) + (monthBookingAgg._sum.onlinePaid ?? 0)
    + (monthCashChargeAgg._sum.amount ?? 0) + (monthOnlineChargeAgg._sum.amount ?? 0)
    + cancellationRevenue + damageRevenue; // cancellation/damage included (filtered by status, not date)

  // This month's expenses card
  const totalExpenses = monthExpenseAgg._sum.amount ?? 0;

  const pendingDue = pendingAgg._sum.balanceDue ?? 0;
  const pendingCount = pendingAgg._count._all;

  const todayCash = (todayBookingAgg._sum.cashPaid ?? 0) + (todayCashChargeAgg._sum.amount ?? 0);
  const todayOnline = todayBookingAgg._sum.onlinePaid ?? 0;

  return NextResponse.json({
    cashInHand,
    onlineTotal,
    totalRevenue,
    totalExpenses,
    pendingDue,
    pendingCount,
    todayCash,
    todayOnline,
    totalCollectedByOwner: totalCollected,
    lastCollection: lastCollection
      ? { amount: lastCollection.amount, note: lastCollection.note, createdAt: lastCollection.createdAt }
      : null,
  });
  } catch (err) {
    console.error("[Accounts/Summary] Error:", err);
    return NextResponse.json(
      { error: String(err instanceof Error ? err.message : err) },
      { status: 500 }
    );
  }
}
