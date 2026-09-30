/**
 * Checks the nightly accounts sheet against live data.
 *
 *   npx tsx --env-file=.env scripts/audit-daily-accounts.ts
 *
 * Read-only: builds sheets and signs links, sends nothing, writes nothing.
 *
 * The figures are re-derived here a second way — rows fetched plainly and
 * sorted into days in JavaScript — rather than trusting the sheet's own
 * queries, so a mistake in those queries shows up as a disagreement.
 */
import { prisma } from "@/lib/db/prisma";
import { OTA_PREPAID_SOURCES } from "@/lib/ota/sources";
import {
  buildDailyAccounts, type DailyAccounts, drawerAsOf, isSheetDate, latestClosedSheetDate, pdfSafe,
  renderDailyAccountsPdf, sheetWindow, signedSheetUrl, verifySheetLink,
} from "@/lib/services/daily-accounts";
import { deliverDailyAccounts } from "@/lib/services/daily-accounts-delivery";

let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail ? `  — ${detail}` : ""}`); }
}
const eq = (a: number, b: number) => Math.abs(a - b) < 0.005;
const shift = (d: string, n: number) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + n)).toISOString().slice(0, 10);
const at = (iso: string) => new Date(iso);

async function main() {
  console.log("\n── 1. Where a day starts and ends ──");
  {
    const w = sheetWindow("2026-09-30");
    ok("30 Sep runs 11 pm 29 Sep → 11 pm 30 Sep (IST)",
      w.start.toISOString() === "2026-09-29T17:30:00.000Z" && w.end.toISOString() === "2026-09-30T17:30:00.000Z");
    const y = sheetWindow("2027-01-01");
    ok("1 Jan starts 11 pm on 31 Dec", y.start.toISOString() === "2026-12-31T17:30:00.000Z");

    const cases: [string, string][] = [
      ["2026-09-30T22:59:00+05:30", "2026-09-29"],
      ["2026-09-30T23:00:00+05:30", "2026-09-30"],
      ["2026-09-30T23:30:00+05:30", "2026-09-30"],
      ["2026-10-01T00:29:59+05:30", "2026-09-30"],
      ["2026-10-01T10:00:00+05:30", "2026-09-30"],
      ["2027-01-01T00:10:00+05:30", "2026-12-31"],
    ];
    for (const [when, want] of cases) {
      ok(`run at ${when.slice(0, 16)} IST sends ${want}`, latestClosedSheetDate(at(when)) === want);
    }
    // The schedule is "0 18 * * *" UTC. On the Hobby plan Vercel may fire it at
    // any minute of that hour; every one of them must name the same day.
    let allRight = true;
    for (let m = 0; m < 60; m++) {
      const t = new Date(Date.UTC(2026, 8, 30, 18, m, 59));
      if (latestClosedSheetDate(t) !== "2026-09-30") allRight = false;
      if (t < sheetWindow("2026-09-30").end) allRight = false;
    }
    ok("any minute the scheduler picks (11:30 pm–12:29 am) is after the cut-off and names the right day", allRight);

    ok("real dates accepted", isSheetDate("2026-09-30") && isSheetDate("2028-02-29"));
    ok("impossible or malformed dates refused",
      !isSheetDate("2026-02-30") && !isSheetDate("2026-9-3") && !isSheetDate("2026-09-30x") && !isSheetDate(null));
  }

  console.log("\n── 2. Text the PDF font cannot print ──");
  ok("₹ and arrows are spelled out", pdfSafe("₹200 → cash") === "Rs. 200 -> cash");
  ok("emoji dropped, dashes kept", pdfSafe("water — paid 👍") === "water — paid");

  console.log("\n── 3. The WhatsApp link ──");
  {
    const hotel = "hotel_abc";
    const url = new URL(signedSheetUrl(hotel, "2026-09-29"));
    const q = (k: string) => url.searchParams.get(k);
    const good = { h: q("h"), d: q("d"), e: q("e"), s: q("s") };
    ok("a fresh link opens its own day", JSON.stringify(verifySheetLink(good)) === JSON.stringify({ hotelId: hotel, date: "2026-09-29" }));
    ok("changing the day breaks it", verifySheetLink({ ...good, d: "2026-09-28" }) === null);
    ok("changing the hotel breaks it", verifySheetLink({ ...good, h: "hotel_other" }) === null);
    ok("extending the expiry breaks it", verifySheetLink({ ...good, e: String(Number(good.e) + 86400) }) === null);
    ok("a cut-short signature is refused", verifySheetLink({ ...good, s: good.s!.slice(0, 10) }) === null);
    ok("it stops working after three days",
      verifySheetLink(good, new Date(Date.now() + 3 * 86400_000 + 60_000)) === null &&
      verifySheetLink(good, new Date(Date.now() + 3 * 86400_000 - 60_000)) !== null);
  }

  const hotel = await prisma.hotel.findFirstOrThrow({ where: { isActive: true }, select: { id: true } });
  const hotelId = hotel.id;
  // The ledger took its present form on 27 Aug; sheets are checked from then on.
  const first = "2026-08-28";
  const last = latestClosedSheetDate();
  const days: string[] = [];
  for (let d = first; d <= last; d = shift(d, 1)) days.push(d);

  console.log(`\n── 4. Every day from ${first} to ${last} (${days.length} sheets) ──`);
  const sheets: DailyAccounts[] = [];
  for (const d of days) sheets.push(await buildDailyAccounts(hotelId, d));

  // A second, independent reading: every row fetched plainly, sorted into days here.
  const span = { gte: sheetWindow(first).start, lt: sheetWindow(last).end };
  const MIG = (k: string | null) => !!k && (k.startsWith("bf:") || k.startsWith("dep-"));
  const allGuest = await prisma.bookingTxn.findMany({
    where: { hotelId, booking: { source: { notIn: OTA_PREPAID_SOURCES } } },
    select: { id: true, idemKey: true, occurredAt: true, createdAt: true, affectsStatement: true, cashImpact: true, amount: true, direction: true, mode: true },
  });
  const whenOf = (r: (typeof allGuest)[number]) => (MIG(r.idemKey) ? r.occurredAt : r.createdAt);
  const dayOf = (t: Date) => days.find(d => { const w = sheetWindow(d); return t >= w.start && t < w.end; });
  const [expenses, collections, checkedIn] = await Promise.all([
    prisma.hotelExpense.findMany({ where: { hotelId, createdAt: span } }),
    prisma.cashCollection.findMany({ where: { hotelId, createdAt: span } }),
    prisma.booking.findMany({
      where: { hotelId, checkedInAt: span, status: { notIn: ["CANCELLED", "NO_SHOW"] } },
      select: { checkedInAt: true, totalAmount: true },
    }),
  ]);

  let balances = true, chained = true, rowsAgree = true, cashAgree = true, sumsAgree = true, checkinsAgree = true;
  const problems: string[] = [];
  sheets.forEach((s, i) => {
    const d = s.date;
    if (!s.drawer.balances) { balances = false; problems.push(`${d}: drawer does not walk`); }
    if (i > 0 && !eq(s.drawer.opening, sheets[i - 1].drawer.closing)) {
      chained = false; problems.push(`${d}: opens ${s.drawer.opening}, previous closed ${sheets[i - 1].drawer.closing}`);
    }

    const mine = allGuest.filter(r => r.affectsStatement && dayOf(whenOf(r)) === d);
    const exp = expenses.filter(e => dayOf(e.createdAt) === d);
    if (s.rows.length !== mine.length + exp.length) {
      rowsAgree = false; problems.push(`${d}: sheet has ${s.rows.length} entries, expected ${mine.length + exp.length}`);
    }

    const inSum = s.rows.reduce((a, r) => a + r.amountIn, 0);
    const outSum = s.rows.reduce((a, r) => a + r.amountOut, 0);
    if (!eq(inSum, s.moneyIn.total) || !eq(outSum, s.moneyOut.total)) {
      sumsAgree = false; problems.push(`${d}: entries add to ${inSum}/${outSum}, summary says ${s.moneyIn.total}/${s.moneyOut.total}`);
    }

    // Cash, counted three ways: the sheet's Cash column, its drawer lines, and
    // the notes each entry moved, summed here.
    const all = allGuest.filter(r => dayOf(whenOf(r)) === d);
    const stmtCashIn = mine.filter(r => r.cashImpact > 0).reduce((a, r) => a + r.cashImpact, 0)
      + exp.filter(e => e.entryType === "CREDIT" && e.mode === "CASH").reduce((a, e) => a + e.amount, 0);
    const stmtCashOut = mine.filter(r => r.cashImpact < 0).reduce((a, r) => a - r.cashImpact, 0)
      + exp.filter(e => e.entryType === "DEBIT" && e.mode === "CASH").reduce((a, e) => a + e.amount, 0);
    const depIn = all.filter(r => !r.affectsStatement && r.cashImpact > 0).reduce((a, r) => a + r.cashImpact, 0);
    const depOut = all.filter(r => !r.affectsStatement && r.cashImpact < 0).reduce((a, r) => a - r.cashImpact, 0);
    const took = collections.filter(c => dayOf(c.createdAt) === d).reduce((a, c) => a + c.amount, 0);
    const cashCol = s.rows.filter(r => r.mode === "Cash");
    if (!eq(stmtCashIn, s.drawer.cashIn) || !eq(stmtCashOut, s.drawer.cashOut) ||
        !eq(depIn, s.drawer.depositsIn) || !eq(depOut, s.drawer.depositsOut) ||
        !eq(took, s.drawer.ownerTook.reduce((a, c) => a + c.amount, 0)) ||
        !eq(cashCol.reduce((a, r) => a + r.amountIn, 0), s.moneyIn.cash) ||
        !eq(cashCol.reduce((a, r) => a + r.amountOut, 0), s.moneyOut.cash) ||
        !eq(s.moneyIn.cash, s.drawer.cashIn) || !eq(s.moneyOut.cash, s.drawer.cashOut)) {
      cashAgree = false; problems.push(`${d}: cash figures disagree`);
    }

    const cin = checkedIn.filter(b => dayOf(b.checkedInAt!) === d);
    if (cin.length !== s.checkins.length || !eq(cin.reduce((a, b) => a + b.totalAmount, 0), s.checkinTotal)) {
      checkinsAgree = false; problems.push(`${d}: ${s.checkins.length} check-ins on the sheet, ${cin.length} found`);
    }
  });
  ok("each day's drawer: opening + in − out = closing", balances);
  ok("each day opens with exactly what the day before closed on", chained);
  ok("every entry is on the sheet for the day it was recorded — none missing, none extra", rowsAgree);
  ok("the entries add up to the summary", sumsAgree);
  ok("cash agrees three ways: Cash column, drawer lines, notes moved per entry", cashAgree);
  ok("check-ins match everyone checked in that day, and their rents", checkinsAgree);
  problems.slice(0, 10).forEach(p => console.log(`      ${p}`));

  const listed = sheets.reduce((a, s) => a + s.rows.length, 0);
  const expected = allGuest.filter(r => r.affectsStatement && dayOf(whenOf(r))).length
    + expenses.filter(e => dayOf(e.createdAt)).length;
  ok(`across all ${days.length} days, each entry appears exactly once (${listed} listed, ${expected} recorded)`, listed === expected);

  console.log("\n── 5. Against the Accounts page ──");
  {
    // The Cash in Hand card, computed exactly as the summary route does.
    const guest = { hotelId, booking: { source: { notIn: OTA_PREPAID_SOURCES } } };
    const [drawer, expIn, expOut, took] = await Promise.all([
      prisma.bookingTxn.aggregate({ where: guest, _sum: { cashImpact: true } }),
      prisma.hotelExpense.aggregate({ where: { hotelId, entryType: "CREDIT", mode: "CASH" }, _sum: { amount: true } }),
      prisma.hotelExpense.aggregate({ where: { hotelId, entryType: "DEBIT", mode: "CASH" }, _sum: { amount: true } }),
      prisma.cashCollection.aggregate({ where: { hotelId }, _sum: { amount: true } }),
    ]);
    const cashInHand = (drawer._sum.cashImpact ?? 0) + (expIn._sum.amount ?? 0) - (expOut._sum.amount ?? 0) - (took._sum.amount ?? 0);
    const now = await drawerAsOf(hotelId, new Date(Date.now() + 1000));
    ok(`the drawer right now equals the Cash in Hand card (₹${cashInHand.toLocaleString("en-IN")})`, eq(now, cashInHand), `${now}`);

    // No ledger row is lost to the recorded-time rule (NOT over a null key).
    const total = await prisma.bookingTxn.count({ where: guest });
    ok(`every ledger entry belongs to some moment — ${allGuest.length} fetched, ${total} counted`, total === allGuest.length);
  }

  console.log("\n── 6. The PDF and the nightly job ──");
  {
    let rendered = 0, biggest = 0;
    for (const s of sheets) {
      const bytes = renderDailyAccountsPdf(s);
      if (bytes.byteLength > 1000) rendered++;
      biggest = Math.max(biggest, bytes.byteLength);
    }
    ok(`all ${sheets.length} sheets render (largest ${(biggest / 1024).toFixed(0)} KB)`, rendered === sheets.length);

    const today = await buildDailyAccounts(hotelId, shift(last, 1));
    ok("a day still running is marked open and stops at now", !today.closed && today.end.getTime() <= Date.now());

    const dry = await deliverDailyAccounts({ date: last, dryRun: true });
    ok(`dry run builds ${last} for ${dry.length} hotel(s) and sends nothing`,
      dry.length >= 1 && dry.every(r => r.email === "dry run" && r.whatsapp === "dry run" && r.balances));
    const d = dry[0];
    console.log(`      ${d.date}: ${d.checkins} check-ins · in ₹${d.moneyIn} · out ₹${d.moneyOut} · drawer ₹${d.drawer.toLocaleString("en-IN")}`);
  }

  console.log(`\n${fail === 0 ? `All ${pass} checks passed.` : `${fail} FAILED of ${pass + fail}`}`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
