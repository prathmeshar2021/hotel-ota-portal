/**
 * Clears refunds and cancellation charges that were raised on bookings nobody
 * had paid for.
 *
 *   npx tsx --env-file=.env scripts/fix-unpaid-cancellations.ts          # dry run
 *   npx tsx --env-file=.env scripts/fix-unpaid-cancellations.ts --apply
 *
 * Until refunds were held to money actually received, cancelling a pay-at-hotel
 * booking ran the policy against the room price: "refund ₹200, keep ₹1,260" on
 * a guest who had handed over nothing. Such a booking was left showing a refund
 * owed and a fee charged.
 *
 * Only bookings with nothing paid — no cash, no online, an empty ledger — are
 * touched, and only a refund still waiting (PENDING / FAILED). One already
 * marked as paid out is reported and left alone: whether cash really left the
 * drawer is a question for the person who marked it, not for a script.
 */
import { prisma } from "@/lib/db/prisma";
import { netPaid } from "@/lib/services/booking-txn";
import { OTA_PREPAID_SOURCES } from "@/lib/ota/sources";

const apply = process.argv.includes("--apply");

async function main() {
  const cancelled = await prisma.booking.findMany({
    where: { status: "CANCELLED", source: { notIn: OTA_PREPAID_SOURCES } },
    select: { id: true, bookingRef: true, cashPaid: true, onlinePaid: true, depositCollected: true,
      refundStatus: true, refundAmount: true, refundId: true, cancellationCharge: true, _count: { select: { txns: true } } },
    orderBy: { bookingRef: "asc" },
  });
  const paid = await netPaid(cancelled.map(b => b.id));

  let fixed = 0, flagged = 0;
  for (const b of cancelled) {
    const nothingPaid = b.cashPaid + b.onlinePaid <= 0 && (paid.get(b.id) ?? 0) <= 0 && b.depositCollected <= 0 && b._count.txns === 0;
    if (!nothingPaid) continue;
    const waiting = b.refundStatus === "PENDING" || b.refundStatus === "FAILED";
    const charged = (b.cancellationCharge ?? 0) > 0;

    if (b.refundStatus === "PROCESSED" && b.refundAmount > 0) {
      flagged++;
      console.log(`LEFT ALONE  ${b.bookingRef}: marked "₹${b.refundAmount} refunded" (${b.refundId}) though nothing was paid — please confirm no cash was handed over`);
      continue;
    }
    if (!waiting && !charged) continue;

    fixed++;
    console.log(`${apply ? "cleared" : "would clear"}  ${b.bookingRef}: ` +
      [waiting ? `refund ${b.refundStatus.toLowerCase()} ₹${b.refundAmount}` : "", charged ? `charge ₹${b.cancellationCharge}` : ""].filter(Boolean).join(", "));
    if (apply) {
      await prisma.booking.update({
        where: { id: b.id },
        data: { ...(waiting ? { refundStatus: "NONE", refundAmount: 0 } : {}), cancellationCharge: 0 },
      });
    }
  }
  console.log(`\n${cancelled.length} cancelled bookings checked · ${fixed} ${apply ? "cleared" : "to clear"} · ${flagged} left for you to confirm`);
  if (!apply && fixed > 0) console.log("Re-run with --apply to make the change.");
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
