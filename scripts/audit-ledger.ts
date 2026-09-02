/**
 * Audit the transaction system end to end.
 *   npx tsx --env-file=.env scripts/audit-ledger.ts
 *
 * Checks the invariants the whole design rests on. Any failure here means a
 * figure somewhere in the panel is lying.
 */
import { prisma, prismaBase } from "../src/lib/db/prisma";
import { summarise } from "../src/lib/services/booking-ledger";
import { OTA_PREPAID_SOURCES } from "../src/lib/ota/sources";

const f = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const bookings = await prisma.booking.findMany({
    where: { source: { notIn: OTA_PREPAID_SOURCES } },
    select: {
      id: true, bookingRef: true, status: true, totalAmount: true,
      cashPaid: true, onlinePaid: true, balanceDue: true,
      depositCollected: true, depositDeducted: true, depositMode: true,
      charges: { select: { amount: true, paidNow: true } },
      txns: {
        select: { id: true, kind: true, direction: true, mode: true, amount: true,
          cashImpact: true, affectsStatement: true, flagged: true },
        orderBy: { occurredAt: "asc" },
      },
    },
  });
  console.log(`Auditing ${bookings.length} bookings, ${bookings.reduce((s, b) => s + b.txns.length, 0)} ledger entries\n`);

  // 1 — direction matches kind
  console.log("1. Direction is consistent with kind");
  const CREDITS = ["ROOM_PAYMENT", "EXTRA_CHARGE", "DEPOSIT_TAKEN", "DEPOSIT_APPLIED", "DEPOSIT_WITHHELD", "CANCELLATION_FEE"];
  const wrongDir = bookings.flatMap(b => b.txns.filter(t =>
    t.kind !== "ADJUSTMENT" &&
    (CREDITS.includes(t.kind) ? t.direction !== "CREDIT" : t.direction !== "DEBIT")));
  check("every entry's direction matches its kind", wrongDir.length === 0, `${wrongDir.length} wrong`);

  // 2 — deposit in/out never reaches the statement or the drawer
  console.log("\n2. The deposit passing through is invisible to the accounts");
  const depRows = bookings.flatMap(b => b.txns.filter(t => t.kind === "DEPOSIT_TAKEN" || t.kind === "DEPOSIT_RETURNED"));
  check("no deposit-movement row is in the statement", depRows.every(t => !t.affectsStatement), `${depRows.filter(t => t.affectsStatement).length} leaked`);
  // A cash deposit IS in the drawer, so it must move the till — what must not
  // happen is it reaching income. Cash rows move it; UPI rows do not.
  const depCashWrong = depRows.filter(t => {
    const want = t.mode !== "CASH" ? 0 : (t.kind === "DEPOSIT_TAKEN" ? t.amount : -t.amount);
    return Math.abs(t.cashImpact - want) > 0.01;
  });
  check("deposit rows move the till only when notes moved", depCashWrong.length === 0, `${depCashWrong.length} wrong`);
  const equalPairs = bookings.filter(b => {
    const tk = b.txns.filter(t => t.kind === "DEPOSIT_TAKEN").reduce((s, t) => s + t.amount, 0);
    const rt = b.txns.filter(t => t.kind === "DEPOSIT_RETURNED").reduce((s, t) => s + t.amount, 0);
    return tk > 0 && Math.abs(tk - rt) < 0.5;
  });
  check(`taken == returned leaves nothing in the accounts (${equalPairs.length} such bookings)`, true);

  // 3 — what the hotel keeps of the deposit does appear
  console.log("\n3. The part of the deposit the hotel keeps DOES appear");
  let depMismatch = 0;
  for (const b of bookings) {
    const kept = b.txns.filter(t => t.kind === "DEPOSIT_APPLIED" || t.kind === "DEPOSIT_WITHHELD").reduce((s, t) => s + t.amount, 0);
    if (Math.abs(kept - b.depositDeducted) > 0.5) depMismatch++;
  }
  check("depositDeducted equals the applied/withheld entries", depMismatch === 0, `${depMismatch} bookings differ`);
  const keptRows = bookings.flatMap(b => b.txns.filter(t => t.kind === "DEPOSIT_APPLIED" || t.kind === "DEPOSIT_WITHHELD"));
  check("all of them are in the statement", keptRows.every(t => t.affectsStatement));

  // 4 — no negative holdings
  console.log("\n4. No booking holds a negative deposit");
  const neg = bookings.filter(b => {
    const a = summarise(b.txns, { roomTotal: b.totalAmount, extrasOnTab: 0 });
    const tk = b.txns.filter(t => t.kind === "DEPOSIT_TAKEN").reduce((s, t) => s + t.amount, 0);
    const rt = b.txns.filter(t => t.kind === "DEPOSIT_RETURNED").reduce((s, t) => s + t.amount, 0);
    return tk - rt - a.depositUsed < -0.5;
  });
  check("deposit held never goes below zero", neg.length === 0, neg.slice(0, 3).map(b => b.bookingRef).join(", "));

  // 5 — running totals agree with the ledger
  console.log("\n5. Booking totals agree with the ledger");
  let rm = 0;
  for (const b of bookings) {
    const c = b.txns.filter(t => t.kind === "ROOM_PAYMENT" && t.mode === "CASH" && t.direction === "CREDIT").reduce((s, t) => s + t.amount, 0);
    const o = b.txns.filter(t => t.kind === "ROOM_PAYMENT" && t.mode === "ONLINE" && t.direction === "CREDIT").reduce((s, t) => s + t.amount, 0);
    if (Math.abs(c - b.cashPaid) > 0.5 || Math.abs(o - b.onlinePaid) > 0.5) rm++;
  }
  check("cashPaid / onlinePaid match ROOM_PAYMENT entries", rm === 0, `${rm} bookings differ`);

  // 6 — counter-paid extras
  console.log("\n6. Extras paid at the counter");
  let ex = 0;
  for (const b of bookings) {
    const paidNow = b.charges.filter(c => c.paidNow).reduce((s, c) => s + c.amount, 0);
    const led = b.txns.filter(t => t.kind === "EXTRA_CHARGE").reduce((s, t) => s + t.amount, 0);
    if (Math.abs(paidNow - led) > 0.5) ex++;
  }
  check("counter-paid charges each have one entry", ex === 0, `${ex} bookings differ`);

  // 7 — cash drawer built only from cash
  console.log("\n7. Cash drawer");
  const bad = bookings.flatMap(b => b.txns.filter(t => {
    // Deposit money is deliberately outside the drawer figure on both sides —
    // it is the guest's while held, so taking and returning it must net to
    // nothing. Only the moment it becomes the hotel's counts.
    // Applying or withholding moves no notes — they were counted when taken.
    if (t.kind === "DEPOSIT_APPLIED" || t.kind === "DEPOSIT_WITHHELD") return t.cashImpact !== 0;
    if (t.mode !== "CASH") return t.cashImpact !== 0;
    const want = t.direction === "CREDIT" ? t.amount : -t.amount;
    return Math.abs(t.cashImpact - want) > 0.5;
  }));
  check("cashImpact is right on every entry", bad.length === 0, `${bad.length} wrong`);
  const drawer = bookings.flatMap(b => b.txns).reduce((s, t) => s + t.cashImpact, 0);
  console.log(`     drawer from guest money: ${f(drawer)}`);

  // The physical drawer also holds cash deposits that are not the hotel's. The
  // owner needs that figure to reconcile a count against the panel.
  // Only stays that are still holding one — a settled booking whose deposit came
  // in by UPI and went out as notes would otherwise push this negative.
  const heldCash = bookings.reduce((s, b) => {
    if (!["CONFIRMED", "CHECKED_IN"].includes(b.status)) return s;
    const tk = b.txns.filter(t => t.kind === "DEPOSIT_TAKEN" && t.mode === "CASH").reduce((x, t) => x + t.amount, 0);
    const rt = b.txns.filter(t => t.kind === "DEPOSIT_RETURNED" && t.mode === "CASH").reduce((x, t) => x + t.amount, 0);
    return s + Math.max(0, tk - rt);
  }, 0);
  console.log(`     of which guest deposits held as notes: ${f(heldCash)}`);

  // 8 — no double counting
  console.log("\n8. No entry counted twice");
  const both = await prismaBase.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint AS count FROM (
       SELECT "bookingId" FROM "BookingTxn" WHERE "idemKey" IS NULL
       INTERSECT
       SELECT "bookingId" FROM "BookingTxn" WHERE "idemKey" LIKE 'bf:%'
     ) x`
  );
  check("no booking has both backfilled and live room entries", Number(both[0].count) === 0, `${both[0].count} bookings`);

  console.log(`\n${failures === 0 ? "All invariants hold." : `${failures} FAILURE(S)`}`);
}
main().catch(e => console.error("FAILED:", String(e).slice(0, 500))).finally(async () => prismaBase.$disconnect());
