import crypto from "crypto";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { prisma } from "@/lib/db/prisma";
import { OTA_PREPAID_SOURCES } from "@/lib/ota/sources";
import { getCategoryMeta } from "@/lib/utils/room-categories";
import { ledgerRowToItem } from "@/lib/services/accounts-statement";

/**
 * The daily accounts sheet sent to the owner every night.
 *
 * Page one lists who checked in; below it is every rupee that moved, and at the
 * foot the cash drawer walked from last night's figure to tonight's.
 *
 * A day runs from 11:00 pm to 11:00 pm, not midnight to midnight. The sheet
 * goes out after 11 pm, and a day that ran to midnight would still be open when
 * it was sent — whatever happened in the last hour would then be in no sheet at
 * all. With the cut-off at 11 pm, each day starts exactly where the one before
 * stopped.
 *
 * Entries are placed by when they were RECORDED, not by the time written on
 * them. Staff can put an earlier time on an entry, and correcting a payment's
 * mode re-posts it under the original payment's time — if the sheet went by
 * those times, a correction made today for yesterday would land in yesterday's
 * sheet, which has already been sent, and the owner would never see it. Placed
 * by recording time, every entry is in exactly one sheet, and tonight's closing
 * drawer is always tomorrow's opening drawer.
 */

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 24 * 3600_000;
/** The hour, in IST, at which one day's sheet closes and the next begins. */
export const CUTOFF_HOUR_IST = 23;

// ─── Days ────────────────────────────────────────────────────────────────────

export function isSheetDate(s: string | null | undefined): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** The day a sheet is named for runs from 11 pm the evening before to 11 pm on it. */
export function sheetWindow(date: string): { start: Date; end: Date } {
  const [y, m, d] = date.split("-").map(Number);
  const end = new Date(Date.UTC(y, m - 1, d, CUTOFF_HOUR_IST) - IST_OFFSET_MS);
  return { start: new Date(end.getTime() - DAY_MS), end };
}

/**
 * The most recent day whose sheet has closed. Before 11 pm that is yesterday;
 * from 11 pm, today. So the nightly job names the right day whether it runs at
 * 11:30 pm or, delayed by the scheduler, at half past midnight.
 */
export function latestClosedSheetDate(now = new Date()): string {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  if (ist.getUTCHours() < CUTOFF_HOUR_IST) ist.setUTCDate(ist.getUTCDate() - 1);
  return ist.toISOString().slice(0, 10);
}

