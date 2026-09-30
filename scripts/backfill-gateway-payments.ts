/**
 * Records online payments that were confirmed but never reached the ledger.
 *
 *   npx tsx --env-file=.env scripts/backfill-gateway-payments.ts          # dry run
 *   npx tsx --env-file=.env scripts/backfill-gateway-payments.ts --apply
 *
 * Until the fix in booking-confirm.ts, a payment made on the website or through
 * a WhatsApp payment link marked the booking paid but wrote no ledger entry, so
 * the accounts statement never showed the money. This posts the missing entry,
 * dated when the guest paid, under the same key the live code now uses — so a
 * replayed webhook can never add it a second time, and re-running this changes
 * nothing.
 */
import { prisma } from "@/lib/db/prisma";
import { postEntry } from "@/lib/services/booking-ledger";

const apply = process.argv.includes("--apply");

async function main() {
  const payments = await prisma.payment.findMany({
    where: { status: "captured", razorpayPaymentId: { not: null } },
    select: { id: true, razorpayPaymentId: true, paidAt: true, booking: { select: { id: true, bookingGroupId: true } } },
  });

  let found = 0;
  for (const p of payments) {
    if (!p.booking) continue;
    const rooms = p.booking.bookingGroupId
      ? await prisma.booking.findMany({ where: { bookingGroupId: p.booking.bookingGroupId }, select: { id: true } })
      : [{ id: p.booking.id }];

    for (const r of rooms) {
      const b = await prisma.booking.findUniqueOrThrow({
        where: { id: r.id },
        select: {
          id: true, hotelId: true, bookingRef: true, source: true, totalAmount: true, onlinePaid: true, balanceDue: true,
          txns: { where: { kind: "ROOM_PAYMENT", mode: "ONLINE" }, select: { amount: true, direction: true } },
        },
      });
      const inLedger = b.txns.reduce((s, t) => s + (t.direction === "CREDIT" ? t.amount : -t.amount), 0);
      const missing = +(b.onlinePaid - inLedger).toFixed(2);
      if (missing <= 0.5) continue;

      found++;
      const via = b.source === "PHONE" ? "via the payment link" : "on the website";
      const note = `${b.balanceDue > 0 ? "Advance paid" : "Paid in full"} online ${via} · ${p.razorpayPaymentId}`;
      console.log(`${apply ? "posting" : "would post"}  ${b.bookingRef}  ₹${missing}  (paid ${p.paidAt?.toISOString() ?? "?"})  "${note}"`);
      if (apply) {
        await postEntry({
          hotelId: b.hotelId,
          bookingId: b.id,
          kind: "ROOM_PAYMENT",
          mode: "ONLINE",
          amount: missing,
          note,
          occurredAt: p.paidAt ?? undefined,
          recordedBy: "Online payment",
          idemKey: `gw:${p.razorpayPaymentId}:${b.id}`,
        });
      }
    }
  }
  console.log(found === 0 ? "Nothing missing." : `${found} ${apply ? "posted" : "to post — re-run with --apply"}.`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
