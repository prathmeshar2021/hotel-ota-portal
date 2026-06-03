import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, subMonths, differenceInDays } from "date-fns";
import { getCategoryMeta } from "@/lib/utils/room-categories";
import { OTA_PREPAID_SOURCES } from "@/lib/ota/sources";

const MAX_RANGE_DAYS = 180;

export type TxType =
  | "BOOKING_CASH"
  | "BOOKING_ONLINE"
  | "BOOKING_PAY_AT_HOTEL"
  | "CHARGE_CASH"
  | "CHARGE_ONLINE"
  | "CHARGE_MIXED"
  | "CANCELLATION_FEE"
  | "DAMAGE_CHARGE"
  | "CASH_COLLECTION"
  | "EXPENSE_DEBIT"
  | "EXPENSE_CREDIT";

export interface TransactionItem {
  id: string;
  date: string;        // ISO string
  type: TxType;
  description: string;
  subDescription: string;
  guestName: string | null;
  bookingRef: string | null;
  mode: "CASH" | "ONLINE" | "MIXED" | "INTERNAL";
  amount: number;
  isDebit: boolean;
}


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

  // Fetch all sources in parallel
  // Note: we query a wider date window (createdAt within range OR event dates within range)
  // by fetching on createdAt range + a lookback window for cancellations/checkouts
  const [bookings, charges, collections, expenses] = await Promise.all([
    prisma.booking.findMany({
      where: {
        hotelId,
        createdAt: { gte: fromDate, lte: toDate },
        // OTA-prepaid bookings are paid to the channel, not the hotel — they
        // live in the GoMMT finance view, not the hotel's own statement.
        source: { notIn: OTA_PREPAID_SOURCES },
      },
      select: {
        id: true,
        bookingRef: true,
        cashPaid: true,
        onlinePaid: true,
        totalAmount: true,
        cancellationCharge: true,
        depositDeducted: true,
        refundableDeposit: true,
        status: true,
        noOfNights: true,
        createdAt: true,
        cancelledAt: true,
        checkedOutAt: true,
        roomCategory: true,
        room: { select: { roomType: true, roomNumber: true } },
        primaryGuest: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),

    prisma.additionalCharge.findMany({
      where: {
        booking: { hotelId, source: { notIn: OTA_PREPAID_SOURCES } },
        addedAt: { gte: fromDate, lte: toDate },
      },
      select: {
        id: true,
        amount: true,
        mode: true,
        description: true,
        chargeTypes: true,
        addedAt: true,
        booking: {
          select: {
            bookingRef: true,
            primaryGuest: { select: { name: true } },
          },
        },
      },
      orderBy: { addedAt: "desc" },
    }),

    prisma.cashCollection.findMany({
      where: {
        hotelId,
        createdAt: { gte: fromDate, lte: toDate },
      },
      orderBy: { createdAt: "desc" },
    }),

    prisma.hotelExpense.findMany({
      where: {
        hotelId,
        expenseDate: { gte: fromDate, lte: toDate },
      },
      orderBy: { expenseDate: "desc" },
    }),
  ]);

  // Build unified transaction list
  const txList: TransactionItem[] = [];

  for (const b of bookings) {
    const catLabel = getCategoryMeta(b.roomCategory).displayName;
    const roomLabel = b.room
      ? `${catLabel} #${b.room.roomNumber}`
      : catLabel;
    const subDesc = `${b.noOfNights} night${b.noOfNights !== 1 ? "s" : ""}`;
    const hasCashOrOnline = b.cashPaid > 0 || b.onlinePaid > 0;

    // Cash payment
    if (b.cashPaid > 0) {
      txList.push({
        id: `${b.id}-cash`,
        date: b.createdAt.toISOString(),
        type: "BOOKING_CASH",
        description: `Booking — ${roomLabel}`,
        subDescription: subDesc,
        guestName: b.primaryGuest.name,
        bookingRef: b.bookingRef,
        mode: "CASH",
        amount: b.cashPaid,
        isDebit: false,
      });
    }

    // Online payment
    if (b.onlinePaid > 0) {
      txList.push({
        id: `${b.id}-online`,
        date: b.createdAt.toISOString(),
        type: "BOOKING_ONLINE",
        description: `Booking — ${roomLabel}`,
        subDescription: subDesc,
        guestName: b.primaryGuest.name,
        bookingRef: b.bookingRef,
        mode: "ONLINE",
        amount: b.onlinePaid,
        isDebit: false,
      });
    }

    // Pay-at-hotel / no upfront payment — show as pending entry so the booking is visible
    if (!hasCashOrOnline && b.status !== "CANCELLED" && b.totalAmount > 0) {
      txList.push({
        id: `${b.id}-pah`,
        date: b.createdAt.toISOString(),
        type: "BOOKING_PAY_AT_HOTEL",
        description: `Booking — ${roomLabel}`,
        subDescription: subDesc,
        guestName: b.primaryGuest.name,
        bookingRef: b.bookingRef,
        mode: "CASH",            // expected to be collected as cash at hotel
        amount: b.totalAmount,
        isDebit: false,
      });
    }

    // Cancellation fee
    if (
      b.status === "CANCELLED" &&
      b.cancellationCharge !== null &&
      b.cancellationCharge > 0 &&
      b.cancelledAt &&
      b.cancelledAt >= fromDate &&
      b.cancelledAt <= toDate
    ) {
      txList.push({
        id: `${b.id}-cancel`,
        date: b.cancelledAt.toISOString(),
        type: "CANCELLATION_FEE",
        description: "Cancellation fee",
        subDescription: b.bookingRef,
        guestName: b.primaryGuest.name,
        bookingRef: b.bookingRef,
        mode: "INTERNAL",
        amount: b.cancellationCharge,
        isDebit: false,
      });
    }

    // Damage / deposit deduction
    if (
      b.status === "CHECKED_OUT" &&
      b.depositDeducted > 0 &&
      b.checkedOutAt &&
      b.checkedOutAt >= fromDate &&
      b.checkedOutAt <= toDate
    ) {
      txList.push({
        id: `${b.id}-damage`,
        date: b.checkedOutAt.toISOString(),
        type: "DAMAGE_CHARGE",
        description: "Damage / deposit deduction",
        subDescription: b.bookingRef,
        guestName: b.primaryGuest.name,
        bookingRef: b.bookingRef,
        mode: "INTERNAL",
        amount: b.depositDeducted,
        isDebit: false,
      });
    }
  }

  for (const c of charges) {
    const chargeLabel = c.chargeTypes.length > 0
      ? c.chargeTypes.join(", ")
      : c.description ?? "Additional charge";
    txList.push({
      id: `charge-${c.id}`,
      date: c.addedAt.toISOString(),
      type: c.mode === "CASH" ? "CHARGE_CASH" : c.mode === "ONLINE" ? "CHARGE_ONLINE" : "CHARGE_MIXED",
      description: chargeLabel,
      subDescription: c.booking.bookingRef,
      guestName: c.booking.primaryGuest.name,
      bookingRef: c.booking.bookingRef,
      mode: c.mode as "CASH" | "ONLINE" | "MIXED",
      amount: c.amount,
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

  // Apply mode filter
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
