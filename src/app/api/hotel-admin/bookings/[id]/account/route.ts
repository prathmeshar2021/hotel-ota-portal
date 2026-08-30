import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";
import {
  postEntry, postSplit, summarise, assessEntry, directionOf, depositCashShare,
  type TxnKind, type TxnDirection,
} from "@/lib/services/booking-ledger";
import { recordStaffAction } from "@/lib/services/staff-action";
import { computeTotalsForPrice } from "@/lib/utils/booking-calc";

/**
 * A booking's account: what it is worth, what has moved, and what is left.
 *
 * GET  — the full entry list plus the derived position.
 * POST — add an entry. Any amount, either direction, any mode. The desk is
 *        trusted to know what happened; anything unusual is flagged rather than
 *        blocked, and a flag reaches the owner.
 * PATCH — correct the mode of an entry already posted (the guest said UPI and
 *        paid cash). The amount cannot be changed this way; that takes a new
 *        entry, so the trail stays honest.
 */

function staffGuard(role?: string) {
  return role === "HOTEL_ADMIN" || role === "HOTEL_STAFF" || role === "SUPER_ADMIN";
}

const KINDS = [
  "ROOM_PAYMENT", "EXTRA_CHARGE", "DEPOSIT_TAKEN", "DEPOSIT_RETURNED",
  "DEPOSIT_APPLIED", "DEPOSIT_WITHHELD", "CANCELLATION_FEE", "REFUND", "ADJUSTMENT",
] as const;

const PostSchema = z.object({
  kind: z.enum(KINDS),
  mode: z.enum(["CASH", "ONLINE", "DEPOSIT", "MIXED"]),
  amount: z.number().positive("Amount must be more than zero"),
  /** For MIXED: how much of the amount came in as cash. The rest is UPI. */
  cashAmount: z.number().min(0).optional(),
  direction: z.enum(["CREDIT", "DEBIT"]).optional(),
  note: z.string().trim().max(300).optional(),
  occurredAt: z.string().optional(),
});

const PatchSchema = z.object({
  txnId: z.string(),
  mode: z.enum(["CASH", "ONLINE", "MIXED"]),
  /** For MIXED: how much of the entry was actually cash. The rest is UPI. */
  cashAmount: z.number().min(0).optional(),
  reason: z.string().trim().max(300).optional(),
});

/** Everything needed to price the account, in one read. */
async function loadBooking(id: string, hotelId: string) {
  return prisma.booking.findFirst({
    where: { id, hotelId },
    select: {
      id: true, bookingRef: true, status: true, totalAmount: true,
      refundableDeposit: true, depositMode: true,
      primaryGuest: { select: { name: true } },
      charges: { select: { amount: true, paidNow: true } },
      txns: {
        select: {
          id: true, kind: true, direction: true, mode: true, amount: true,
          cashImpact: true, note: true, occurredAt: true, recordedBy: true,
          flagged: true, flagReason: true, correctsId: true, affectsStatement: true,
        },
        orderBy: { occurredAt: "asc" },
      },
    },
  });
}

