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
import { postEntry } from "@/lib/services/booking-ledger";

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
  /** Retained for callers that still pass it; `mode` already carries this. */
  refundVia?: "CASH" | "ONLINE" | null;
  /**
   * Fraction of the deposit that arrived as cash, when a mixed deposit is being
   * applied or withheld — only that share reaches the till.
   */
  depositCashShare?: number | null;
}

/**
 * Append one entry.
 *
 * Kept as the entry point the booking routes already call, but the rules — which
 * way the money went, what it does to the cash drawer, whether it belongs in the
 * hotel statement — now live in booking-ledger, so the desk's own account panel
 * and these routes can never drift apart.
 */
export async function recordTxn(
  input: RecordTxnInput,
  tx?: Prisma.TransactionClient
): Promise<void> {
  await postEntry(
    {
      hotelId: input.hotelId,
      bookingId: input.bookingId,
      kind: input.kind,
      mode: input.mode,
      amount: input.amount,
      note: input.note,
      occurredAt: input.occurredAt,
      recordedBy: input.recordedBy,
      idemKey: input.idemKey,
      depositMode: input.depositMode,
      depositCashShare: input.depositCashShare,
    },
    tx
  );
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
