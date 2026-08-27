/**
 * Bring existing ledger rows onto the richer model.
 *
 *   npx tsx --env-file=.env scripts/migrate-ledger-v2.ts          # dry run
 *   npx tsx --env-file=.env scripts/migrate-ledger-v2.ts --write
 *
 * Two things are missing from rows written before the booking account existed:
 * refunds default to CREDIT when they are plainly money going out, and the
 * deposit was never recorded as taken, so a booking's account cannot say what
 * is being held. Both are derivable from what the booking already stores.
 */
import { prisma, prismaBase } from "../src/lib/db/prisma";

const WRITE = process.argv.includes("--write");

async function main() {
  // ── 1. Refunds are debits ──
  const refunds = await prismaBase.bookingTxn.findMany({
    where: { kind: { in: ["REFUND", "DEPOSIT_RETURNED"] }, direction: "CREDIT" },
    select: { id: true, amount: true, mode: true, cashImpact: true },
  });
  console.log(`Refund rows still marked CREDIT: ${refunds.length}`);

  // ── 2. Deposits taken ──
  const withDeposit = await prismaBase.booking.findMany({
    where: { depositCollected: { gt: 0 } },
    select: {
      id: true, bookingRef: true, depositCollected: true, depositMode: true,
      depositDeducted: true, depositRefunded: true, checkedOutAt: true, checkedInAt: true,
      createdAt: true, status: true,
      txns: { select: { kind: true, amount: true } },
    },
  });
  const needTaken = withDeposit.filter(b => !b.txns.some(t => t.kind === "DEPOSIT_TAKEN"));
  console.log(`Bookings holding a deposit with no DEPOSIT_TAKEN entry: ${needTaken.length}`);

  // A checked-out booking has already given back whatever it did not use, so
  // the pair must be written together or the account would show phantom holdings.
  let returns = 0;
  const toWrite: object[] = [];
  for (const b of needTaken) {
    const at = b.checkedInAt ?? b.createdAt;
    toWrite.push({
      hotelId: (await prismaBase.booking.findUnique({ where: { id: b.id }, select: { hotelId: true } }))!.hotelId,
      bookingId: b.id, kind: "DEPOSIT_TAKEN", direction: "CREDIT",
      mode: b.depositMode === "ONLINE" ? "ONLINE" : "CASH",
      amount: b.depositCollected, cashImpact: 0, affectsStatement: false,
      note: "Refundable deposit taken", occurredAt: at,
      idemKey: `dep-taken:${b.id}`,
    });
    const returned = +(b.depositCollected - b.depositDeducted).toFixed(2);
    if (b.status === "CHECKED_OUT" && returned > 0) {
      returns++;
      toWrite.push({
        hotelId: (await prismaBase.booking.findUnique({ where: { id: b.id }, select: { hotelId: true } }))!.hotelId,
        bookingId: b.id, kind: "DEPOSIT_RETURNED", direction: "DEBIT",
        mode: b.depositMode === "ONLINE" ? "ONLINE" : "CASH",
        amount: returned, cashImpact: 0, affectsStatement: false,
        note: "Refundable deposit returned at checkout",
        occurredAt: b.checkedOutAt ?? at,
        idemKey: `dep-returned:${b.id}`,
      });
    }
  }
  console.log(`  → ${toWrite.length} entries to add (${returns} of them deposit returns)`);

  if (!WRITE) { console.log("\nDry run — nothing written."); return; }

  if (refunds.length) {
    await prismaBase.bookingTxn.updateMany({
      where: { id: { in: refunds.map(r => r.id) } },
      data: { direction: "DEBIT" },
    });
  }
  let n = 0;
  for (let i = 0; i < toWrite.length; i += 200) {
    const r = await prismaBase.bookingTxn.createMany({ data: toWrite.slice(i, i + 200) as never, skipDuplicates: true });
    n += r.count;
  }
  console.log(`\n✔ ${refunds.length} refund(s) marked DEBIT, ${n} deposit entries added.`);
}
main().catch(e => console.error("FAILED:", String(e).slice(0, 500))).finally(async () => prismaBase.$disconnect());
