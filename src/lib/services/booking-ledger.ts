/**
 * The booking ledger — every movement of money attached to a stay.
 *
 * One append-only row per event, in the order things happened. Nothing is ever
 * edited to change an amount: a mistake is corrected by posting a compensating
 * entry that points back at the one it fixes, so the trail always reads as what
 * actually occurred rather than what someone wishes had.
 *
 * The desk needs this to be flexible, because money at a front desk is: a guest
 * says UPI and pays cash, a refund runs past the deposit, a rate is agreed after
 * the fact. So any amount can be credited or debited against a booking. What
 * keeps that safe is not restriction but visibility — anything unusual is
 * flagged, and a flag notifies the owner.
 *
 * Two figures stay authoritative and are always shown for reference: what the
 * booking is worth, and what deposit is held. Everything here is measured
 * against them.
 */

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

export type TxnKind =
  | "ROOM_PAYMENT"
  | "EXTRA_CHARGE"
  | "DEPOSIT_TAKEN"
  | "DEPOSIT_RETURNED"
  | "DEPOSIT_APPLIED"
  | "DEPOSIT_WITHHELD"
  | "CANCELLATION_FEE"
  | "REFUND"
  | "ADJUSTMENT";

export type TxnMode = "CASH" | "ONLINE" | "DEPOSIT";
export type TxnDirection = "CREDIT" | "DEBIT";

/** Money the guest hands over, or value the hotel keeps. */
const CREDIT_KINDS: TxnKind[] = [
  "ROOM_PAYMENT", "EXTRA_CHARGE", "DEPOSIT_TAKEN",
  "DEPOSIT_APPLIED", "DEPOSIT_WITHHELD", "CANCELLATION_FEE",
];

/**
 * The deposit is the guest's money while it is merely held, so it moving in and
 * out is not hotel income or expenditure. It still belongs on the booking's own
 * account, where staff need to see what they are holding.
 */
const OUT_OF_STATEMENT: TxnKind[] = ["DEPOSIT_TAKEN", "DEPOSIT_RETURNED"];

export function directionOf(kind: TxnKind, explicit?: TxnDirection): TxnDirection {
  if (explicit) return explicit;
  return CREDIT_KINDS.includes(kind) ? "CREDIT" : "DEBIT";
}

export interface LedgerEntryInput {
  hotelId: string;
  bookingId: string;
  kind: TxnKind;
  mode: TxnMode;
  /** Always positive. Which way it moves is `direction`, never the sign. */
  amount: number;
  /** Only needed for ADJUSTMENT; every other kind knows its own direction. */
  direction?: TxnDirection;
  note?: string | null;
  occurredAt?: Date;
  recordedBy?: string | null;
  idemKey?: string | null;
  correctsId?: string | null;
  flagged?: boolean;
  flagReason?: string | null;
  /**
   * How the deposit was originally taken. Deposit money only reaches the cash
   * drawer figure at the moment it stops being refundable.
   */
  depositMode?: "CASH" | "ONLINE" | null;
  /** Overrides the default statement visibility for this kind. */
  affectsStatement?: boolean;
}

/** Signed effect on the physical cash drawer. */
export function cashImpactOf(input: LedgerEntryInput, amount: number): number {
  const dir = directionOf(input.kind, input.direction);

  // Deposit taken in cash is physically in the drawer, but it is not the
  // hotel's — it is excluded on the way in and on the way out, so the two
  // cancel and the drawer figure only ever reflects money the hotel owns.
  if (input.kind === "DEPOSIT_TAKEN" || input.kind === "DEPOSIT_RETURNED") return 0;

  if (input.kind === "DEPOSIT_APPLIED" || input.kind === "DEPOSIT_WITHHELD") {
    return input.depositMode === "CASH" ? amount : 0;
  }

  if (input.mode !== "CASH") return 0;
  return dir === "CREDIT" ? amount : -amount;
}

export async function postEntry(
  input: LedgerEntryInput,
  tx?: Prisma.TransactionClient
): Promise<{ id: string } | null> {
  const amount = +Number(input.amount ?? 0).toFixed(2);
  if (!(amount > 0)) return null;

  const client = tx ?? prisma;
  const data = {
    hotelId: input.hotelId,
    bookingId: input.bookingId,
    kind: input.kind,
    direction: directionOf(input.kind, input.direction),
    mode: input.mode,
    amount,
    cashImpact: +cashImpactOf(input, amount).toFixed(2),
    note: input.note ?? null,
    occurredAt: input.occurredAt ?? new Date(),
    recordedBy: input.recordedBy ?? null,
    idemKey: input.idemKey ?? null,
    correctsId: input.correctsId ?? null,
    flagged: input.flagged ?? false,
    flagReason: input.flagReason ?? null,
    affectsStatement: input.affectsStatement ?? !OUT_OF_STATEMENT.includes(input.kind),
  };

  if (data.idemKey) {
    const row = await client.bookingTxn.upsert({
      where: { idemKey: data.idemKey },
      create: data,
      update: {},
      select: { id: true },
    });
    return row;
  }
  return client.bookingTxn.create({ data, select: { id: true } });
}

