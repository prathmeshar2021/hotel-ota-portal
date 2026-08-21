/**
 * The money ledger.
 *
 * Every rupee that moves — collected, applied, withheld or returned — is written
 * here as its own row at the moment it happens. The accounts statement reads
 * this table and nothing else for guest money, which is what makes instalments
 * show up individually and on the right date. Booking.cashPaid / onlinePaid stay
 * as running totals for the booking card; they are a summary of this ledger, not
 * a substitute for it.
 *
 * Two rules the rest of the codebase depends on:
 *
 *  1. The refundable deposit is the guest's money while we hold it, so taking it
 *     and handing it back are both invisible to the statement. It becomes the
 *     hotel's — and appears — only when it is applied to something the guest
 *     owed, or withheld for damage.
 *  2. `cashImpact` is the single source of truth for the cash drawer. Anything
 *     that doesn't move physical notes carries 0.
 */

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

export type TxnKind =
  | "ROOM_PAYMENT"
  | "EXTRA_CHARGE"
  | "DEPOSIT_APPLIED"
  | "DEPOSIT_WITHHELD"
  | "CANCELLATION_FEE"
  | "REFUND";

export type TxnMode = "CASH" | "ONLINE" | "DEPOSIT";

export interface RecordTxnInput {
  hotelId: string;
  bookingId: string;
  kind: TxnKind;
  mode: TxnMode;
  /** Always positive — a refund is signed by its kind, not by the amount. */
  amount: number;
  note?: string | null;
  occurredAt?: Date;
  recordedBy?: string | null;
  /** Set for anything replayable (webhooks, retried submits). */
  idemKey?: string | null;
  /**
   * For DEPOSIT_APPLIED / DEPOSIT_WITHHELD: how the deposit was originally
   * taken. Cash that was sitting in the drawer as a deposit becomes the hotel's
   * cash at that moment, so the drawer figure has to pick it up.
   */
  depositMode?: "CASH" | "ONLINE" | null;
  /** For REFUND: whether the notes left the drawer or the money went back online. */
  refundVia?: "CASH" | "ONLINE" | null;
}

/** Signed effect on the physical cash drawer. See the note on the model. */
function cashImpactOf(input: RecordTxnInput, amount: number): number {
  switch (input.kind) {
    case "ROOM_PAYMENT":
    case "EXTRA_CHARGE":
    case "CANCELLATION_FEE":
      return input.mode === "CASH" ? amount : 0;

    case "DEPOSIT_APPLIED":
    case "DEPOSIT_WITHHELD":
      // The deposit was excluded from the drawer while we merely held it. Now
      // that it is ours, it counts — but only if it was taken as cash.
      return input.depositMode === "CASH" ? amount : 0;

    case "REFUND":
      return input.refundVia === "CASH" ? -amount : 0;
  }
}

/**
 * Append one entry. Zero and negative amounts are dropped rather than stored —
 * a settlement that nets to nothing is not a transaction.
 *
 * Pass `tx` to join an enclosing `prisma.$transaction`, so the ledger row and
 * the booking update either both land or neither does.
 */
export async function recordTxn(
  input: RecordTxnInput,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const amount = +Number(input.amount ?? 0).toFixed(2);
  if (!(amount > 0)) return;

  const client = tx ?? prisma;
  const data = {
    hotelId: input.hotelId,
    bookingId: input.bookingId,
    kind: input.kind,
    mode: input.mode,
    amount,
    cashImpact: +cashImpactOf(input, amount).toFixed(2),
    note: input.note ?? null,
    occurredAt: input.occurredAt ?? new Date(),
    recordedBy: input.recordedBy ?? null,
    idemKey: input.idemKey ?? null,
  };

  if (data.idemKey) {
    // Replay-safe: a webhook Razorpay sends twice must not credit twice.
    await client.bookingTxn.upsert({
      where: { idemKey: data.idemKey },
      create: data,
      update: {},
    });
    return;
  }

  await client.bookingTxn.create({ data });
}

/**
 * What this booking has actually been credited with, net of refunds already
 * given back. Refunds are capped against it so the statement can never show
 * more money leaving than ever came in — a cancellation refund is often quoted
 * against the full tariff, including a deposit that was never taken.
 */
export async function netCredited(bookingId: string): Promise<number> {
  const rows = await prisma.bookingTxn.findMany({
    where: { bookingId },
    select: { kind: true, amount: true },
  });
  const net = rows.reduce(
    (s, r) => s + (r.kind === "REFUND" ? -r.amount : r.amount),
    0
  );
  return Math.max(0, +net.toFixed(2));
}

/** Convenience for the several places that record a counter collection. */
export function roomPaymentNote(mode: "CASH" | "ONLINE", stage: string): string {
  return `${mode === "CASH" ? "Cash" : "UPI / card"} — ${stage}`;
}
