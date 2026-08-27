import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma, prismaBase } from "@/lib/db/prisma";
import { computeTotalsForPrice } from "@/lib/utils/booking-calc";
import { recordStaffAction } from "@/lib/services/staff-action";
import { syncDepositTaken } from "@/lib/services/booking-ledger";

/**
 * Undo a recorded action.
 *
 * Every sensitive thing staff do is already written to the activity log with
 * enough detail to reverse it, so undo reads that entry and puts things back —
 * a deleted booking returns, an edited price goes back to what it was, an
 * expense or a cash collection is removed.
 *
 * Not everything can be undone, and the honest answer is better than a button
 * that lies. Anything that pushed money through the payment gateway is gone
 * from our side; a cancellation may have refunded a guest already. Those return
 * a plain explanation rather than pretending.
 *
 * The undo is itself recorded, so the log stays a history of what happened
 * rather than a set of switches.
 */

const UNDOABLE = [
  "DELETE_BOOKING", "PRICE_CHANGE", "DEPOSIT_CHANGE",
  "CASH_COLLECTION", "EXPENSE_DEBIT", "DELETE_TRANSACTION",
] as const;

/** Why an action can't be reversed, in words the desk can act on. */
const CANNOT: Record<string, string> = {
  CANCEL_BOOKING:
    "A cancellation may already have refunded the guest through the payment gateway. Re-create the booking instead.",
  REFUND:
    "The money has already left. Take it again as a new payment if it was returned by mistake.",
  OTHER:
    "This was a correction rather than an action, so there is nothing to put back.",
};

function staffGuard(role?: string) {
  return role === "HOTEL_ADMIN" || role === "HOTEL_STAFF" || role === "SUPER_ADMIN";
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    return await undo(params);
  } catch (err) {
    // Anything unexpected still has to come back as JSON — the desk sees a
    // readable message instead of the browser choking on an empty body.
    console.error("[activity/undo]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not undo that action" },
      { status: 500 }
    );
  }
}