// ── The booking's account ────────────────────────────────────────────────────

export interface BookingAccount {
  /** What the stay is worth: room total plus anything left on the tab. */
  billed: number;
  roomTotal: number;
  extrasOnTab: number;
  /** Paid towards the bill (excludes the deposit, which is not payment). */
  paid: number;
  paidCash: number;
  paidOnline: number;
  refunded: number;
  /** billed − paid + refunded. Positive → guest owes; negative → hotel owes. */
  balance: number;
  /** Deposit still held on the guest's behalf. */
  depositHeld: number;
  depositTaken: number;
  depositReturned: number;
  depositUsed: number;
}

/**
 * Derive a booking's position from its entries plus the two authoritative
 * figures. Everything the desk sees is computed here, so the panel, the API and
 * any check all agree by construction.
 */
export function summarise(
  entries: { kind: string; direction: string; mode: string; amount: number }[],
  opts: { roomTotal: number; extrasOnTab: number }
): BookingAccount {
  const sum = (pred: (e: (typeof entries)[number]) => boolean) =>
    +entries.filter(pred).reduce((s, e) => s + e.amount, 0).toFixed(2);

  const paidCash = sum(e => e.mode === "CASH" && e.direction === "CREDIT" && e.kind !== "DEPOSIT_TAKEN");
  const paidOnline = sum(e => e.mode === "ONLINE" && e.direction === "CREDIT" && e.kind !== "DEPOSIT_TAKEN");
  const fromDeposit = sum(e => e.kind === "DEPOSIT_APPLIED" || e.kind === "DEPOSIT_WITHHELD");
  const refunded = sum(e => e.direction === "DEBIT" && e.kind !== "DEPOSIT_RETURNED");

  const depositTaken = sum(e => e.kind === "DEPOSIT_TAKEN");
  const depositReturned = sum(e => e.kind === "DEPOSIT_RETURNED");
  const depositUsed = fromDeposit;

  const billed = +(opts.roomTotal + opts.extrasOnTab).toFixed(2);
  const paid = +(paidCash + paidOnline + fromDeposit).toFixed(2);

  return {
    billed,
    roomTotal: opts.roomTotal,
    extrasOnTab: opts.extrasOnTab,
    paid,
    paidCash,
    paidOnline,
    refunded,
    balance: +(billed - paid + refunded).toFixed(2),
    depositHeld: +Math.max(0, depositTaken - depositReturned - depositUsed).toFixed(2),
    depositTaken,
    depositReturned,
    depositUsed,
  };
}

// ── What counts as unusual ───────────────────────────────────────────────────

export interface FlagCheck {
  flagged: boolean;
  reason?: string;
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/**
 * Decide whether an entry deserves the owner's attention.
 *
 * These are not errors — every one of them is something a front desk legitimately
 * has to do. They are simply the cases where a second pair of eyes is worth
 * having, so they are recorded loudly rather than prevented.
 */
export function assessEntry(params: {
  kind: TxnKind;
  direction: TxnDirection;
  amount: number;
  account: BookingAccount;
}): FlagCheck {
  const { kind, direction, amount, account } = params;

  if (direction === "DEBIT") {
    // Giving back more than is being held means the refund is eating into money
    // the guest paid for the room, not just their deposit.
    if (kind === "DEPOSIT_RETURNED" && amount > account.depositHeld + 0.5) {
      return {
        flagged: true,
        reason: `Returning ${inr(amount)} against a deposit of ${inr(account.depositHeld)} — ${inr(+(amount - account.depositHeld).toFixed(2))} comes out of the room payment`,
      };
    }
    if (amount > account.paid - account.refunded + 0.5) {
      return {
        flagged: true,
        reason: `Refunding ${inr(amount)} when only ${inr(+(account.paid - account.refunded).toFixed(2))} has been taken`,
      };
    }
  }

  if (direction === "CREDIT" && kind !== "DEPOSIT_TAKEN") {
    const owing = +(account.balance).toFixed(2);
    if (amount > owing + 0.5) {
      return {
        flagged: true,
        reason: owing <= 0
          ? `Taking ${inr(amount)} on a booking with nothing left to pay`
          : `Taking ${inr(amount)} against a balance of ${inr(owing)}`,
      };
    }
  }

  return { flagged: false };
}
