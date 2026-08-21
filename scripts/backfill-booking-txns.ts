/**
 * Rebuild the money ledger for bookings taken before it existed.
 *
 *   npx tsx --env-file=.env scripts/backfill-booking-txns.ts          # dry run
 *   npx tsx --env-file=.env scripts/backfill-booking-txns.ts --write  # commit
 *
 * The history is recoverable because the counter-collection route stamped every
 * instalment into Payment.notes as a dated line, and checkout wrote what it did
 * into depositNotes. What those don't cover — the money handed over when the
 * booking was first keyed in — is whatever's left of cashPaid / onlinePaid once
 * the dated instalments are subtracted, and it belongs on the booking's own date.
 *
 * Every booking is reconciled: the entries written must add back up to the
 * booking's cashPaid + onlinePaid, or it's reported rather than half-written.
 * Re-running is safe — each entry carries a stable idemKey.
 */
import { prisma } from "../src/lib/db/prisma";

const WRITE = process.argv.includes("--write");
const SHOW = process.argv.filter(a => a.startsWith("BK-") || a.startsWith("MMT-"));

/** "[26/7/2026, 1:08:39 pm] ₹2,000 collected in cash by jyoti — note" */
const NOTE_LINE =
  /^\[(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*([\d:]+)\s*([ap]m)\]\s*₹([\d,]+(?:\.\d+)?)\s*collected\s*(in cash|via UPI\/Card)\s*by\s*([^—]+?)(?:\s*—\s*(.*))?$/i;

interface Parsed {
  at: Date;
  amount: number;
  mode: "CASH" | "ONLINE";
  by: string;
  note?: string;
}

/** IST wall-clock in the note → the UTC instant it stands for. */
function parseNoteLine(line: string): Parsed | null {
  const m = line.trim().match(NOTE_LINE);
  if (!m) return null;
  const [, d, mo, y, time, ampm, amt, how, by, extra] = m;
  const [hRaw, min, sec = "0"] = time.split(":");
  let h = parseInt(hRaw, 10) % 12;
  if (ampm.toLowerCase() === "pm") h += 12;
  const istMs = Date.UTC(+y, +mo - 1, +d, h, +min, +sec);
  return {
    at: new Date(istMs - (5 * 60 + 30) * 60_000),
    amount: parseFloat(amt.replace(/,/g, "")),
    mode: /cash/i.test(how) ? "CASH" : "ONLINE",
    by: by.trim(),
    note: extra?.trim() || undefined,
  };
}

async function main() {
  const bookings = await prisma.booking.findMany({
    select: {
      id: true, bookingRef: true, hotelId: true, createdAt: true, status: true,
      cashPaid: true, onlinePaid: true, additionalCharges: true,
      depositCollected: true, depositMode: true, depositDeducted: true,
      checkedOutAt: true, cancelledAt: true, cancellationCharge: true,
      refundAmount: true, refundStatus: true, refundedAt: true,
      payment: { select: { notes: true } },
      charges: { select: { id: true, amount: true, mode: true, paidNow: true, chargeTypes: true, addedAt: true, addedBy: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const rows: {
    hotelId: string; bookingId: string; kind: string; mode: string;
    amount: number; cashImpact: number; note: string; occurredAt: Date;
    recordedBy: string | null; idemKey: string;
  }[] = [];
  const problems: string[] = [];
  let reconciled = 0;

  for (const b of bookings) {
    const local: typeof rows = [];
    const push = (
      kind: string, mode: string, amount: number, note: string,
      occurredAt: Date, idemKey: string, cashImpact: number, recordedBy: string | null = null
    ) => {
      const amt = +amount.toFixed(2);
      if (!(amt > 0)) return;
      local.push({
        hotelId: b.hotelId, bookingId: b.id, kind, mode, amount: amt,
        cashImpact: +cashImpact.toFixed(2), note, occurredAt, recordedBy,
        idemKey: `bf:${b.id}:${idemKey}`,
      });
    };

    // ── Room money, split into the instalments the notes recorded ──
    const lines = (b.payment?.notes ?? "").split("\n").map(parseNoteLine).filter((x): x is Parsed => !!x);
    let laterCash = 0, laterOnline = 0;
    lines.forEach((p, i) => {
      if (p.mode === "CASH") laterCash += p.amount; else laterOnline += p.amount;
      push(
        "ROOM_PAYMENT", p.mode, p.amount,
        `${p.mode === "CASH" ? "Cash" : "UPI / card"} — part payment at the counter${p.note ? ` (${p.note})` : ""}`,
        p.at, `collect:${i}`, p.mode === "CASH" ? p.amount : 0, p.by
      );
    });

    // Whatever isn't accounted for by a dated instalment was taken when the
    // booking was created. Clamped at zero: a note may record a collection the
    // running total later absorbed elsewhere (e.g. money moved cash → online).
    const upfrontCash = Math.max(0, +(b.cashPaid - laterCash).toFixed(2));
    const upfrontOnline = Math.max(0, +(b.onlinePaid - laterOnline).toFixed(2));
    push("ROOM_PAYMENT", "CASH", upfrontCash, "Cash — taken at booking", b.createdAt, "upfront:cash", upfrontCash);
    push("ROOM_PAYMENT", "ONLINE", upfrontOnline, "UPI / card — taken at booking", b.createdAt, "upfront:online", 0);

    // ── Extras the guest paid for at the counter ──
    for (const c of b.charges) {
      if (!c.paidNow) continue;
      const mode = c.mode === "ONLINE" ? "ONLINE" : "CASH";
      push(
        "EXTRA_CHARGE", mode, c.amount,
        `${(c.chargeTypes[0] ?? "extra").toLowerCase().replace(/_/g, " ")} — paid at the counter`,
        c.addedAt, `charge:${c.id}`, mode === "CASH" ? c.amount : 0, c.addedBy ?? null
      );
    }

    // ── What the deposit ended up paying for ──
    // depositDeducted lumps together the deposit applied to what the guest owed
    // and anything withheld for damage. Only the split is recoverable here:
    // extras first (that's what the deposit is for), then the room balance.
    if (b.depositDeducted > 0 && b.checkedOutAt) {
      const depMode = b.depositMode === "ONLINE" ? "ONLINE" : "CASH";
      const impact = depMode === "CASH" ? 1 : 0;
      const onTab = b.charges.filter(c => !c.paidNow).reduce((s, c) => s + c.amount, 0);
      const toExtras = Math.min(b.depositDeducted, onTab);
      const toRoom = +(b.depositDeducted - toExtras).toFixed(2);
      push("DEPOSIT_APPLIED", "DEPOSIT", toExtras, "Extras during the stay — deducted from deposit",
        b.checkedOutAt, "dep:extras", toExtras * impact);
      push("DEPOSIT_APPLIED", "DEPOSIT", toRoom, "Unpaid room balance — deducted from deposit",
        b.checkedOutAt, "dep:room", toRoom * impact);
    }

    // ── Refunds actually returned ──
    if ((b.refundAmount ?? 0) > 0 && b.refundStatus === "PROCESSED") {
      const credited = local.reduce((s, r) => s + r.amount, 0);
      const amt = Math.min(b.refundAmount!, credited);
      const online = b.refundStatus === "PROCESSED" && b.onlinePaid > 0;
      push("REFUND", online ? "ONLINE" : "CASH", amt,
        b.cancelledAt ? "Refunded on cancellation" : "Refunded to the guest",
        b.refundedAt ?? b.cancelledAt ?? b.createdAt, "refund", online ? 0 : -amt);
    }

    // ── Reconcile: room money in the ledger must equal the booking's totals ──
    const roomCash = local.filter(r => r.kind === "ROOM_PAYMENT" && r.mode === "CASH").reduce((s, r) => s + r.amount, 0);
    const roomOnline = local.filter(r => r.kind === "ROOM_PAYMENT" && r.mode === "ONLINE").reduce((s, r) => s + r.amount, 0);
    if (Math.abs(roomCash - b.cashPaid) > 0.5 || Math.abs(roomOnline - b.onlinePaid) > 0.5) {
      problems.push(
        `${b.bookingRef}: ledger cash ₹${roomCash} vs ₹${b.cashPaid}, online ₹${roomOnline} vs ₹${b.onlinePaid}`
      );
    } else {
      reconciled++;
    }
    if (SHOW.includes(b.bookingRef)) {
      console.log(`\n── ${b.bookingRef} (total paid: cash ₹${b.cashPaid} + online ₹${b.onlinePaid}, deposit ₹${b.depositCollected} ${b.depositMode ?? ""}, deducted ₹${b.depositDeducted})`);
      for (const r of local)
        console.log(`   ${r.occurredAt.toISOString().slice(0, 16).replace("T", " ")}  ${r.kind.padEnd(16)} ${r.mode.padEnd(7)} ₹${String(r.amount).padStart(6)}  drawer ${r.cashImpact >= 0 ? "+" : ""}${r.cashImpact}  ${r.note}`);
    }
    rows.push(...local);
  }

  const credits = rows.filter(r => r.kind !== "REFUND").reduce((s, r) => s + r.amount, 0);
  const debits = rows.filter(r => r.kind === "REFUND").reduce((s, r) => s + r.amount, 0);
  const cash = rows.reduce((s, r) => s + r.cashImpact, 0);
  const byKind = rows.reduce<Record<string, { n: number; sum: number }>>((acc, r) => {
    (acc[r.kind] ??= { n: 0, sum: 0 }).n++;
    acc[r.kind].sum += r.amount;
    return acc;
  }, {});

  console.log(`\nBookings scanned : ${bookings.length}`);
  console.log(`Ledger entries   : ${rows.length}`);
  console.log(`Reconciled       : ${reconciled}/${bookings.length}`);
  console.log(`Credits ₹${credits.toFixed(0)} | Refunds ₹${debits.toFixed(0)} | Cash drawer effect ₹${cash.toFixed(0)}`);
  console.log("\nBy kind:");
  for (const [k, v] of Object.entries(byKind)) console.log(`  ${k.padEnd(18)} ${String(v.n).padStart(4)} entries  ₹${v.sum.toFixed(0)}`);

  if (problems.length) {
    console.log(`\n⚠  ${problems.length} booking(s) did not reconcile:`);
    for (const p of problems.slice(0, 25)) console.log(`   ${p}`);
  }

  if (!WRITE) {
    console.log("\nDry run — nothing written. Re-run with --write to commit.");
    return;
  }

  let written = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const res = await prisma.bookingTxn.createMany({
      data: batch as never,
      skipDuplicates: true,
    });
    written += res.count;
  }
  console.log(`\n✔ Wrote ${written} ledger entries (${rows.length - written} already present).`);
}

main().catch(e => console.error("BACKFILL FAILED:", e)).finally(async () => { await prisma.$disconnect(); });
