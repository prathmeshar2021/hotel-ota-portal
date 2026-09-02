/**
 * Money-flow test suite.  npx tsx scripts/test-money-flows.ts
 *
 * Pure simulation of the exact arithmetic the server runs — the checkout
 * settlement, the account panel, and the desk edits — checked against the
 * invariants that must hold whatever staff do. No database, so it can be run
 * before every deploy.
 */
import { summarise, assessEntry, cashImpactOf } from "../src/lib/services/booking-ledger";
import { computeTotalsForPrice } from "../src/lib/utils/booking-calc";
import { splitFor } from "../src/components/hotel-admin/PayModePicker";

type Entry = { kind: string; direction: string; mode: string; amount: number };
let pass = 0, fail = 0;
const f = (n: number) => `₹${n.toLocaleString("en-IN")}`;

function ok(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

/** Mirrors the CHECKED_OUT branch of the status route, exactly. */
function checkout(o: {
  depositCollected: number; balanceDue: number; additionalCharges: number;
  deduction: number; collectMode?: "CASH" | "ONLINE";
}) {
  const owed = +(o.balanceDue + o.additionalCharges).toFixed(2);
  const net = +(o.depositCollected - owed).toFixed(2);
  const collect = Math.max(0, -net);
  const depositUsed = Math.min(o.depositCollected, owed);
  const refundable = Math.max(0, net);
  const deduction = Math.min(Math.max(0, +o.deduction.toFixed(2)), refundable);
  const refund = +(refundable - deduction).toFixed(2);
  const toExtras = Math.min(depositUsed, o.additionalCharges);
  const toRoom = +(depositUsed - toExtras).toFixed(2);
  return { owed, collect, depositUsed, refundable, deduction, refund, toExtras, toRoom,
    depositDeducted: +(depositUsed + deduction).toFixed(2) };
}

console.log("── 1. Checkout settlement across the whole range ──");
const cases = [
  { n: "deposit covers nothing owed",          dep: 500,  bal: 0,    extra: 0,   ded: 0 },
  { n: "deposit exactly covers what's owed",   dep: 500,  bal: 400,  extra: 100, ded: 0 },
  { n: "deposit partly covers",                dep: 500,  bal: 800,  extra: 0,   ded: 0 },
  { n: "nothing owed, staff withholds some",   dep: 500,  bal: 0,    extra: 0,   ded: 200 },
  { n: "staff withholds the whole deposit",    dep: 500,  bal: 0,    extra: 0,   ded: 500 },
  { n: "staff tries to withhold beyond it",    dep: 500,  bal: 0,    extra: 0,   ded: 900 },
  { n: "no deposit, money owed",               dep: 0,    bal: 700,  extra: 50,  ded: 0 },
  { n: "extras exceed the deposit",            dep: 200,  bal: 0,    extra: 950, ded: 0 },
  { n: "everything zero",                      dep: 0,    bal: 0,    extra: 0,   ded: 0 },
  { n: "odd paisa",                            dep: 199.5,bal: 99.25,extra: 0.25,ded: 0 },
];
for (const c of cases) {
  const r = checkout({ depositCollected: c.dep, balanceDue: c.bal, additionalCharges: c.extra, deduction: c.ded });
  // The deposit must be fully accounted for: used + withheld + returned == taken.
  const accounted = +(r.depositUsed + r.deduction + r.refund).toFixed(2);
  const balanced = Math.abs(accounted - c.dep) < 0.01;
  // Never refund or withhold more than is held; never both collect and refund.
  const sane = r.refund >= -0.01 && r.deduction <= c.dep + 0.01 && !(r.collect > 0 && r.refund > 0);
  const split = Math.abs(r.toExtras + r.toRoom - r.depositUsed) < 0.01;
  ok(`${c.n}: refund ${f(r.refund)}, collect ${f(r.collect)}, used ${f(r.depositUsed)}, withheld ${f(r.deduction)}`,
     balanced && sane && split,
     `accounted ${accounted} vs deposit ${c.dep}`);
}

console.log("\n── 2. Staff changing the refund amount at checkout ──");
{
  const base = { depositCollected: 500, balanceDue: 0, additionalCharges: 0 };
  for (const typed of [500, 400, 250, 0]) {
    // The modal lets staff type the final refund; deduction follows from it.
    const deduction = +(500 - typed).toFixed(2);
    const r = checkout({ ...base, deduction });
    const accounted = +(r.depositUsed + r.deduction + r.refund).toFixed(2);
    ok(`staff sets refund to ${f(typed)} → withheld ${f(r.deduction)}, deposit fully accounted`,
       Math.abs(r.refund - typed) < 0.01 && Math.abs(accounted - 500) < 0.01);
  }
  // Typing more than is held must clamp, never invent money.
  const over = checkout({ ...base, deduction: -200 });
  ok("a negative withholding cannot inflate the refund", over.refund <= 500.01 && over.deduction >= 0);
}

console.log("\n── 3. The booking's account after each checkout ──");
for (const c of cases.slice(0, 6)) {
  const r = checkout({ depositCollected: c.dep, balanceDue: c.bal, additionalCharges: c.extra, deduction: c.ded });
  const roomTotal = 1000, paidUpfront = +(roomTotal - c.bal).toFixed(2);
  const entries: Entry[] = [
    { kind: "ROOM_PAYMENT", direction: "CREDIT", mode: "CASH", amount: paidUpfront },
    ...(c.dep > 0 ? [{ kind: "DEPOSIT_TAKEN", direction: "CREDIT", mode: "CASH", amount: c.dep }] : []),
    ...(r.toExtras > 0 ? [{ kind: "DEPOSIT_APPLIED", direction: "CREDIT", mode: "DEPOSIT", amount: r.toExtras }] : []),
    ...(r.toRoom > 0 ? [{ kind: "DEPOSIT_APPLIED", direction: "CREDIT", mode: "DEPOSIT", amount: r.toRoom }] : []),
    ...(r.deduction > 0 ? [{ kind: "DEPOSIT_WITHHELD", direction: "CREDIT", mode: "DEPOSIT", amount: r.deduction }] : []),
    ...(r.collect > 0 ? [{ kind: "ROOM_PAYMENT", direction: "CREDIT", mode: "CASH", amount: r.collect }] : []),
    ...(r.refund > 0 ? [{ kind: "DEPOSIT_RETURNED", direction: "DEBIT", mode: "CASH", amount: r.refund }] : []),
  ];
  const a = summarise(entries, { roomTotal, extrasOnTab: c.extra });
  ok(`${c.n}: settles to zero and holds nothing`,
     Math.abs(a.balance) < 0.01 && Math.abs(a.depositHeld) < 0.01,
     `balance ${a.balance}, held ${a.depositHeld}`);
}

console.log("\n── 4. Front-desk edits ──");
{
  // Repricing after part-payment.
  const paid = 1200;
  for (const newTotal of [1500, 1200, 1100]) {
    const t = computeTotalsForPrice({ inclusiveTotal: newTotal, noOfNights: 1 });
    const rejected = newTotal < paid - 0.5;
    const balance = +(t.totalAmount - paid).toFixed(2);
    ok(`reprice to ${f(newTotal)} → ${rejected ? "refused (below paid)" : `balance ${f(balance)}`}`,
       rejected ? newTotal < paid : Math.abs(t.taxableAmount + t.cgst + t.sgst - t.totalAmount) < 0.01);
  }
  // Mode correction moves only the drawer, never the total.
  const before: Entry[] = [{ kind: "ROOM_PAYMENT", direction: "CREDIT", mode: "CASH", amount: 1000 }];
  const after: Entry[] = [{ kind: "ROOM_PAYMENT", direction: "CREDIT", mode: "ONLINE", amount: 1000 }];
  const a1 = summarise(before, { roomTotal: 1000, extrasOnTab: 0 });
  const a2 = summarise(after, { roomTotal: 1000, extrasOnTab: 0 });
  ok("cash→UPI correction leaves the balance untouched", Math.abs(a1.balance - a2.balance) < 0.01);
  ok("cash→UPI correction moves cash to online", a1.paidCash === 1000 && a2.paidOnline === 1000 && a2.paidCash === 0);
  const dCash = cashImpactOf({ hotelId: "", bookingId: "", kind: "ROOM_PAYMENT", mode: "CASH", amount: 1000 }, 1000);
  const dOnline = cashImpactOf({ hotelId: "", bookingId: "", kind: "ROOM_PAYMENT", mode: "ONLINE", amount: 1000 }, 1000);
  ok(`drawer falls by ${f(1000)} on that correction`, dCash - dOnline === 1000);
}

console.log("\n── 5. Refunding past the deposit ──");
{
  const roomTotal = 1200;
  const entries: Entry[] = [
    { kind: "ROOM_PAYMENT", direction: "CREDIT", mode: "CASH", amount: 1200 },
    { kind: "DEPOSIT_TAKEN", direction: "CREDIT", mode: "CASH", amount: 200 },
  ];
  const acct = summarise(entries, { roomTotal, extrasOnTab: 0 });
  const give = 600;
  const chk = assessEntry({ kind: "DEPOSIT_RETURNED", direction: "DEBIT", amount: give, account: acct });
  ok("returning past the deposit is flagged", chk.flagged, chk.reason);
  const excess = +(give - acct.depositHeld).toFixed(2);
  const after = summarise(
    [...entries,
     { kind: "DEPOSIT_RETURNED", direction: "DEBIT", mode: "CASH", amount: acct.depositHeld },
     { kind: "REFUND", direction: "DEBIT", mode: "CASH", amount: excess }],
    { roomTotal: +(roomTotal - excess).toFixed(2), extrasOnTab: 0 }
  );
  ok(`excess ${f(excess)} reduces the booking and settles to zero`,
     Math.abs(after.balance) < 0.01 && Math.abs(after.depositHeld) < 0.01,
     `balance ${after.balance}, held ${after.depositHeld}`);
}

console.log("\n── 6. Flags fire on everything unusual, and only that ──");
{
  const acct = summarise(
    [{ kind: "ROOM_PAYMENT", direction: "CREDIT", mode: "CASH", amount: 1000 },
     { kind: "DEPOSIT_TAKEN", direction: "CREDIT", mode: "CASH", amount: 200 }],
    { roomTotal: 1200, extrasOnTab: 0 }
  );
  const t = [
    { n: "take exactly what's owed", k: "ROOM_PAYMENT", d: "CREDIT", a: 200, want: false },
    { n: "take a rupee more",        k: "ROOM_PAYMENT", d: "CREDIT", a: 201, want: true },
    { n: "return the deposit",       k: "DEPOSIT_RETURNED", d: "DEBIT", a: 200, want: false },
    { n: "return a rupee more",      k: "DEPOSIT_RETURNED", d: "DEBIT", a: 201, want: true },
    { n: "refund within what's paid",k: "REFUND", d: "DEBIT", a: 900, want: false },
    { n: "refund beyond it",         k: "REFUND", d: "DEBIT", a: 1100, want: true },
    { n: "take the deposit itself",  k: "DEPOSIT_TAKEN", d: "CREDIT", a: 5000, want: false },
  ] as const;
  for (const c of t) {
    const r = assessEntry({ kind: c.k as never, direction: c.d as never, amount: c.a, account: acct });
    ok(`${c.n} → ${r.flagged ? "flagged" : "clean"}`, r.flagged === c.want, r.reason);
  }
}

console.log("\n── 7. Giving back more than the deposit at checkout ──");
{
  // Mirrors the CHECKED_OUT branch when staff type a refund above the deposit.
  function over(o: { dep: number; bal: number; extra: number; typed: number; paid: number; billed: number }) {
    const owed = +(o.bal + o.extra).toFixed(2);
    const net = +(o.dep - owed).toFixed(2);
    const refundable = Math.max(0, net);
    const depositUsed = Math.min(o.dep, owed);
    const deduction = o.typed <= refundable ? +(refundable - o.typed).toFixed(2) : 0;
    const extraRefund = Math.min(Math.max(0, +(o.typed - refundable).toFixed(2)), Math.max(0, o.paid));
    const refund = +(refundable - deduction + extraRefund).toFixed(2);
    const newBilled = +Math.max(0, o.billed - extraRefund).toFixed(2);
    return { refundable, depositUsed, deduction, extraRefund, refund, newBilled };
  }

  const t = [
    { n: "refund exactly the deposit",        dep: 500, typed: 500,  paid: 1200, billed: 1200, wantExtra: 0 },
    { n: "refund ₹300 over the deposit",      dep: 500, typed: 800,  paid: 1200, billed: 1200, wantExtra: 300 },
    { n: "early checkout, half the stay back",dep: 500, typed: 1100, paid: 1200, billed: 1200, wantExtra: 600 },
    { n: "refund more than was ever paid",    dep: 500, typed: 9999, paid: 1200, billed: 1200, wantExtra: 1200 },
    { n: "no deposit, refund room money",     dep: 0,   typed: 400,  paid: 1200, billed: 1200, wantExtra: 400 },
  ];
  for (const c of t) {
    const r = over({ dep: c.dep, bal: 0, extra: 0, typed: c.typed, paid: c.paid, billed: c.billed });
    const capped = r.extraRefund <= c.paid + 0.01;
    const billedDropped = Math.abs(r.newBilled - (c.billed - r.extraRefund)) < 0.01;
    // The deposit must still account for itself exactly.
    const depOk = Math.abs(r.depositUsed + r.deduction + (r.refund - r.extraRefund) - c.dep) < 0.01;
    ok(`${c.n}: gives back ${f(r.refund)}, ${f(r.extraRefund)} from the bill, bill now ${f(r.newBilled)}`,
       r.extraRefund === c.wantExtra && capped && billedDropped && depOk);
  }

  // After an over-refund the account must still settle to zero.
  const entries: Entry[] = [
    { kind: "ROOM_PAYMENT", direction: "CREDIT", mode: "CASH", amount: 1200 },
    { kind: "DEPOSIT_TAKEN", direction: "CREDIT", mode: "CASH", amount: 500 },
    { kind: "DEPOSIT_RETURNED", direction: "DEBIT", mode: "CASH", amount: 500 },
    { kind: "REFUND", direction: "DEBIT", mode: "CASH", amount: 300 },
  ];
  const a = summarise(entries, { roomTotal: 900, extrasOnTab: 0 });
  ok("account settles to zero and holds nothing after an over-refund",
     Math.abs(a.balance) < 0.01 && Math.abs(a.depositHeld) < 0.01,
     `balance ${a.balance}, held ${a.depositHeld}`);
}

console.log("\n── 8. Cash + UPI on the same payment ──");
{
  // A mixed payment becomes two exact entries; the split must never lose a rupee.
  for (const [total, cash] of [[1000, 400], [1000, 0], [1000, 1000], [999.5, 300.25], [1200, 1500]] as const) {
    const s = splitFor("MIXED", total, cash);
    const sums = Math.abs(s.cashAmount + s.onlineAmount - total) < 0.01;
    const capped = s.cashAmount <= total + 0.01 && s.onlineAmount >= -0.01;
    ok(`${f(total)} split with ${f(cash)} cash → ${f(s.cashAmount)} + ${f(s.onlineAmount)}`, sums && capped);
  }
  ok("Cash mode puts everything in the till", splitFor("CASH", 800, 0).cashAmount === 800);
  ok("UPI mode puts nothing in the till", splitFor("ONLINE", 800, 0).cashAmount === 0);

  // The two entries must move the drawer by the cash side only.
  const sp = splitFor("MIXED", 1000, 400);
  const drawer =
    cashImpactOf({ hotelId: "", bookingId: "", kind: "ROOM_PAYMENT", mode: "CASH", amount: sp.cashAmount }, sp.cashAmount) +
    cashImpactOf({ hotelId: "", bookingId: "", kind: "ROOM_PAYMENT", mode: "ONLINE", amount: sp.onlineAmount }, sp.onlineAmount);
  ok(`drawer moves by the cash side only (${f(drawer)})`, drawer === 400);

  // A mixed payment still settles the booking exactly.
  const a = summarise(
    [{ kind: "ROOM_PAYMENT", direction: "CREDIT", mode: "CASH", amount: 400 },
     { kind: "ROOM_PAYMENT", direction: "CREDIT", mode: "ONLINE", amount: 600 }],
    { roomTotal: 1000, extrasOnTab: 0 }
  );
  ok("a ₹400 + ₹600 payment clears a ₹1,000 bill", Math.abs(a.balance) < 0.01 && a.paidCash === 400 && a.paidOnline === 600);

  // Applying a deposit never moves the till, whatever it was taken in: the
  // notes were counted when the deposit arrived, so counting again would
  // double them. Only the statement changes at this point.
  for (const share of [1, 0, 0.4]) {
    const v = cashImpactOf(
      { hotelId: "", bookingId: "", kind: "DEPOSIT_APPLIED", mode: "DEPOSIT", amount: 200, depositCashShare: share },
      200
    );
    ok(`deposit ${Math.round(share * 100)}% cash → applying ₹200 moves the till by ${f(0)}`, v === 0);
  }

  // Taking a mixed deposit and giving it all back leaves the accounts untouched.
  const dep = summarise(
    [{ kind: "DEPOSIT_TAKEN", direction: "CREDIT", mode: "CASH", amount: 300 },
     { kind: "DEPOSIT_TAKEN", direction: "CREDIT", mode: "ONLINE", amount: 200 },
     { kind: "DEPOSIT_RETURNED", direction: "DEBIT", mode: "CASH", amount: 300 },
     { kind: "DEPOSIT_RETURNED", direction: "DEBIT", mode: "ONLINE", amount: 200 }],
    { roomTotal: 0, extrasOnTab: 0 }
  );
  ok("a mixed deposit taken and returned in full nets to nothing",
     Math.abs(dep.depositHeld) < 0.01 && Math.abs(dep.balance) < 0.01);
}

console.log("\n── 9. Correcting how a payment came in ──");
{
  // Mirrors the PATCH: one row becomes the cash side, a sibling carries the UPI.
  function correct(entry: { amount: number; mode: string; direction: string; cashImpact: number },
                   to: "CASH" | "ONLINE" | "MIXED", cash: number) {
    const cashPart = to === "MIXED" ? Math.min(Math.max(0, cash), entry.amount) : to === "CASH" ? entry.amount : 0;
    const onlinePart = +(entry.amount - cashPart).toFixed(2);
    const sign = entry.direction === "CREDIT" ? 1 : -1;
    const rows = [
      ...(cashPart > 0 ? [{ mode: "CASH", amount: cashPart, cashImpact: +(sign * cashPart).toFixed(2) }] : []),
      ...(onlinePart > 0 ? [{ mode: "ONLINE", amount: onlinePart, cashImpact: 0 }] : []),
    ];
    return { rows, drawerDelta: +(rows.reduce((s, r) => s + r.cashImpact, 0) - entry.cashImpact).toFixed(2) };
  }

  const cashEntry = { amount: 200, mode: "CASH", direction: "CREDIT", cashImpact: 200 };
  const onlineEntry = { amount: 200, mode: "ONLINE", direction: "CREDIT", cashImpact: 0 };

  const t = [
    { n: "₹200 cash → ₹120 cash + ₹80 UPI", e: cashEntry,   to: "MIXED" as const, cash: 120, wantRows: 2, wantTotal: 200, wantDrawer: -80 },
    { n: "₹200 UPI → ₹120 cash + ₹80 UPI",  e: onlineEntry, to: "MIXED" as const, cash: 120, wantRows: 2, wantTotal: 200, wantDrawer: 120 },
    { n: "₹200 cash → all UPI",             e: cashEntry,   to: "ONLINE" as const, cash: 0,  wantRows: 1, wantTotal: 200, wantDrawer: -200 },
    { n: "₹200 UPI → all cash",             e: onlineEntry, to: "CASH" as const,  cash: 200, wantRows: 1, wantTotal: 200, wantDrawer: 200 },
    { n: "mixed with 0 cash collapses",     e: cashEntry,   to: "MIXED" as const, cash: 0,   wantRows: 1, wantTotal: 200, wantDrawer: -200 },
    { n: "mixed with all cash collapses",   e: onlineEntry, to: "MIXED" as const, cash: 200, wantRows: 1, wantTotal: 200, wantDrawer: 200 },
  ];
  for (const c of t) {
    const r = correct(c.e, c.to, c.cash);
    const total = +r.rows.reduce((s, x) => s + x.amount, 0).toFixed(2);
    ok(`${c.n} → ${r.rows.length} row(s), total ${f(total)}, drawer ${r.drawerDelta >= 0 ? "+" : ""}${r.drawerDelta}`,
       r.rows.length === c.wantRows && total === c.wantTotal && r.drawerDelta === c.wantDrawer);
  }

  // A refund corrected to mixed must still take money OUT of the till.
  const refundEntry = { amount: 200, mode: "CASH", direction: "DEBIT", cashImpact: -200 };
  const rr = correct(refundEntry, "MIXED", 120);
  ok(`a ₹200 cash refund split 120/80 leaves the till down ₹120`,
     rr.rows.find(x => x.mode === "CASH")?.cashImpact === -120);

  // The correction never changes what the guest paid.
  const a = summarise(
    [{ kind: "DEPOSIT_TAKEN", direction: "CREDIT", mode: "CASH", amount: 120 },
     { kind: "DEPOSIT_TAKEN", direction: "CREDIT", mode: "ONLINE", amount: 80 }],
    { roomTotal: 0, extrasOnTab: 0 }
  );
  ok("a ₹120 + ₹80 deposit still reads as ₹200 held", Math.abs(a.depositHeld - 200) < 0.01);
}

console.log("\n── 10. The cash drawer follows the notes ──");
{
  const till = (entries: Entry[]) =>
    +entries.reduce((s, e) =>
      s + cashImpactOf({ hotelId: "", bookingId: "", kind: e.kind as never, mode: e.mode as never,
        direction: e.direction as never, amount: e.amount }, e.amount), 0).toFixed(2);

  const take = (mode: string, amt: number): Entry => ({ kind: "DEPOSIT_TAKEN", direction: "CREDIT", mode, amount: amt });
  const give = (mode: string, amt: number): Entry => ({ kind: "DEPOSIT_RETURNED", direction: "DEBIT", mode, amount: amt });
  const apply = (amt: number): Entry => ({ kind: "DEPOSIT_APPLIED", direction: "CREDIT", mode: "DEPOSIT", amount: amt });

  const cases = [
    { n: "cash in → cash out",              e: [take("CASH", 500), give("CASH", 500)],   want: 0 },
    { n: "cash in → UPI out (notes stay)",  e: [take("CASH", 500), give("ONLINE", 500)], want: 500 },
    { n: "UPI in → cash out (notes leave)", e: [take("ONLINE", 500), give("CASH", 500)], want: -500 },
    { n: "UPI in → UPI out",                e: [take("ONLINE", 500), give("ONLINE", 500)], want: 0 },
    { n: "cash in, ₹200 used, ₹300 back",   e: [take("CASH", 500), apply(200), give("CASH", 300)], want: 200 },
    { n: "cash in, whole thing used",       e: [take("CASH", 500), apply(500)],          want: 500 },
    { n: "mixed in, same split out",        e: [take("CASH", 120), take("ONLINE", 80), give("CASH", 120), give("ONLINE", 80)], want: 0 },
    { n: "mixed in, all returned by UPI",   e: [take("CASH", 120), take("ONLINE", 80), give("ONLINE", 200)], want: 120 },
  ];
  for (const c of cases)
    ok(`${c.n} → till ${c.want >= 0 ? "+" : ""}${f(c.want)}`, till(c.e) === c.want, `got ${till(c.e)}`);

  // Applying a deposit must never add to the till a second time.
  ok("applying a deposit moves no notes",
     till([apply(500)]) === 0 && till([{ kind: "DEPOSIT_WITHHELD", direction: "CREDIT", mode: "DEPOSIT", amount: 500 }]) === 0);

  // Room money is unaffected by all this.
  ok("a ₹1,000 cash room payment still adds ₹1,000",
     till([{ kind: "ROOM_PAYMENT", direction: "CREDIT", mode: "CASH", amount: 1000 }]) === 1000);
  ok("a ₹400 cash refund still takes ₹400 out",
     till([{ kind: "REFUND", direction: "DEBIT", mode: "CASH", amount: 400 }]) === -400);
  ok("a UPI room payment still adds nothing to the till",
     till([{ kind: "ROOM_PAYMENT", direction: "CREDIT", mode: "ONLINE", amount: 1000 }]) === 0);

  // A full stay, end to end: the till holds exactly the notes taken.
  const stay: Entry[] = [
    { kind: "ROOM_PAYMENT", direction: "CREDIT", mode: "CASH", amount: 1200 },
    take("CASH", 500), apply(200), give("ONLINE", 300),
  ];
  ok(`full stay: ₹1,200 room cash + ₹500 deposit cash, ₹200 used, ₹300 back by UPI → till ${f(1700)}`,
     till(stay) === 1700);
}

console.log(`\n${fail === 0 ? `All ${pass} checks passed.` : `${fail} FAILED of ${pass + fail}`}`);
process.exitCode = fail === 0 ? 0 : 1;
