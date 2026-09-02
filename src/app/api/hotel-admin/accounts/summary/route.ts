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

  // Every figure below that concerns guest money reads the BookingTxn ledger,
  // the same source the statement itself uses — so a total on a card and the
  // rows it summarises can never disagree. The refundable deposit is not in the
  // ledger while the hotel merely holds it, which is deliberate: it is the
  // guest's money until it is applied to a bill or withheld for damage, and
  // only then does it show up (as DEPOSIT_APPLIED / DEPOSIT_WITHHELD).
  const guestMoney = { hotelId, booking: { source: { notIn: OTA_PREPAID_SOURCES } } };

  // Money in and money out, judged by the direction stored on the entry rather
  // than by its kind. Kind was the old test, from before entries carried a
  // direction, and it counted the refundable deposit as income — it is neither
  // a receipt on the way in nor a loss on the way out, so `affectsStatement`
  // keeps both sides of it away from these figures entirely.
  const moneyIn  = { ...guestMoney, affectsStatement: true, direction: "CREDIT" as const };
  const moneyOut = { ...guestMoney, affectsStatement: true, direction: "DEBIT" as const };

  const [
    drawerAgg,            // all-time signed cash effect of guest money
    heldDepositAgg,       // cash deposits sitting in the drawer that aren't ours
    onlineAgg,            // all-time online receipts
    refundOnlineAgg,      // all-time online refunds
    collectionAgg,
    pendingAgg,
    todayDrawerAgg,
    todayOnlineAgg,
    todayRefundOnlineAgg,
    lastCollection,
    cashExpenseAgg,       // all-time cash expenses → for Cash in Hand formula
    cashCreditAgg,        // all-time cash credits  → for Cash in Hand formula
    monthCreditAgg,       // this month's guest receipts
    monthRefundAgg,       // this month's refunds
    monthExpenseAgg,
  ] = await Promise.all([
    prisma.bookingTxn.aggregate({ where: guestMoney, _sum: { cashImpact: true } }),
    // Cash deposits still being held. Not the hotel's money, so it is outside
    // Cash in Hand — but it IS physically in the drawer, so the owner needs it
    // to reconcile a count against the panel.
    prisma.booking.aggregate({
      where: {
        hotelId, source: { notIn: OTA_PREPAID_SOURCES },
        depositMode: "CASH",
        status: { in: ["CONFIRMED", "CHECKED_IN"] },
        depositCollected: { gt: 0 },
      },
      _sum: { depositCollected: true, depositDeducted: true },
    }),
    prisma.bookingTxn.aggregate({ where: { ...moneyIn, mode: "ONLINE" }, _sum: { amount: true } }),
    prisma.bookingTxn.aggregate({ where: { ...moneyOut, mode: "ONLINE" }, _sum: { amount: true } }),
    prisma.cashCollection.aggregate({ where: { hotelId }, _sum: { amount: true } }),
    prisma.booking.aggregate({
      where: { hotelId, status: { in: ["CONFIRMED", "CHECKED_IN"] }, source: { notIn: OTA_PREPAID_SOURCES } },
      _sum: { balanceDue: true }, _count: { _all: true },
    }),
    prisma.bookingTxn.aggregate({ where: { ...guestMoney, occurredAt: { gte: todayStart } }, _sum: { cashImpact: true } }),
    prisma.bookingTxn.aggregate({ where: { ...moneyIn, mode: "ONLINE", occurredAt: { gte: todayStart } }, _sum: { amount: true } }),
    prisma.bookingTxn.aggregate({ where: { ...moneyOut, mode: "ONLINE", occurredAt: { gte: todayStart } }, _sum: { amount: true } }),
    prisma.cashCollection.findFirst({ where: { hotelId }, orderBy: { createdAt: "desc" } }),
    // All-time cash expenses (debits paid in cash) — used for Cash in Hand
    prisma.hotelExpense.aggregate({ where: { hotelId, entryType: "DEBIT", mode: "CASH" }, _sum: { amount: true } }),
    // All-time cash credits — used for Cash in Hand
    prisma.hotelExpense.aggregate({ where: { hotelId, entryType: "CREDIT", mode: "CASH" }, _sum: { amount: true } }),
    prisma.bookingTxn.aggregate({ where: { ...moneyIn, occurredAt: { gte: monthStart } }, _sum: { amount: true } }),
    prisma.bookingTxn.aggregate({ where: { ...moneyOut, occurredAt: { gte: monthStart } }, _sum: { amount: true } }),
    // This month's ledger expenses (any mode)
    prisma.hotelExpense.aggregate({ where: { hotelId, entryType: "DEBIT", expenseDate: { gte: monthStart } }, _sum: { amount: true } }),
  ]);

  const totalCollected = collectionAgg._sum.amount ?? 0;
  const cashExpenses = cashExpenseAgg._sum.amount ?? 0;
  const cashCredits = cashCreditAgg._sum.amount ?? 0;

  // Cash in Hand — what should physically be in the drawer. cashImpact already
  // nets refunds handed back over the counter, and counts deposit money only
  // once it has become the hotel's.
  const cashInHand =
    (drawerAgg._sum.cashImpact ?? 0) + cashCredits - cashExpenses - totalCollected;
  const onlineTotal = (onlineAgg._sum.amount ?? 0) - (refundOnlineAgg._sum.amount ?? 0);

  // This month's revenue card — receipts less anything refunded.
  const totalRevenue = (monthCreditAgg._sum.amount ?? 0) - (monthRefundAgg._sum.amount ?? 0);

  // This month's expenses card
  const totalExpenses = monthExpenseAgg._sum.amount ?? 0;

  const pendingDue = pendingAgg._sum.balanceDue ?? 0;
  const pendingCount = pendingAgg._count._all;

  const depositsHeldInCash = +Math.max(
    0,
    (heldDepositAgg._sum.depositCollected ?? 0) - (heldDepositAgg._sum.depositDeducted ?? 0)
  ).toFixed(2);

  const todayCash = todayDrawerAgg._sum.cashImpact ?? 0;
  const todayOnline = (todayOnlineAgg._sum.amount ?? 0) - (todayRefundOnlineAgg._sum.amount ?? 0);

  return NextResponse.json({
    cashInHand,
    depositsHeldInCash,
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