async function undo(params: Promise<{ id: string }>) {
  const session = await auth();
  if (!session?.user?.hotelId || !staffGuard(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const log = await prisma.staffActionLog.findFirst({
    where: { id, hotelId: session.user.hotelId },
  });
  if (!log) return NextResponse.json({ error: "Action not found" }, { status: 404 });
  if (log.undoneAt) {
    return NextResponse.json({ error: "This has already been undone" }, { status: 409 });
  }
  if (!UNDOABLE.includes(log.kind as never)) {
    return NextResponse.json(
      { error: CANNOT[log.kind] ?? "This action can't be undone." },
      { status: 400 }
    );
  }

  const by = session.user.name || session.user.email || "Staff";
  const details = (log.details ?? {}) as Record<string, unknown>;
  let summary = "";

  switch (log.kind) {
    case "DELETE_BOOKING": {
      // The row was only archived, so putting it back is a matter of clearing
      // the stamp — its payments and any invoice were never touched.
      const b = await prismaBase.booking.findFirst({
        where: { id: log.refId ?? "", hotelId: session.user.hotelId, deletedAt: { not: null } },
        select: { id: true, bookingRef: true },
      });
      if (!b) return NextResponse.json({ error: "That booking is already back" }, { status: 409 });
      await prismaBase.booking.update({
        where: { id: b.id },
        data: { deletedAt: null, deletedById: null, deletedByName: null, deleteReason: null },
      });
      summary = `${b.bookingRef} was restored.`;
      break;
    }

    case "PRICE_CHANGE":
    case "DEPOSIT_CHANGE": {
      const before = details.before as Record<string, number> | undefined;
      if (!before || !log.refId) {
        return NextResponse.json({ error: "The earlier figures weren't recorded, so this can't be put back." }, { status: 400 });
      }
      const b = await prisma.booking.findFirst({
        where: { id: log.refId, hotelId: session.user.hotelId },
        select: { id: true, bookingRef: true, noOfNights: true, cashPaid: true, onlinePaid: true, depositMode: true },
      });
      if (!b) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

      const data: Record<string, unknown> = {};
      if (typeof before.totalAmount === "number") {
        const t = computeTotalsForPrice({ inclusiveTotal: before.totalAmount, noOfNights: b.noOfNights });
        Object.assign(data, {
          totalAmount: t.totalAmount, taxableAmount: t.taxableAmount, cgst: t.cgst, sgst: t.sgst,
          balanceDue: Math.max(0, +(t.totalAmount - b.cashPaid - b.onlinePaid).toFixed(2)),
        });
      }
      if (typeof before.refundableDeposit === "number") data.refundableDeposit = before.refundableDeposit;
      if (typeof before.depositCollected === "number") data.depositCollected = before.depositCollected;
      await prisma.booking.update({ where: { id: b.id }, data });

      if (typeof before.depositCollected === "number") {
        await syncDepositTaken({
          hotelId: session.user.hotelId, bookingId: b.id,
          depositCollected: before.depositCollected,
          depositMode: b.depositMode === "ONLINE" ? "ONLINE" : "CASH",
          recordedBy: by, note: "Deposit put back by undo",
        });
      }
      summary = `${b.bookingRef} was put back to its earlier figures.`;
      break;
    }

    case "CASH_COLLECTION": {
      if (!log.refId) return NextResponse.json({ error: "Nothing to remove" }, { status: 400 });
      const del = await prisma.cashCollection.deleteMany({
        where: { id: log.refId, hotelId: session.user.hotelId },
      });
      if (del.count === 0) return NextResponse.json({ error: "That collection is already gone" }, { status: 409 });
      summary = `₹${(log.amount ?? 0).toLocaleString("en-IN")} is back in the till.`;
      break;
    }

    case "EXPENSE_DEBIT": {
      if (!log.refId) return NextResponse.json({ error: "Nothing to remove" }, { status: 400 });
      const del = await prisma.hotelExpense.deleteMany({
        where: { id: log.refId, hotelId: session.user.hotelId },
      });
      if (del.count === 0) return NextResponse.json({ error: "That expense is already gone" }, { status: 409 });
      summary = `The ₹${(log.amount ?? 0).toLocaleString("en-IN")} expense was removed.`;
      break;
    }

    case "DELETE_TRANSACTION": {
      // The entry itself was deleted, so undo re-creates it from what the log kept.
      const d = details as { entryType?: string; category?: string; mode?: string; addedBy?: string };
      if (!d.category || !d.entryType) {
        return NextResponse.json({ error: "Not enough was recorded to put this entry back." }, { status: 400 });
      }
      await prisma.hotelExpense.create({
        data: {
          hotelId: session.user.hotelId,
          entryType: d.entryType as never,
          category: d.category,
          description: log.reason || undefined,
          amount: log.amount ?? 0,
          mode: (d.mode ?? "CASH") as never,
          expenseDate: log.createdAt,
          addedBy: d.addedBy ?? by,
        },
      });
      summary = `The ₹${(log.amount ?? 0).toLocaleString("en-IN")} ${d.category} entry is back.`;
      break;
    }
  }

  await prisma.staffActionLog.update({
    where: { id: log.id },
    data: { undoneAt: new Date(), undoneByName: by },
  });

  // The reversal is an action in its own right, so the owner hears about it too.
  await recordStaffAction({
    hotelId: session.user.hotelId,
    kind: "OTHER",
    summary: `Undone: ${log.summary} ${summary}`.trim(),
    amount: log.amount,
    refType: log.refType as never,
    refId: log.refId,
    bookingRef: log.bookingRef,
    guestName: log.guestName,
    reason: `Reversed an action originally done by ${log.actorName}`,
    actorId: session.user.id,
    actorName: by,
    actorRole: session.user.role ?? "HOTEL_STAFF",
    details: { undidLogId: log.id, originalKind: log.kind },
  });

  return NextResponse.json({ success: true, message: summary });
}
