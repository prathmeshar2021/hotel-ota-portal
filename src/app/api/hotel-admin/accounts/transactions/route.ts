import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, subMonths, differenceInDays } from "date-fns";
import { getCategoryMeta } from "@/lib/utils/room-categories";
import { ledgerRowToItem, type TransactionItem } from "@/lib/services/accounts-statement";
import { OTA_PREPAID_SOURCES } from "@/lib/ota/sources";

const MAX_RANGE_DAYS = 180;

// Re-exported so existing `import type … from "…/transactions/route"` keeps working.
export type { TxType, TransactionItem } from "@/lib/services/accounts-statement";

export async function GET(req: NextRequest) {
  try {
  const session = await auth();
  if (!session?.user?.hotelId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "HOTEL_ADMIN" && session.user.role !== "HOTEL_STAFF" && session.user.role !== "SUPER_ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const hotelId = session.user.hotelId;
  const { searchParams } = new URL(req.url);

  const mode = searchParams.get("mode") ?? "all"; // all | cash | online
  const range = searchParams.get("range") ?? "month"; // today | week | month | custom
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  // Resolve date range
  const now = new Date();
  let fromDate: Date;
  let toDate: Date = endOfDay(now);

  if (range === "today") {
    fromDate = startOfDay(now);
  } else if (range === "week") {
    fromDate = startOfDay(subDays(now, 6));
  } else if (range === "lastmonth") {
    fromDate = startOfMonth(subMonths(now, 1));
    toDate = endOfMonth(subMonths(now, 1));
  } else if (range === "custom" && fromParam && toParam) {
    const reqFrom = startOfDay(new Date(fromParam));
    const reqTo = endOfDay(new Date(toParam));
    if (differenceInDays(reqTo, reqFrom) > MAX_RANGE_DAYS) {
      return NextResponse.json(
        { error: `Date range too large. Maximum allowed is ${MAX_RANGE_DAYS} days (6 months).` },
        { status: 400 }
      );
    }
    fromDate = reqFrom;
    toDate = reqTo;
  } else {
    // default: this month
    fromDate = startOfMonth(now);
  }

  const [txns, pending, collections, expenses] = await Promise.all([
    // Every movement of guest money, on the date it moved.
    prisma.bookingTxn.findMany({
      where: {
        hotelId,
        occurredAt: { gte: fromDate, lte: toDate },
        // The refundable deposit merely passing through is the guest's money,
        // not the hotel's takings, so it is marked out of the statement at the
        // point it is written. It still shows on the booking's own account.
        affectsStatement: true,
        // OTA-prepaid bookings are paid to the channel, not the hotel — they
        // live in the GoMMT finance view, not the hotel's own statement.
        booking: { source: { notIn: OTA_PREPAID_SOURCES } },
      },
      select: {
        id: true, kind: true, direction: true, mode: true, amount: true, note: true,
        occurredAt: true, flagged: true, flagReason: true,
        booking: {
          select: {
            bookingRef: true, noOfNights: true, roomCategory: true,
            room: { select: { roomNumber: true } },
            primaryGuest: { select: { name: true } },
          },
        },
      },
      orderBy: { occurredAt: "desc" },
    }),

    // Bookings created in the window with nothing collected yet — shown as an
    // expected receivable, never counted as income.
    prisma.booking.findMany({
      where: {
        hotelId,
        createdAt: { gte: fromDate, lte: toDate },
        source: { notIn: OTA_PREPAID_SOURCES },
        status: { notIn: ["CANCELLED"] },
        cashPaid: 0,
        onlinePaid: 0,
        totalAmount: { gt: 0 },
      },
      select: {
        id: true, bookingRef: true, totalAmount: true, noOfNights: true,
        createdAt: true, roomCategory: true,
        room: { select: { roomNumber: true } },
        primaryGuest: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),

    prisma.cashCollection.findMany({
      where: { hotelId, createdAt: { gte: fromDate, lte: toDate } },
      orderBy: { createdAt: "desc" },
    }),

    prisma.hotelExpense.findMany({
      where: { hotelId, expenseDate: { gte: fromDate, lte: toDate } },
      orderBy: { expenseDate: "desc" },
    }),
  ]);

  const txList: TransactionItem[] = txns.map(ledgerRowToItem);

  for (const b of pending) {
    const catLabel = getCategoryMeta(b.roomCategory).displayName;
    txList.push({
      id: `${b.id}-pah`,
      date: b.createdAt.toISOString(),
      type: "BOOKING_PAY_AT_HOTEL",
      description: `Booking — ${b.room ? `${catLabel} #${b.room.roomNumber}` : catLabel}`,
      subDescription: `${b.noOfNights} night${b.noOfNights !== 1 ? "s" : ""}`,
      guestName: b.primaryGuest.name,
      bookingRef: b.bookingRef,
      mode: "CASH",            // expected to be collected as cash at hotel
      amount: b.totalAmount,
      isDebit: false,
    });
  }

  for (const col of collections) {
    txList.push({
      id: `col-${col.id}`,
      date: col.createdAt.toISOString(),
      type: "CASH_COLLECTION",
      description: "Cash collected by owner",
      subDescription: col.note ?? "",
      guestName: col.collectedBy ?? null,
      bookingRef: null,
      mode: "CASH",
      amount: col.amount,
      isDebit: true,
    });
  }

  for (const e of expenses) {
    txList.push({
      id: `exp-${e.id}`,
      date: e.expenseDate.toISOString(),
      type: e.entryType === "DEBIT" ? "EXPENSE_DEBIT" : "EXPENSE_CREDIT",
      description: e.category,
      subDescription: e.description ?? "",
      guestName: e.addedBy,
      bookingRef: null,
      mode: e.mode as "CASH" | "ONLINE" | "MIXED",
      amount: e.amount,
      isDebit: e.entryType === "DEBIT",
    });
  }

  // Sort by date descending
  txList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Apply mode filter. Deposit-settled rows are neither cash nor online — no
  // money crossed the counter — so they only appear in the unfiltered view.
  const filtered = mode === "cash"
    ? txList.filter(t => t.mode === "CASH" || t.type === "CASH_COLLECTION")
    : mode === "online"
    ? txList.filter(t => t.mode === "ONLINE")
    : txList;

  // Compute totals — exclude BOOKING_PAY_AT_HOTEL from credits (not yet collected)
  const credits = filtered
    .filter(t => !t.isDebit && t.type !== "BOOKING_PAY_AT_HOTEL")
    .reduce((s, t) => s + t.amount, 0);
  const debits = filtered.filter(t => t.isDebit).reduce((s, t) => s + t.amount, 0);

  return NextResponse.json({
    transactions: filtered,
    totals: { credits, debits, net: credits - debits },
    dateRange: { from: fromDate.toISOString(), to: toDate.toISOString() },
  });
  } catch (err) {
    console.error("[Accounts/Transactions] Error:", err);
    return NextResponse.json(
      { error: String(err instanceof Error ? err.message : err) },
      { status: 500 }
    );
  }
}