/** Today's date in IST, as YYYY-MM-DD. */
export function todayIST(now = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

const istDateOf = (d: Date) => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

// ─── Which moment an entry belongs to ────────────────────────────────────────

/**
 * Rows written by the one-off migrations that built the ledger from older
 * records carry the time of the migration as their recording time, so those
 * alone are placed by the time the money actually moved.
 */
const MIGRATED = [{ idemKey: { startsWith: "bf:" } }, { idemKey: { startsWith: "dep-" } }];

function recordedIn(range: { gte?: Date; lt: Date }) {
  return {
    OR: [
      { AND: [{ OR: MIGRATED }, { occurredAt: range }] },
      {
        AND: [
          // Spelled out rather than as NOT(OR …): a NOT over a null key is
          // null in SQL, which would drop every ordinary entry.
          { OR: [{ idemKey: null }, { AND: MIGRATED.map(m => ({ NOT: m })) }] },
          { createdAt: range },
        ],
      },
    ],
  };
}

function recordedAt(t: { idemKey: string | null; occurredAt: Date; createdAt: Date }): Date {
  const migrated = !!t.idemKey && (t.idemKey.startsWith("bf:") || t.idemKey.startsWith("dep-"));
  return migrated ? t.occurredAt : t.createdAt;
}

/** Guest money the hotel handles itself — OTA-prepaid stays are paid to the channel. */
const guestMoney = (hotelId: string) => ({
  hotelId,
  booking: { source: { notIn: OTA_PREPAID_SOURCES } },
});

/**
 * Notes that should be in the drawer at a given moment: the same sum the
 * Accounts page shows as Cash in Hand, but counting only what had been recorded
 * by then. At the present moment the two are the same figure.
 */
export async function drawerAsOf(hotelId: string, at: Date): Promise<number> {
  const [guest, expIn, expOut, taken] = await Promise.all([
    prisma.bookingTxn.aggregate({
      where: { AND: [guestMoney(hotelId), recordedIn({ lt: at })] },
      _sum: { cashImpact: true },
    }),
    prisma.hotelExpense.aggregate({
      where: { hotelId, entryType: "CREDIT", mode: "CASH", createdAt: { lt: at } },
      _sum: { amount: true },
    }),
    prisma.hotelExpense.aggregate({
      where: { hotelId, entryType: "DEBIT", mode: "CASH", createdAt: { lt: at } },
      _sum: { amount: true },
    }),
    prisma.cashCollection.aggregate({
      where: { hotelId, createdAt: { lt: at } },
      _sum: { amount: true },
    }),
  ]);
  return round2(
    (guest._sum.cashImpact ?? 0) + (expIn._sum.amount ?? 0) -
    (expOut._sum.amount ?? 0) - (taken._sum.amount ?? 0)
  );
}

// ─── The sheet ───────────────────────────────────────────────────────────────

export interface SheetCheckin {
  bookingRef: string;
  room: string;
  guest: string;
  rent: number;
}

export type SheetMode = "Cash" | "UPI" | "Deposit";

export interface SheetRow {
  at: Date;
  /** Set when the entry is about an earlier day than the one it was recorded on. */
  forDate: string | null;
  what: string;
  who: string;
  mode: SheetMode;
  amountIn: number;
  amountOut: number;
}

interface Split { cash: number; upi: number; deposit: number; total: number }

export interface DailyAccounts {
  hotelId: string;
  hotelName: string;
  date: string;
  start: Date;
  end: Date;
  /** False while the day is still running — the sheet then stops at `end` = now. */
  closed: boolean;
  generatedAt: Date;
  checkins: SheetCheckin[];
  checkinTotal: number;
  /** Due to arrive that day but still not checked in when the sheet was made. */
  notArrived: { bookingRef: string; guest: string }[];
  rows: SheetRow[];
  moneyIn: Split;
  moneyOut: Split;
  drawer: {
    opening: number;
    cashIn: number;
    cashOut: number;
    depositsIn: number;
    depositsOut: number;
    ownerTook: { at: Date; amount: number; note: string | null }[];
    closing: number;
    /** Opening plus the day's movements, against the drawer counted afresh. */
    balances: boolean;
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function buildDailyAccounts(hotelId: string, date: string, now = new Date()): Promise<DailyAccounts> {
  if (!isSheetDate(date)) throw new Error(`Not a date: ${date}`);
  const window = sheetWindow(date);
  const closed = now >= window.end;
  const end = closed ? window.end : now;
  const start = window.start;
  const range = { gte: start, lt: end };

  const [hotel, checkins, due, txns, expenses, collections, opening, closing] = await Promise.all([
    prisma.hotel.findUniqueOrThrow({ where: { id: hotelId }, select: { name: true } }),

    // Everyone who actually walked in, by the time staff checked them in — a
    // late arrival is counted on the night they arrived, not the night booked.
    prisma.booking.findMany({
      where: { hotelId, checkedInAt: range, status: { notIn: ["CANCELLED", "NO_SHOW"] } },
      select: {
        bookingRef: true, totalAmount: true, roomCategory: true,
        room: { select: { roomNumber: true } },
        primaryGuest: { select: { name: true } },
      },
      orderBy: [{ checkedInAt: "asc" }, { bookingRef: "asc" }],
    }),

    // Check-in dates are stored as midnight UTC of the calendar day.
    prisma.booking.findMany({
      where: {
        hotelId,
        checkInDate: new Date(`${date}T00:00:00.000Z`),
        status: "CONFIRMED",
      },
      select: { bookingRef: true, primaryGuest: { select: { name: true } } },
      orderBy: { bookingRef: "asc" },
    }),

    prisma.bookingTxn.findMany({
      where: { AND: [guestMoney(hotelId), recordedIn(range)] },
      select: {
        id: true, kind: true, direction: true, mode: true, amount: true, cashImpact: true,
        note: true, occurredAt: true, createdAt: true, idemKey: true,
        affectsStatement: true, flagged: true, flagReason: true,
        booking: {
          select: {
            bookingRef: true, noOfNights: true, roomCategory: true,
            room: { select: { roomNumber: true } },
            primaryGuest: { select: { name: true } },
          },
        },
      },
    }),

    prisma.hotelExpense.findMany({ where: { hotelId, createdAt: range } }),
    prisma.cashCollection.findMany({ where: { hotelId, createdAt: range }, orderBy: { createdAt: "asc" } }),

    drawerAsOf(hotelId, start),
    drawerAsOf(hotelId, end),
  ]);

  // ── Check-ins ──
  const checkinRows: SheetCheckin[] = checkins.map(b => ({
    bookingRef: b.bookingRef,
    room: b.room?.roomNumber ?? getCategoryMeta(b.roomCategory).displayName,
    guest: b.primaryGuest.name,
    rent: round2(b.totalAmount),
  }));

  // ── Money ──
  const rows: SheetRow[] = [];
  const moneyIn: Split = { cash: 0, upi: 0, deposit: 0, total: 0 };
  const moneyOut: Split = { cash: 0, upi: 0, deposit: 0, total: 0 };
  let cashIn = 0, cashOut = 0, depositsIn = 0, depositsOut = 0;

  for (const t of txns) {
    // The refundable deposit passing through is the guest's money: it is kept
    // off the statement and so off this list, but the notes are still in the
    // drawer, so they are counted there.
    if (!t.affectsStatement) {
      if (t.cashImpact > 0) depositsIn += t.cashImpact;
      else depositsOut += -t.cashImpact;
      continue;
    }
    if (t.cashImpact > 0) cashIn += t.cashImpact;
    else cashOut += -t.cashImpact;

    const item = ledgerRowToItem(t);
    const at = recordedAt(t);
    const mode: SheetMode = t.mode === "CASH" ? "Cash" : t.mode === "ONLINE" ? "UPI" : "Deposit";
    const bucket = mode === "Cash" ? "cash" : mode === "UPI" ? "upi" : "deposit";
    const side = item.isDebit ? moneyOut : moneyIn;
    side[bucket] += t.amount;
    rows.push({
      at,
      forDate: istDateOf(t.occurredAt) !== istDateOf(at) ? istDateOf(t.occurredAt) : null,
      what: item.description,
      who: `${t.booking.primaryGuest.name} · ${t.booking.bookingRef}`,
      mode,
      amountIn: item.isDebit ? 0 : t.amount,
      amountOut: item.isDebit ? t.amount : 0,
    });
  }

  for (const e of expenses) {
    const isOut = e.entryType === "DEBIT";
    // Expenses can only be entered as cash or UPI. The drawer counts cash ones
    // alone, exactly as Cash in Hand does, so anything else sits with UPI here.
    const cash = e.mode === "CASH";
    if (cash) { if (isOut) cashOut += e.amount; else cashIn += e.amount; }
    (isOut ? moneyOut : moneyIn)[cash ? "cash" : "upi"] += e.amount;
    // Expense dates are stored as midnight UTC of the calendar day.
    const dated = e.expenseDate.toISOString().slice(0, 10);
    rows.push({
      at: e.createdAt,
      forDate: dated !== istDateOf(e.createdAt) ? dated : null,
      what: `${isOut ? "Expense" : "Money received"} — ${e.category}${e.description ? `: ${e.description}` : ""}`,
      who: e.addedBy ? `Entered by ${e.addedBy}` : "",
      mode: cash ? "Cash" : "UPI",
      amountIn: isOut ? 0 : e.amount,
      amountOut: isOut ? e.amount : 0,
    });
  }

  rows.sort((a, b) => a.at.getTime() - b.at.getTime());
  for (const s of [moneyIn, moneyOut]) {
    s.cash = round2(s.cash); s.upi = round2(s.upi); s.deposit = round2(s.deposit);
    s.total = round2(s.cash + s.upi + s.deposit);
  }

  const ownerTook = collections.map(c => ({ at: c.createdAt, amount: c.amount, note: c.note }));
  const took = ownerTook.reduce((s, c) => s + c.amount, 0);
  const walked = round2(opening + cashIn - cashOut + depositsIn - depositsOut - took);

  return {
    hotelId,
    hotelName: hotel.name,
    date,
    start,
    end,
    closed,
    generatedAt: now,
    checkins: checkinRows,
    checkinTotal: round2(checkinRows.reduce((s, c) => s + c.rent, 0)),
    notArrived: due.map(b => ({ bookingRef: b.bookingRef, guest: b.primaryGuest.name })),
    rows,
    moneyIn,
    moneyOut,
    drawer: {
      opening,
      cashIn: round2(cashIn),
      cashOut: round2(cashOut),
      depositsIn: round2(depositsIn),
      depositsOut: round2(depositsOut),
      ownerTook,
      closing,
      balances: Math.abs(walked - closing) < 0.01,
    },
  };
}

// ─── Words ───────────────────────────────────────────────────────────────────

const money = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const rs = (n: number) => `Rs. ${money(n)}`;

const timeIST = (d: Date) =>
  d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true })
    .replace(/\s?([ap])\.?m\.?/i, (_, x: string) => ` ${x.toLowerCase()}m`);
const shortDate = (d: Date) =>
  d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
const longDate = (date: string) =>
  new Date(`${date}T12:00:00+05:30`).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
const dayOnly = (date: string) =>
  new Date(`${date}T12:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });

/** "Tue, 30 Sep 2026" — for message subjects. */
export function sheetTitleDate(date: string): string {
  return new Date(`${date}T12:00:00+05:30`).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

/**
 * The PDF's built-in font covers Western European text only. Anything else —
 * a ₹ in a staff note, an arrow, an emoji — would print as junk, so it is
 * spelled out or dropped.
 */
export function pdfSafe(s: string): string {
  return s
    .replace(/₹\s?/g, "Rs. ")
    .replace(/[→⇒➜]/g, "->")
    .replace(/[←]/g, "<-")
    .replace(/[−]/g, "-")
    .replace(/[×]/g, "x")
    .replace(/[^\x20-\x7E\xA0-\xFF–—‘’“”•…]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** The short summary that goes in the WhatsApp caption and the email body. */
export function sheetHeadlines(s: DailyAccounts) {
  return {
    checkins: `${s.checkins.length} (${rs(s.checkinTotal)})`,
    moneyIn: `${rs(s.moneyIn.total)} (Cash ${money(s.moneyIn.cash)}, UPI ${money(s.moneyIn.upi)}` +
      (s.moneyIn.deposit ? `, from deposit ${money(s.moneyIn.deposit)}` : "") + ")",
    moneyOut: rs(s.moneyOut.total),
    drawer: rs(s.drawer.closing),
  };
}

export function sheetFilename(s: DailyAccounts): string {
  return `Daily_Accounts_${s.date}.pdf`;
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

export function renderDailyAccountsPdf(s: DailyAccounts): ArrayBuffer {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const left = 14;
  const width = 182;
  const pageH = doc.internal.pageSize.getHeight();
  const grey: [number, number, number] = [110, 110, 110];
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  const heading = (text: string, y: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.setTextColor(20);
    doc.text(text, left, y);
    doc.setDrawColor(200);
    doc.line(left, y + 1.6, left + width, y + 1.6);
    return y + 6;
  };
  const note = (text: string, y: number, color: [number, number, number] = grey) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(pdfSafe(text), width);
    doc.text(lines, left, y);
    doc.setTextColor(20);
    return y + lines.length * 4;
  };
  // Headers follow their column: a number column is right-aligned all the way up.
  const alignHead = (right: number[]) => ({
    showFoot: "lastPage" as const,
    rowPageBreak: "avoid" as const,
    didParseCell: (d: { section: string; column: { index: number }; cell: { styles: { halign?: string } } }) => {
      if (d.section !== "body" && right.includes(d.column.index)) d.cell.styles.halign = "right";
    },
  });
  const room = (y: number, need: number) => {
    if (y + need > pageH - 16) { doc.addPage(); return 18; }
    return y;
  };

  // ── Title ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(20);
  doc.text("Daily Accounts", left, 17);
  doc.setFontSize(11);
  doc.text(longDate(s.date), left + width, 17, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...grey);
  doc.text(pdfSafe(s.hotelName), left, 22.5);
  const covers = s.closed
    ? `From ${timeIST(s.start)}, ${shortDate(s.start)} to ${timeIST(s.end)}, ${shortDate(s.end)}`
    : `From ${timeIST(s.start)}, ${shortDate(s.start)} to now (${timeIST(s.end)}) - day not closed yet`;
  doc.text(covers, left + width, 22.5, { align: "right" });
  doc.setTextColor(20);

  let y = 32;

  // ── 1. Check-ins ──
  y = heading(`1. Check-ins (${s.checkins.length})`, y);
  if (s.checkins.length === 0) {
    y = note("No guest checked in.", y + 1) + 2;
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left, right: 14 },
      head: [["Booking ID", "Room", "Guest name", "Final rent (Rs.)"]],
      body: s.checkins.map(c => [c.bookingRef, pdfSafe(c.room), pdfSafe(c.guest), money(c.rent)]),
      foot: [["Total", "", `${s.checkins.length} check-in${s.checkins.length === 1 ? "" : "s"}`, money(s.checkinTotal)]],
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 1.8, textColor: 20, lineColor: [205, 205, 205] },
      headStyles: { fillColor: [236, 236, 236], textColor: 20, fontStyle: "bold" },
      footStyles: { fillColor: [236, 236, 236], textColor: 20, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 46 },
        1: { cellWidth: 26 },
        2: { cellWidth: 76 },
        3: { cellWidth: 34, halign: "right" },
      },
      ...alignHead([3]),
    });
    y = lastY() + 5;
  }
  if (s.notArrived.length > 0) {
    y = note(
      `Due today but not checked in yet: ${s.notArrived.map(b => `${b.bookingRef} (${b.guest})`).join(", ")}`,
      y, [160, 90, 0],
    ) + 2;
  }

  // ── 2. Money ──
  y = room(y + 4, 40);
  y = heading("2. Money today", y);
  const dash = (n: number) => (n ? money(n) : "-");
  autoTable(doc, {
    startY: y,
    margin: { left, right: 14 },
    head: [["", "Cash", "UPI", "From deposit", "Total"]],
    body: [
      ["Money received", dash(s.moneyIn.cash), dash(s.moneyIn.upi), dash(s.moneyIn.deposit), money(s.moneyIn.total)],
      ["Money paid out", dash(s.moneyOut.cash), dash(s.moneyOut.upi), dash(s.moneyOut.deposit), money(s.moneyOut.total)],
    ],
    foot: [["Net", "", "", "", money(round2(s.moneyIn.total - s.moneyOut.total))]],
    theme: "grid",
    styles: { fontSize: 9.5, cellPadding: 2, textColor: 20, lineColor: [205, 205, 205] },
    headStyles: { fillColor: [236, 236, 236], textColor: 20, fontStyle: "bold" },
    footStyles: { fillColor: [236, 236, 236], textColor: 20, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 50, fontStyle: "bold" },
      1: { cellWidth: 33, halign: "right" }, 2: { cellWidth: 33, halign: "right" },
      3: { cellWidth: 33, halign: "right" }, 4: { cellWidth: 33, halign: "right" },
    },
    ...alignHead([1, 2, 3, 4]),
  });
  y = lastY() + 3;
  y = note("\"From deposit\" is money kept from a guest's refundable deposit - no cash or UPI changed hands for it.", y + 1) + 3;

  y = room(y, 24);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text("Every entry", left, y);
  y += 2;
  if (s.rows.length === 0) {
    y = note("No money was received or paid out.", y + 3) + 2;
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left, right: 14 },
      head: [["Time", "Details", "Guest / booking", "Mode", "In", "Out"]],
      body: s.rows.map(r => [
        timeIST(r.at),
        pdfSafe(r.what + (r.forDate ? ` (for ${dayOnly(r.forDate)})` : "")),
        pdfSafe(r.who),
        r.mode,
        r.amountIn ? money(r.amountIn) : "",
        r.amountOut ? money(r.amountOut) : "",
      ]),
      foot: [["", "Total", "", "", dash(s.moneyIn.total), dash(s.moneyOut.total)]],
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 1.5, textColor: 20, lineColor: [205, 205, 205], valign: "top" },
      headStyles: { fillColor: [236, 236, 236], textColor: 20, fontStyle: "bold" },
      footStyles: { fillColor: [236, 236, 236], textColor: 20, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 18 },
        1: { cellWidth: 68 },
        2: { cellWidth: 46 },
        3: { cellWidth: 16 },
        4: { cellWidth: 17, halign: "right" },
        5: { cellWidth: 17, halign: "right" },
      },
      ...alignHead([4, 5]),
    });
    y = lastY() + 5;
  }

  // ── 3. Cash drawer ──
  const lines: [string, string][] = [
    [`Cash in drawer at ${timeIST(s.start)}, ${shortDate(s.start)}`, rs(s.drawer.opening)],
    ["+ Cash received", rs(s.drawer.cashIn)],
    ["- Cash paid out", rs(s.drawer.cashOut)],
  ];
  if (s.drawer.depositsIn) lines.push(["+ Guest deposits taken in cash", rs(s.drawer.depositsIn)]);
  if (s.drawer.depositsOut) lines.push(["- Guest deposits returned in cash", rs(s.drawer.depositsOut)]);
  for (const c of s.drawer.ownerTook) {
    lines.push([`- Taken by owner at ${timeIST(c.at)}${c.note ? ` (${pdfSafe(c.note)})` : ""}`, rs(c.amount)]);
  }
  y = room(y + 2, 14 + lines.length * 7);
  y = heading("3. Cash drawer", y);
  autoTable(doc, {
    startY: y,
    margin: { left, right: 14 },
    body: lines,
    foot: [[`Cash in drawer ${s.closed ? `at ${timeIST(s.end)}, ${shortDate(s.end)}` : `now (${timeIST(s.end)})`}`, rs(s.drawer.closing)]],
    theme: "grid",
    styles: { fontSize: 9.5, cellPadding: 2, textColor: 20, lineColor: [205, 205, 205] },
    footStyles: { fillColor: [236, 236, 236], textColor: 20, fontStyle: "bold", fontSize: 10.5 },
    columnStyles: { 0: { cellWidth: 138 }, 1: { cellWidth: 44, halign: "right" } },
    ...alignHead([1]),
  });
  y = lastY() + 3;
  y = note(
    "This is the cash that should be in the drawer, including any guest deposits still to be returned. Count the drawer against it.",
    y + 1,
  );
  if (!s.drawer.balances) {
    note("Figures changed while this sheet was being made. Download it again for an exact copy.", y + 1, [180, 30, 30]);
  }

  // ── Page footers ──
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...grey);
    doc.text(`Made at ${timeIST(s.generatedAt)}, ${shortDate(s.generatedAt)}`, left, pageH - 8);
    doc.text(`Page ${p} of ${pages}`, left + width, pageH - 8, { align: "right" });
  }

  return doc.output("arraybuffer");
}

// ─── The link WhatsApp fetches the PDF from ─────────────────────────────────

/**
 * WhatsApp does not accept an attachment, only a link it downloads the file
 * from, so the sheet has to be reachable without a login. The link is signed —
 * it names one hotel and one day and stops working after three days — so
 * knowing the address pattern is no way into anyone's accounts.
 */
const LINK_TTL_SEC = 3 * 24 * 3600;

function linkSecret(): string {
  const s = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

function linkSignature(hotelId: string, date: string, exp: number): string {
  return crypto
    .createHmac("sha256", linkSecret())
    .update(`daily-accounts|${hotelId}|${date}|${exp}`)
    .digest("hex");
}

export function signedSheetUrl(hotelId: string, date: string, now = new Date()): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  if (!base) throw new Error("NEXT_PUBLIC_APP_URL is not set");
  const exp = Math.floor(now.getTime() / 1000) + LINK_TTL_SEC;
  const q = new URLSearchParams({ h: hotelId, d: date, e: String(exp), s: linkSignature(hotelId, date, exp) });
  return `${base}/api/daily-accounts/pdf?${q}`;
}

export function verifySheetLink(
  p: { h: string | null; d: string | null; e: string | null; s: string | null },
  now = new Date(),
): { hotelId: string; date: string } | null {
  if (!p.h || !isSheetDate(p.d) || !p.e || !p.s || !/^\d+$/.test(p.e)) return null;
  const exp = Number(p.e);
  if (exp * 1000 < now.getTime()) return null;
  const want = Buffer.from(linkSignature(p.h, p.d, exp));
  const got = Buffer.from(p.s);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  return { hotelId: p.h, date: p.d };
}
