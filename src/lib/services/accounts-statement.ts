import { getCategoryMeta } from "@/lib/utils/room-categories";

/**
 * How a ledger entry reads on the accounts statement.
 *
 * Shared by the statement screen and the daily accounts sheet, so a payment is
 * described in the same words wherever the owner reads it.
 */

export type TxType =
  | "BOOKING_CASH"
  | "BOOKING_ONLINE"
  | "BOOKING_PAY_AT_HOTEL"
  | "CHARGE_CASH"
  | "CHARGE_ONLINE"
  | "CHARGE_MIXED"
  | "DEPOSIT_APPLIED"
  | "ADJUSTMENT"
  | "REFUND"
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
  mode: "CASH" | "ONLINE" | "MIXED" | "DEPOSIT" | "INTERNAL";
  amount: number;
  isDebit: boolean;
}

/**
 * Guest money comes from the BookingTxn ledger — one row per movement, written
 * when it happened. That is what lets a guest who paid ₹500 at booking and the
 * rest at check-in appear as two lines on two dates, rather than one lump sum
 * dated at booking.
 *
 * The refundable deposit is deliberately absent: while the hotel holds it, it is
 * still the guest's money, so taking it and handing it back are both silent.
 * It surfaces only through DEPOSIT_APPLIED / DEPOSIT_WITHHELD — the moment it
 * stops being refundable and becomes the hotel's — and those rows say so.
 */
export function ledgerRowToItem(t: {
  id: string;
  kind: string;
  direction: string;
  mode: string;
  amount: number;
  note: string | null;
  occurredAt: Date;
  flagged: boolean;
  flagReason: string | null;
  booking: {
    bookingRef: string;
    noOfNights: number;
    roomCategory: string;
    room: { roomNumber: string } | null;
    primaryGuest: { name: string };
  };
}): TransactionItem {
  const catLabel = getCategoryMeta(t.booking.roomCategory).displayName;
  const roomLabel = t.booking.room ? `${catLabel} #${t.booking.room.roomNumber}` : catLabel;
  const nights = `${t.booking.noOfNights} night${t.booking.noOfNights !== 1 ? "s" : ""}`;

  let type: TxType;
  let description: string;
  switch (t.kind) {
    case "ROOM_PAYMENT":
      type = t.mode === "ONLINE" ? "BOOKING_ONLINE" : "BOOKING_CASH";
      description = `Booking — ${roomLabel}`;
      break;
    case "EXTRA_CHARGE":
      type = t.mode === "ONLINE" ? "CHARGE_ONLINE" : "CHARGE_CASH";
      description = t.note ?? "Extra charge";
      break;
    case "DEPOSIT_APPLIED":
      type = "DEPOSIT_APPLIED";
      description = t.note ?? "Deducted from deposit";
      break;
    case "DEPOSIT_WITHHELD":
      type = "DAMAGE_CHARGE";
      description = t.note ?? "Withheld from deposit";
      break;
    case "CANCELLATION_FEE":
      type = "CANCELLATION_FEE";
      description = "Cancellation fee";
      break;
    case "ADJUSTMENT":
      type = "ADJUSTMENT";
      description = t.note ?? (t.direction === "CREDIT" ? "Adjustment — taken" : "Adjustment — given back");
      break;
    default:
      type = "REFUND";
      description = t.note ?? "Refunded to guest";
  }

  // A flagged entry says so on the statement itself, so the unusual ones are
  // visible where the money is read rather than only in the activity log.
  if (t.flagged && t.flagReason) description = `${description} — ${t.flagReason}`;

  return {
    id: `txn-${t.id}`,
    date: t.occurredAt.toISOString(),
    type,
    description,
    subDescription: t.kind === "ROOM_PAYMENT" ? nights : t.booking.bookingRef,
    guestName: t.booking.primaryGuest.name,
    bookingRef: t.booking.bookingRef,
    mode: t.mode as TransactionItem["mode"],
    amount: t.amount,
    // Direction is stored, not inferred: a desk adjustment can go either way.
    isDebit: t.direction === "DEBIT",
  };
}
