/**
 * Record a sensitive desk action and tell the owner it happened.
 *
 * These actions — taking cash out of the till, adding an expense, deleting a
 * ledger entry, cancelling or deleting a booking — used to be gated behind the
 * owner's OTP. That put a phone call between a member of staff and a guest
 * standing at the desk. The gate has moved to after the fact: the action goes
 * through at once, the owner is notified immediately, and every one is kept
 * here for them to review whenever they like.
 *
 * Notifications are best-effort by design. An action that already happened must
 * never be rolled back, or reported to staff as failed, because WhatsApp was
 * unreachable — but the log records whether each message actually went out, so
 * a silent failure is itself visible.
 */

import { prisma } from "@/lib/db/prisma";
import { gupshup } from "@/lib/services/gupshup";
import { email } from "@/lib/services/email";
import type { Prisma } from "@prisma/client";

export type StaffActionKind =
  | "PRICE_CHANGE"
  | "DEPOSIT_CHANGE"
  | "CASH_COLLECTION"
  | "EXPENSE_DEBIT"
  | "DELETE_TRANSACTION"
  | "CANCEL_BOOKING"
  | "DELETE_BOOKING"
  | "DEPOSIT_DEDUCTION"
  | "REFUND"
  | "OTHER";

export const ACTION_LABEL: Record<StaffActionKind, string> = {
  PRICE_CHANGE: "Booking price changed",
  DEPOSIT_CHANGE: "Deposit amount changed",
  CASH_COLLECTION: "Cash taken from till",
  EXPENSE_DEBIT: "Expense recorded",
  DELETE_TRANSACTION: "Ledger entry deleted",
  CANCEL_BOOKING: "Booking cancelled",
  DELETE_BOOKING: "Booking deleted",
  DEPOSIT_DEDUCTION: "Deposit deduction",
  REFUND: "Refund issued",
  OTHER: "Other action",
};

/** Actions where money left the business — worth the owner's attention first. */
const MONEY_OUT: StaffActionKind[] = [
  "CASH_COLLECTION", "EXPENSE_DEBIT", "REFUND", "DELETE_TRANSACTION",
];

/** Edits to what a booking costs — the owner's first question is always "who". */
const PRICE_EDIT: StaffActionKind[] = ["PRICE_CHANGE", "DEPOSIT_CHANGE"];

export interface StaffActionInput {
  hotelId: string;
  kind: StaffActionKind;
  /** One line, in the words the owner would use. */
  summary: string;
  amount?: number | null;
  refType?: "booking" | "expense" | "collection" | null;
  refId?: string | null;
  bookingRef?: string | null;
  guestName?: string | null;
  reason?: string | null;
  actorId?: string | null;
  actorName: string;
  actorRole: string;
  /** Extra context kept for the log; not sent in the notification. */
  details?: Record<string, unknown> | null;
  /** Lines added under the summary in the owner's message. */
  notifyLines?: string[];
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export async function recordStaffAction(input: StaffActionInput): Promise<void> {
  const label = ACTION_LABEL[input.kind];
  const lines = [
    `👤 By: ${input.actorName}`,
    ...(input.bookingRef ? [`🔖 ${input.bookingRef}${input.guestName ? ` · ${input.guestName}` : ""}`] : []),
    ...(input.notifyLines ?? []),
    ...(input.reason ? [`📝 ${input.reason}`] : []),
  ];

  const message =
    `${MONEY_OUT.includes(input.kind) ? "💸" : PRICE_EDIT.includes(input.kind) ? "✏️" : "🔔"} *${label}*\n\n` +
    `${input.summary}\n` +
    (input.amount != null ? `💰 ${inr(input.amount)}\n` : "") +
    lines.join("\n");

  const [wa, mail] = await Promise.allSettled([
    gupshup.sendOwnerText(message),
    email.sendOwnerStaffAction({
      label,
      summary: input.summary,
      amount: input.amount ?? undefined,
      actorName: input.actorName,
      actorRole: input.actorRole,
      bookingRef: input.bookingRef ?? undefined,
      guestName: input.guestName ?? undefined,
      reason: input.reason ?? undefined,
      extraLines: input.notifyLines ?? [],
      moneyOut: MONEY_OUT.includes(input.kind),
    }),
  ]);

  await prisma.staffActionLog.create({
    data: {
      hotelId: input.hotelId,
      kind: input.kind,
      summary: input.summary,
      amount: input.amount ?? null,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      bookingRef: input.bookingRef ?? null,
      guestName: input.guestName ?? null,
      reason: input.reason ?? null,
      actorId: input.actorId ?? null,
      actorName: input.actorName,
      actorRole: input.actorRole,
      details: (input.details ?? undefined) as Prisma.InputJsonValue | undefined,
      notifiedWhatsapp: wa.status === "fulfilled" && wa.value != null,
      notifiedEmail: mail.status === "fulfilled" && mail.value != null,
    },
  }).catch(e => {
    // The action itself already succeeded; losing the log entry must not undo it.
    console.error("[staff-action] failed to write log:", e);
  });
}