function accountOf(b: NonNullable<Awaited<ReturnType<typeof loadBooking>>>) {
  const extrasOnTab = +b.charges.filter(c => !c.paidNow).reduce((s, c) => s + c.amount, 0).toFixed(2);
  return summarise(b.txns, { roomTotal: b.totalAmount, extrasOnTab });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.hotelId || !staffGuard(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const b = await loadBooking(id, session.user.hotelId);
  if (!b) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  return NextResponse.json({
    bookingRef: b.bookingRef,
    status: b.status,
    guestName: b.primaryGuest.name,
    depositExpected: b.refundableDeposit,
    account: accountOf(b),
    entries: b.txns.map(t => ({ ...t, occurredAt: t.occurredAt.toISOString() })),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.hotelId || !staffGuard(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const parsed = PostSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    const f = parsed.error.flatten();
    return NextResponse.json(
      { error: [...f.formErrors, ...Object.values(f.fieldErrors).flat()][0] ?? "Invalid request" },
      { status: 400 }
    );
  }

  const b = await loadBooking(id, session.user.hotelId);
  if (!b) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  const { kind, mode, amount, note, occurredAt, cashAmount } = parsed.data;
  // A mixed payment is stored as two exact entries, never one vague "mixed" row
  // — the till has to know how many notes actually changed hands.
  const cashPart = mode === "MIXED"
    ? +Math.min(Math.max(0, cashAmount ?? 0), amount).toFixed(2)
    : mode === "CASH" ? amount : 0;
  const onlinePart = +(amount - cashPart).toFixed(2);
  const direction = directionOf(kind as TxnKind, parsed.data.direction as TxnDirection | undefined);
  const before = accountOf(b);
  const recordedBy = session.user.name || session.user.email || "Staff";

  // Nothing is refused — the desk knows what happened. What is unusual is
  // recorded as unusual, so the owner hears about it the same day.
  const check = assessEntry({ kind: kind as TxnKind, direction, amount, account: before });

  const when = occurredAt ? new Date(occurredAt) : undefined;
  const depositMode = b.depositMode === "ONLINE" ? "ONLINE" : "CASH";

  // Handing back more than is held is really two things at once: the deposit
  // returned, and room money refunded on top. Splitting them is what keeps the
  // arithmetic honest — a deposit going back is neutral, a refund is not, and
  // recording the whole amount as one or the other leaves the balance wrong by
  // the difference.
  const excess =
    kind === "DEPOSIT_RETURNED" && amount > before.depositHeld + 0.5
      ? +(amount - before.depositHeld).toFixed(2)
      : 0;

  // Proportions the split across whatever entries this turns into.
  const share = amount > 0 ? cashPart / amount : 0;
  const splitOf = (part: number) => ({
    cashAmount: +(part * share).toFixed(2),
    onlineAmount: +(part * (1 - share)).toFixed(2),
  });

  if (excess > 0) {
    if (before.depositHeld > 0) {
      await postSplit({
        hotelId: session.user.hotelId, bookingId: b.id, kind: "DEPOSIT_RETURNED",
        occurredAt: when, recordedBy, depositMode, note: note || "Deposit returned",
        ...splitOf(before.depositHeld),
      });
    }
    await postSplit({
      hotelId: session.user.hotelId, bookingId: b.id, kind: "REFUND",
      occurredAt: when, recordedBy, depositMode,
      note: `${note ? `${note} · ` : ""}beyond the deposit — refunded from the room payment`,
      flagged: true, flagReason: check.reason ?? null,
      ...splitOf(excess),
    });
  } else if (mode === "DEPOSIT") {
    // Settled out of the deposit already held — no cash or UPI side at all.
    await postEntry({
      hotelId: session.user.hotelId, bookingId: b.id, kind: kind as TxnKind,
      mode: "DEPOSIT", direction, amount, note: note || null, occurredAt: when,
      recordedBy, depositCashShare: await depositCashShare(b.id),
      flagged: check.flagged, flagReason: check.reason ?? null,
    });
  } else {
    await postSplit({
      hotelId: session.user.hotelId,
      bookingId: b.id,
      kind: kind as TxnKind,
      direction,
      note: note || null,
      occurredAt: when,
      recordedBy,
      depositMode,
      flagged: check.flagged,
      flagReason: check.reason ?? null,
      cashAmount: cashPart,
      onlineAmount: onlinePart,
    });
  }

  // Returning more deposit than is held means the excess is room money going
  // back, so what the stay is worth drops by that much — otherwise the guest
  // would still be billed for money the hotel has just handed them.
  let repriced: { from: number; to: number } | null = null;
  if (excess > 0) {
    const newTotal = +Math.max(0, b.totalAmount - excess).toFixed(2);
    const totals = computeTotalsForPrice({
      inclusiveTotal: newTotal,
      noOfNights: (await prisma.booking.findUnique({ where: { id: b.id }, select: { noOfNights: true } }))!.noOfNights,
    });
    await prisma.booking.update({
      where: { id: b.id },
      data: {
        totalAmount: totals.totalAmount,
        taxableAmount: totals.taxableAmount,
        cgst: totals.cgst,
        sgst: totals.sgst,
      },
    });
    repriced = { from: b.totalAmount, to: totals.totalAmount };
  }

  const reloaded = await loadBooking(id, session.user.hotelId);
  const after = accountOf(reloaded as never);
  await syncBookingTotals(b.id, after);

  if (check.flagged) {
    await recordStaffAction({
      hotelId: session.user.hotelId,
      kind: "OTHER",
      summary: `${b.bookingRef}: ${check.reason}.`,
      amount,
      refType: "booking",
      refId: b.id,
      bookingRef: b.bookingRef,
      guestName: b.primaryGuest.name,
      reason: note || undefined,
      actorId: session.user.id,
      actorName: recordedBy,
      actorRole: session.user.role ?? "HOTEL_STAFF",
      details: { kind, mode, direction, amount, before, after, repriced },
      notifyLines: [
        `${direction === "CREDIT" ? "Taken" : "Given back"}: ₹${amount.toLocaleString("en-IN")} (${mode.toLowerCase()})`,
        ...(repriced
          ? [`Booking reduced from ₹${repriced.from.toLocaleString("en-IN")} to ₹${repriced.to.toLocaleString("en-IN")} to cover the excess`]
          : []),
        `Booking is worth ₹${after.billed.toLocaleString("en-IN")}; balance now ₹${after.balance.toLocaleString("en-IN")}`,
      ],
    });
  }

  return NextResponse.json({
    success: true,
    flagged: check.flagged,
    flagReason: check.reason ?? null,
    repriced,
    account: after,
    message: repriced
      ? `Recorded — booking reduced to ₹${repriced.to.toLocaleString("en-IN")} to cover the excess. Owner notified.`
      : check.flagged
        ? `Recorded — flagged for the owner: ${check.reason}`
        : `₹${amount.toLocaleString("en-IN")} ${direction === "CREDIT" ? "recorded" : "refunded"}`,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.hotelId || !staffGuard(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const parsed = PatchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const b = await loadBooking(id, session.user.hotelId);
  if (!b) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  const entry = b.txns.find(t => t.id === parsed.data.txnId);
  if (!entry) return NextResponse.json({ error: "Entry not found on this booking" }, { status: 404 });
  if (entry.mode === "DEPOSIT") {
    return NextResponse.json({ error: "A deposit settlement has no cash or UPI side to correct" }, { status: 400 });
  }
  const recordedBy = session.user.name || session.user.email || "Staff";

  // How the money really arrived. MIXED splits the same amount across both.
  const cashPart = parsed.data.mode === "MIXED"
    ? +Math.min(Math.max(0, parsed.data.cashAmount ?? 0), entry.amount).toFixed(2)
    : parsed.data.mode === "CASH" ? entry.amount : 0;
  const onlinePart = +(entry.amount - cashPart).toFixed(2);

  if (parsed.data.mode !== "MIXED" && entry.mode === parsed.data.mode) {
    return NextResponse.json({ error: "Already recorded that way" }, { status: 400 });
  }

  // The money moved once; only our record of how was wrong. Correcting in place
  // keeps the statement in true transaction order — posting a reversal and a
  // replacement would imply the guest paid twice.
  //
  // A correction to part-cash needs two rows, because the till has to know how
  // many notes there really were. The original becomes the cash side and a
  // sibling carries the UPI side at the same instant, so they stay together in
  // the list and the pair still sums to what was taken.
  const sign = entry.direction === "CREDIT" ? 1 : -1;
  const label = parsed.data.mode === "MIXED"
    ? `cash ₹${cashPart} + UPI ₹${onlinePart}`
    : parsed.data.mode === "CASH" ? "cash" : "UPI";

  if (cashPart > 0) {
    await prisma.bookingTxn.update({
      where: { id: entry.id },
      data: {
        mode: "CASH",
        amount: cashPart,
        cashImpact: +(sign * cashPart).toFixed(2),
        note: `${entry.note ?? ""}${entry.note ? " · " : ""}corrected to ${label} by ${recordedBy}`.slice(0, 300),
      },
    });
  }

  if (onlinePart > 0) {
    if (cashPart > 0) {
      // The UPI half of a split becomes its own row alongside the original.
      await postEntry({
        hotelId: session.user.hotelId,
        bookingId: b.id,
        kind: entry.kind as TxnKind,
        direction: entry.direction as TxnDirection,
        mode: "ONLINE",
        amount: onlinePart,
        occurredAt: entry.occurredAt,
        recordedBy,
        correctsId: entry.id,
        affectsStatement: entry.affectsStatement,
        note: `${entry.note ?? ""}${entry.note ? " · " : ""}corrected to ${label} by ${recordedBy}`.slice(0, 300),
      });
    } else {
      await prisma.bookingTxn.update({
        where: { id: entry.id },
        data: {
          mode: "ONLINE",
          amount: onlinePart,
          cashImpact: 0,
          note: `${entry.note ?? ""}${entry.note ? " · " : ""}corrected to ${label} by ${recordedBy}`.slice(0, 300),
        },
      });
    }
  }

  const after = accountOf(await loadBooking(id, session.user.hotelId) as never);
  await syncBookingTotals(b.id, after);

  await recordStaffAction({
    hotelId: session.user.hotelId,
    kind: "OTHER",
    summary: `${b.bookingRef}: ₹${entry.amount.toLocaleString("en-IN")} was recorded as ${entry.mode.toLowerCase()} but actually came in as ${label}.`,
    amount: entry.amount,
    refType: "booking",
    refId: b.id,
    bookingRef: b.bookingRef,
    guestName: b.primaryGuest.name,
    reason: parsed.data.reason || undefined,
    actorId: session.user.id,
    actorName: recordedBy,
    actorRole: session.user.role ?? "HOTEL_STAFF",
    details: { txnId: entry.id, from: entry.mode, to: parsed.data.mode, cashPart, onlinePart },
    notifyLines: [`Cash in hand moves by ₹${(+(sign * cashPart - entry.cashImpact)).toLocaleString("en-IN")}`],
  });

  return NextResponse.json({
    success: true,
    account: after,
    message: `Corrected to ${label}`,
  });
}

/**
 * Keep the booking's own running totals in step with its ledger. They are a
 * summary of the entries, never a second source of truth — everything that
 * reads a booking card, an invoice or the checkout screen uses them.
 *
 * depositCollected matters most here. Checkout works out the refund from it, so
 * a deposit taken on this panel that never reached the booking row would leave
 * checkout believing nothing is held — and quietly keep the guest's money.
 */
async function syncBookingTotals(
  bookingId: string,
  a: {
    paidCash: number; paidOnline: number; balance: number;
    depositTaken: number; depositReturned: number;
  }
) {
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      cashPaid: a.paidCash,
      onlinePaid: a.paidOnline,
      balanceDue: Math.max(0, a.balance),
      // What the deposit is worth right now, before checkout settles it:
      // everything taken, less anything already handed back.
      depositCollected: +Math.max(0, a.depositTaken - a.depositReturned).toFixed(2),
    },
  });
}
