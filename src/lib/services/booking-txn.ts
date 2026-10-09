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
import { postEntry, summarise } from "@/lib/services/booking-ledger";

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
 * What the guest has actually paid towards the bill and not yet had back, for
 * each booking asked about.
 *
 * This is the ceiling on any refund. It reads the ledger the same way the
 * booking's own account does, so the two can never disagree: payments in, less
 * refunds and reversals out. The refundable deposit is not payment — taking it
 * and handing it back are both left out. (They used to be added together here,
 * which put the ceiling above what most guests had paid.)
 */
export async function netPaid(bookingIds: string[]): Promise<Map<string, number>> {
  const rows = await prisma.bookingTxn.findMany({
    where: { bookingId: { in: bookingIds } },
    select: { bookingId: true, kind: true, direction: true, mode: true, amount: true },
  });
  const out = new Map<string, number>();
  for (const id of bookingIds) {
    const acct = summarise(rows.filter(r => r.bookingId === id), { roomTotal: 0, extrasOnTab: 0 });
    out.set(id, Math.max(0, +(acct.paid - acct.refunded).toFixed(2)));
  }
  return out;
}

/**
 * Shares a refund across the bookings that paid for it, never giving one back
 * more than it paid. `first` is filled before the others, so a single-room
 * refund lands wholly on its own booking.
 */
export function allocateRefund(
  amount: number,
  paid: Map<string, number>,
  first: string
): { bookingId: string; amount: number }[] {
  const order = [first, ...[...paid.keys()].filter(id => id !== first)];
  const out: { bookingId: string; amount: number }[] = [];
  let left = +amount.toFixed(2);
  for (const id of order) {
    if (left <= 0) break;
    const take = +Math.min(left, paid.get(id) ?? 0).toFixed(2);
    if (take > 0) { out.push({ bookingId: id, amount: take }); left = +(left - take).toFixed(2); }
  }
  return out;
}

/** Convenience for the several places that record a counter collection. */
export function roomPaymentNote(mode: "CASH" | "ONLINE", stage: string): string {
  return `${mode === "CASH" ? "Cash" : "UPI / card"} — ${stage}`;
}
