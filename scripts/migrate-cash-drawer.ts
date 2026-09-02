/**
 * Recalculate the till effect of every entry so Cash in Hand equals the notes
 * actually in the drawer.
 *
 *   npx tsx --env-file=.env scripts/migrate-cash-drawer.ts          # dry run
 *   npx tsx --env-file=.env scripts/migrate-cash-drawer.ts --write
 *
 * Two corrections:
 *
 *  1. Deposits now count when the notes move, not when the money becomes the
 *     hotel's — taken in cash is +, returned in cash is −, and applying it to a
 *     bill moves nothing because it was already counted.
 *
 *  2. Where checkout wrote the return down as cash because that is how the
 *     deposit arrived, but staff actually sent it by UPI (or the reverse), the
 *     mode is corrected from the note the desk left at the time.
 */
import { prismaBase } from "../src/lib/db/prisma";

const WRITE = process.argv.includes("--write");
const f = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** The till effect an entry should have: did notes move, and which way? */
function impactOf(t: { kind: string; direction: string; mode: string; amount: number }): number {
  if (t.kind === "DEPOSIT_APPLIED" || t.kind === "DEPOSIT_WITHHELD") return 0;
  if (t.mode !== "CASH") return 0;
  return t.direction === "CREDIT" ? t.amount : -t.amount;
}

async function main() {
  // ── 1. Correct the method on returns that went back a different way ──
  const checkedOut = await prismaBase.booking.findMany({
    where: { status: "CHECKED_OUT", depositCollected: { gt: 0 }, depositNotes: { not: null } },
    select: { id: true, bookingRef: true, depositNotes: true,
      txns: { where: { kind: "DEPOSIT_RETURNED" }, select: { id: true, mode: true, amount: true } } },
  });

  const modeFixes: { id: string; ref: string; from: string; to: string; amount: number }[] = [];
  for (const b of checkedOut) {
    const note = b.depositNotes ?? "";
    // The desk's own words are the only record of how it actually went back.
    const wanted = /in UPI|via UPI|to source|Razorpay/i.test(note) ? "ONLINE"
      : /in cash/i.test(note) ? "CASH"
      : null;
    if (!wanted) continue;
    for (const t of b.txns) {
      if (t.mode !== wanted && t.mode !== "DEPOSIT") {
        modeFixes.push({ id: t.id, ref: b.bookingRef, from: t.mode, to: wanted, amount: t.amount });
      }
    }
  }
  console.log(`Deposit returns recorded by the wrong method: ${modeFixes.length}`);
  const toOnline = modeFixes.filter(m => m.to === "ONLINE");
  const toCash = modeFixes.filter(m => m.to === "CASH");
  console.log(`  cash → UPI : ${toOnline.length}, ${f(toOnline.reduce((s, m) => s + m.amount, 0))} of notes that stayed in the drawer`);
  console.log(`  UPI → cash : ${toCash.length}, ${f(toCash.reduce((s, m) => s + m.amount, 0))} of notes that left it`);

  if (WRITE) {
    for (const m of modeFixes) {
      await prismaBase.bookingTxn.update({ where: { id: m.id }, data: { mode: m.to as never } });
    }
  }

  // ── 2. Recalculate every till effect ──
  const all = await prismaBase.bookingTxn.findMany({
    select: { id: true, kind: true, direction: true, mode: true, amount: true, cashImpact: true },
  });
  // Re-read the modes just corrected above so the recalculation uses them.
  const fixed = new Map(modeFixes.map(m => [m.id, m.to]));
  const changes = all
    .map(t => ({ t, want: impactOf({ ...t, mode: fixed.get(t.id) ?? t.mode }) }))
    .filter(({ t, want }) => Math.abs(want - t.cashImpact) > 0.001);

  const before = all.reduce((s, t) => s + t.cashImpact, 0);
  const after = all.reduce((s, t) => s + impactOf({ ...t, mode: fixed.get(t.id) ?? t.mode }), 0);
  console.log(`\nEntries whose till effect changes: ${changes.length} of ${all.length}`);
  console.log(`Cash in Hand from guest money: ${f(before)} → ${f(after)}  (${f(after - before)})`);

  if (!WRITE) { console.log("\nDry run — nothing written."); return; }
  for (const { t, want } of changes) {
    await prismaBase.bookingTxn.update({ where: { id: t.id }, data: { cashImpact: want } });
  }
  console.log(`\n✔ ${modeFixes.length} methods corrected, ${changes.length} till effects recalculated.`);
}
main().catch(e => console.error("FAILED:", String(e).slice(0, 500)))
  .finally(() => prismaBase.$disconnect().then(() => process.exit(0)));
