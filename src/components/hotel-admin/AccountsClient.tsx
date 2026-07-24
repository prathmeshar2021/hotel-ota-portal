"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { format, subDays, startOfMonth, differenceInDays } from "date-fns";
import { fmtIST } from "@/lib/utils/datetime";

const MAX_RANGE_DAYS = 180; // 6 months

function rangeExceedsLimit(from: string, to: string) {
  if (!from || !to) return false;
  return differenceInDays(new Date(to), new Date(from)) > MAX_RANGE_DAYS;
}
import {
  Banknote, CreditCard, TrendingUp, Clock, Download, Wallet,
  ArrowDownCircle, ArrowUpCircle, RefreshCw, X, Loader2,
  IndianRupee, FileText, Receipt, AlertCircle, CheckCircle2,
} from "lucide-react";
import type { TransactionItem } from "@/app/api/hotel-admin/accounts/transactions/route";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Summary {
  cashInHand: number;
  onlineTotal: number;
  totalRevenue: number;
  totalExpenses: number;
  pendingDue: number;
  pendingCount: number;
  todayCash: number;
  todayOnline: number;
  totalCollectedByOwner: number;
  lastCollection: { amount: number; note: string | null; createdAt: string } | null;
}

type DateRange = "today" | "week" | "month" | "lastmonth" | "custom";
type ModeFilter = "all" | "cash" | "online";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function txTypeLabel(type: TransactionItem["type"]): string {
  switch (type) {
    case "BOOKING_CASH":         return "Booking";
    case "BOOKING_ONLINE":       return "Booking";
    case "BOOKING_PAY_AT_HOTEL": return "Booking";
    case "CHARGE_CASH":          return "Extra Charge";
    case "CHARGE_ONLINE":        return "Extra Charge";
    case "CHARGE_MIXED":         return "Extra Charge";
    case "CANCELLATION_FEE":     return "Cancellation";
    case "DAMAGE_CHARGE":        return "Damage";
    case "CASH_COLLECTION":      return "Withdrawn";
    case "EXPENSE_DEBIT":        return "Expense";
    case "EXPENSE_CREDIT":       return "Ledger Credit";
    default: return "Transaction";
  }
}

function txBadge(type: TransactionItem["type"], mode: TransactionItem["mode"]) {
  if (type === "CASH_COLLECTION")
    return { text: "Withdrawn", cls: "bg-red-500/15 text-red-400 border-red-500/25" };
  if (type === "CANCELLATION_FEE")
    return { text: "Cancellation", cls: "bg-orange-500/15 text-orange-400 border-orange-500/25" };
  if (type === "DAMAGE_CHARGE")
    return { text: "Damage", cls: "bg-red-500/10 text-red-400/80 border-red-500/15" };
  if (type === "BOOKING_PAY_AT_HOTEL")
    return { text: "Due", cls: "bg-orange-500/15 text-orange-400 border-orange-500/25" };
  if (type === "EXPENSE_DEBIT")
    return { text: "Expense", cls: "bg-red-500/12 text-red-400 border-red-500/20" };
  if (type === "EXPENSE_CREDIT")
    return { text: "Credit", cls: "bg-purple-500/15 text-purple-400 border-purple-500/25" };
  if (mode === "CASH")
    return { text: "Cash", cls: "bg-green-500/15 text-green-400 border-green-500/25" };
  if (mode === "ONLINE")
    return { text: "Online", cls: "bg-blue-500/15 text-blue-400 border-blue-500/25" };
  return { text: "Mixed", cls: "bg-purple-500/15 text-purple-400 border-purple-500/25" };
}

function downloadCSV(transactions: TransactionItem[], summary: Summary | null) {
  const rows = [
    ["Date", "Type", "Description", "Guest", "Booking Ref", "Mode", "Amount (₹)", "Direction"],
    ...transactions.map(t => [
      fmtIST(new Date(t.date), "dd/MM/yyyy HH:mm"),
      txTypeLabel(t.type),
      t.description,
      t.guestName ?? "",
      t.bookingRef ?? "",
      t.mode,
      t.amount.toFixed(2),
      t.isDebit ? "Debit" : "Credit",
    ]),
  ];

  if (summary) {
    rows.push([]);
    rows.push(["SUMMARY", "", "", "", "", "", "", ""]);
    rows.push(["Cash in Hand", fmt(summary.cashInHand)]);
    rows.push(["Online Received", fmt(summary.onlineTotal)]);
    rows.push(["Total Revenue", fmt(summary.totalRevenue)]);
    rows.push(["Balance Due", fmt(summary.pendingDue)]);
  }

  const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `accounts-statement-${format(new Date(), "yyyy-MM-dd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadPDF(
  transactions: TransactionItem[],
  txTotals: { credits: number; debits: number; net: number },
  summary: Summary | null,
  range: string,
  mode: string,
  fromDate: string,
  toDate: string,
) {
  if (transactions.length === 0) {
    toast.error("No transactions to export");
    return;
  }

  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const M = 14; // margin

  const rangeLabel =
    range === "today" ? "Today"
    : range === "week" ? "Last 7 Days"
    : range === "month" ? "This Month"
    : range === "lastmonth" ? "Last Month"
    : `${fromDate} to ${toDate}`;
  const modeLabel =
    mode === "cash" ? "Cash only"
    : mode === "online" ? "Online only"
    : "All payment types";

  // ── Header bar ───────────────────────────────────────────────────────────────
  doc.setFillColor(14, 60, 34);
  doc.rect(0, 0, PW, 30, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Accounts Statement", M, 12);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(`Period: ${rangeLabel}  ·  Filter: ${modeLabel}`, M, 20);
  doc.text(
    `Generated: ${fmtIST(new Date(), "dd MMM yyyy, hh:mm a")}`,
    PW - M, 20,
    { align: "right" }
  );

  let y = 38;

  // ── Summary grid ─────────────────────────────────────────────────────────────
  if (summary) {
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("SUMMARY", M, y);
    y += 3;

    autoTable(doc, {
      startY: y,
      body: [
        ["Cash in Hand", fmt(summary.cashInHand), "Online Received", fmt(summary.onlineTotal)],
        ["Total Revenue", fmt(summary.totalRevenue), "Balance Due", fmt(summary.pendingDue)],
      ],
      theme: "plain",
      styles: { fontSize: 9, cellPadding: { top: 3, bottom: 3, left: 3, right: 3 } },
      columnStyles: {
        0: { fontStyle: "bold", textColor: [100, 100, 100], cellWidth: 44 },
        1: { fontStyle: "bold", textColor: [20, 20, 20], cellWidth: 44 },
        2: { fontStyle: "bold", textColor: [100, 100, 100], cellWidth: 44 },
        3: { fontStyle: "bold", textColor: [20, 20, 20], cellWidth: 44 },
      },
      tableLineColor: [230, 230, 230],
      tableLineWidth: 0.2,
    });

    y = (doc as { lastAutoTable?: { finalY: number } }).lastAutoTable!.finalY + 10;
  }

  // ── Transactions table ────────────────────────────────────────────────────────
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("TRANSACTION STATEMENT", M, y);
  y += 3;

  autoTable(doc, {
    startY: y,
    head: [["Date", "Description", "Guest", "Booking Ref", "Mode", "Amount"]],
    body: transactions.map(t => [
      format(new Date(t.date), "dd MMM yy"),
      t.description + (t.subDescription ? `\n${t.subDescription}` : ""),
      t.guestName ?? "—",
      t.bookingRef ?? "—",
      t.type === "CASH_COLLECTION" ? "Cash" : t.mode === "INTERNAL" ? "—" : t.mode,
      t.type === "BOOKING_PAY_AT_HOTEL"
        ? `Due: ${fmt(t.amount)}`
        : `${t.isDebit ? "−" : "+"}${fmt(t.amount)}`,
    ]),
    foot: [
      ["", "", "", "", "Credits", fmt(txTotals.credits)],
      ["", "", "", "", "Debits", `−${fmt(txTotals.debits)}`],
      ["", "", "", "", "Net", (txTotals.net >= 0 ? "+" : "") + fmt(txTotals.net)],
    ],
    theme: "striped",
    headStyles: { fillColor: [14, 60, 34], textColor: [255, 255, 255], fontSize: 8, fontStyle: "bold" },
    footStyles: { fillColor: [240, 253, 244], textColor: [14, 80, 40], fontSize: 9, fontStyle: "bold" },
    bodyStyles: { fontSize: 8, textColor: [30, 30, 30] },
    alternateRowStyles: { fillColor: [248, 252, 249] },
    styles: { cellPadding: 3, overflow: "linebreak" },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 62 },
      2: { cellWidth: 30 },
      3: { cellWidth: 26 },
      4: { cellWidth: 18 },
      5: { cellWidth: 26, halign: "right" },
    },
    didParseCell(data) {
      if (data.section === "body" && data.column.index === 5) {
        const tx = transactions[data.row.index];
        if (!tx) return;
        if (tx.isDebit) data.cell.styles.textColor = [200, 30, 30];
        else if (tx.type === "BOOKING_PAY_AT_HOTEL") data.cell.styles.textColor = [180, 90, 10];
        else data.cell.styles.textColor = [15, 110, 50];
      }
    },
  });

  // ── Page numbers ─────────────────────────────────────────────────────────────
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.text(
      `Page ${i} of ${pages}  ·  Accounts Statement  ·  ${rangeLabel}`,
      PW / 2, PH - 8,
      { align: "center" }
    );
  }

  const slug = rangeLabel.replace(/\s+→\s+/g, "-").replace(/\s+/g, "-").toLowerCase();
  doc.save(`statement-${slug}-${format(new Date(), "yyyyMMdd")}.pdf`);
  toast.success("PDF downloaded");
}

// ─── Summary Cards ────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, sub, icon, iconBg, iconColor, valueColor, highlight,
}: {
  label: string; value: string; sub?: string;
  icon: React.ReactNode; iconBg: string; iconColor: string;
  valueColor?: string; highlight?: boolean;
}) {
  return (
    <div className={`rounded-2xl p-5 border transition-all ${
      highlight
        ? "bg-green-500/8 border-green-500/20"
        : "bg-white/3 border-white/8"
    }`}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-white/40 text-xs uppercase tracking-wider font-semibold">{label}</p>
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}
          style={{ color: iconColor }}>
          {icon}
        </span>
      </div>
      <p className={`text-2xl font-bold ${valueColor ?? "text-white"}`}>{value}</p>
      {sub && <p className="text-white/30 text-xs mt-1">{sub}</p>}
    </div>
  );
}

// ─── Collect Cash Modal ───────────────────────────────────────────────────────

function CollectCashModal({
  cashInHand, onClose, onSuccess,
}: {
  cashInHand: number; onClose: () => void; onSuccess: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const parsed = Number(amount) || 0;
  const isOverdraw = parsed > cashInHand;

  // Non-blocking: submit an OTP approval request and close the modal.
  // Admin completes the collection later in Pending Approvals.
  async function handleSubmit() {
    if (parsed <= 0) { toast.error("Enter a valid amount"); return; }
    if (isOverdraw) { toast.error("Cannot collect more than cash in hand"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/hotel-admin/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "CASH_COLLECTION",
          description: note ? `Cash collection — ${note}` : `Cash collection of ₹${parsed.toLocaleString("en-IN")}`,
          amount: parsed,
          actionPayload: { amount: parsed, note: note || undefined },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to submit request");
      setDone(true);
      toast.success("Approval request sent — complete in Pending Approvals once the owner issues a code.", {
        duration: 5000,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => onClose()} />
      <div className="relative bg-[#0d1a0e] border border-white/10 rounded-3xl p-6 w-full max-w-sm shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="font-bold text-white">Collect Cash</h2>
              <p className="text-white/35 text-xs">Record owner cash withdrawal</p>
            </div>
          </div>
          <button onClick={() => onClose()} className="text-white/30 hover:text-white/60 p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {done ? (
          /* Success state */
          <div className="text-center py-4">
            <div className="w-14 h-14 rounded-full bg-amber-500/15 border border-amber-500/20 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-7 h-7 text-amber-400" />
            </div>
            <p className="text-white font-bold text-lg">Request Sent</p>
            <p className="text-white/40 text-sm mt-1">
              Approval request submitted. Go to <strong className="text-white/60">Pending Approvals</strong> to complete once the owner issues the OTP code.
            </p>
            <button onClick={onSuccess}
              className="mt-5 w-full py-3 rounded-xl bg-white/8 hover:bg-white/12 border border-white/10 text-white/70 font-semibold text-sm transition-all">
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Cash in hand display */}
            <div className="bg-green-500/8 border border-green-500/20 rounded-2xl px-5 py-4 mb-5 text-center">
              <p className="text-white/40 text-xs uppercase tracking-wider mb-1">Cash Currently in Hand</p>
              <p className="text-3xl font-bold text-green-400">{fmt(cashInHand)}</p>
            </div>

            {/* Amount input */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-white/45 uppercase tracking-wider mb-2">
                Amount to Collect
              </label>
              <div className="relative">
                <IndianRupee className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  type="number" min={1} max={cashInHand}
                  value={amount} onChange={e => setAmount(e.target.value)}
                  placeholder="0"
                  className={`w-full bg-white/5 border rounded-xl pl-10 pr-4 py-3 text-white text-lg font-bold placeholder:text-white/20 focus:outline-none transition-all ${
                    isOverdraw ? "border-red-500/50" : "border-white/10 focus:border-amber-400/40"
                  }`}
                />
              </div>
              {isOverdraw && (
                <p className="text-red-400 text-xs mt-1.5 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> Exceeds cash in hand
                </p>
              )}
              {cashInHand > 0 && Number(amount) !== cashInHand && (
                <button onClick={() => setAmount(String(Math.round(cashInHand)))}
                  className="text-xs text-amber-400/70 hover:text-amber-400 mt-1.5 transition-colors">
                  Collect all ({fmt(cashInHand)}) →
                </button>
              )}
            </div>

            {/* Note */}
            <div className="mb-5">
              <label className="block text-xs font-semibold text-white/45 uppercase tracking-wider mb-2">
                Note <span className="normal-case font-normal text-white/20">(optional)</span>
              </label>
              <input
                type="text" value={note} onChange={e => setNote(e.target.value)}
                placeholder="e.g. Daily handover, bank deposit..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/20 text-sm focus:outline-none focus:border-amber-400/40 transition-all"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button onClick={() => onClose()}
                className="flex-1 py-3 rounded-xl border border-white/10 text-white/50 hover:text-white hover:border-white/20 text-sm font-semibold transition-all">
                Cancel
              </button>
              <button onClick={handleSubmit} disabled={loading || parsed <= 0 || isOverdraw}
                className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-sm font-bold transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2">
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : "Request Approval"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AccountsClient() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [txTotals, setTxTotals] = useState({ credits: 0, debits: 0, net: 0 });
  const [txLoading, setTxLoading] = useState(true);

  const [range, setRange] = useState<DateRange>("month");
  const [mode, setMode] = useState<ModeFilter>("all");
  const [fromDate, setFromDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const [collectOpen, setCollectOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  // ── Fetch summary ──
  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const res = await fetch("/api/hotel-admin/accounts/summary");
      if (res.ok) {
        setSummary(await res.json());
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error ?? `Summary failed (${res.status})`);
      }
    } catch (e) {
      toast.error("Could not load account summary");
      console.error("[Accounts] summary error:", e);
    } finally { setSummaryLoading(false); }
  }, []);

  // ── Fetch transactions ──
  const fetchTransactions = useCallback(async (r: DateRange, m: ModeFilter, from: string, to: string) => {
    setTxLoading(true);
    try {
      const params = new URLSearchParams({ range: r, mode: m });
      if (r === "custom") { params.set("from", from); params.set("to", to); }
      const res = await fetch(`/api/hotel-admin/accounts/transactions?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions ?? []);
        setTxTotals(data.totals ?? { credits: 0, debits: 0, net: 0 });
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error ?? `Transactions failed (${res.status})`);
        console.error("[Accounts] transactions API error:", err);
      }
    } catch (e) {
      toast.error("Could not load transactions");
      console.error("[Accounts] transactions fetch error:", e);
    } finally { setTxLoading(false); }
  }, []);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchTransactions(range, mode, fromDate, toDate); }, [range, mode, fetchTransactions, fromDate, toDate]);

  function handleRangeChange(r: DateRange) {
    setRange(r);
    if (r !== "custom") fetchTransactions(r, mode, fromDate, toDate);
  }

  // Label for current range in the statement header
  const rangeLabelDisplay =
    range === "today" ? "Today"
    : range === "week" ? "Last 7 Days"
    : range === "month" ? "This Month"
    : range === "lastmonth" ? "Last Month"
    : `${fromDate} → ${toDate}`;

  function handleModeChange(m: ModeFilter) {
    setMode(m);
    fetchTransactions(range, m, fromDate, toDate);
  }

  function handleRefresh() {
    fetchSummary();
    fetchTransactions(range, mode, fromDate, toDate);
  }

  // ─── Skeleton loader ──
  if (summaryLoading && !summary) {
    return (
      <div className="space-y-5 animate-pulse">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-white/3 rounded-2xl border border-white/8" />
          ))}
        </div>
        <div className="h-96 bg-white/3 rounded-2xl border border-white/8" />
      </div>
    );
  }

  const s = summary;

  return (
    <div className="space-y-5">

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        <SummaryCard
          label="Cash in Hand"
          value={s ? fmt(s.cashInHand) : "—"}
          sub={s?.lastCollection
            ? `Last: ${fmt(s.lastCollection.amount)} · ${format(new Date(s.lastCollection.createdAt), "dd MMM")}`
            : "No collections yet"}
          icon={<Banknote className="w-5 h-5" />}
          iconBg="bg-green-500/15"
          iconColor="#4ade80"
          valueColor="text-green-400"
          highlight
        />
        <SummaryCard
          label="Online Received"
          value={s ? fmt(s.onlineTotal) : "—"}
          sub={s ? `Today: ${fmt(s.todayOnline)}` : undefined}
          icon={<CreditCard className="w-5 h-5" />}
          iconBg="bg-blue-500/15"
          iconColor="#60a5fa"
          valueColor="text-blue-400"
        />
        <SummaryCard
          label="Revenue"
          value={s ? fmt(s.totalRevenue) : "—"}
          sub={s ? `This month · Today: ${fmt(s.todayCash + s.todayOnline)}` : undefined}
          icon={<TrendingUp className="w-5 h-5" />}
          iconBg="bg-amber-500/15"
          iconColor="#f59e0b"
          valueColor="text-amber-400"
        />
        <SummaryCard
          label="Expenses"
          value={s ? fmt(s.totalExpenses ?? 0) : "—"}
          sub="This month's ledger debits"
          icon={<ArrowUpCircle className="w-5 h-5" />}
          iconBg="bg-red-500/15"
          iconColor="#f87171"
          valueColor={s && (s.totalExpenses ?? 0) > 0 ? "text-red-400" : "text-white"}
        />
        <SummaryCard
          label="Balance Due"
          value={s ? fmt(s.pendingDue) : "—"}
          sub={s ? `${s.pendingCount} active booking${s.pendingCount !== 1 ? "s" : ""}` : undefined}
          icon={<Clock className="w-5 h-5" />}
          iconBg="bg-orange-500/15"
          iconColor="#fb923c"
          valueColor={s && s.pendingDue > 0 ? "text-orange-400" : "text-white"}
        />
      </div>

      {/* ── Today's snapshot ── */}
      {s && (s.todayCash > 0 || s.todayOnline > 0) && (
        <div className="bg-white/2 border border-white/6 rounded-2xl px-5 py-3 flex flex-wrap gap-6 items-center">
          <p className="text-white/30 text-xs uppercase tracking-wider font-semibold">Today</p>
          <div className="flex items-center gap-2">
            <Banknote className="w-4 h-4 text-green-400/60" />
            <span className="text-green-400 font-bold">{fmt(s.todayCash)}</span>
            <span className="text-white/25 text-xs">cash</span>
          </div>
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-blue-400/60" />
            <span className="text-blue-400 font-bold">{fmt(s.todayOnline)}</span>
            <span className="text-white/25 text-xs">online</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-white/25 text-xs">Total collected by owner:</span>
            <span className="text-white/50 font-semibold text-sm">{fmt(s.totalCollectedByOwner)}</span>
          </div>
        </div>
      )}

      {/* ── Controls row ── */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        {/* Left: filters */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* Date range quick filters */}
          <div className="flex bg-white/3 border border-white/8 rounded-xl p-1 gap-1 flex-wrap">
            {([
              { key: "today",     label: "Today" },
              { key: "week",      label: "7 Days" },
              { key: "month",     label: "This Month" },
              { key: "lastmonth", label: "Last Month" },
            ] as { key: DateRange; label: string }[]).map(({ key, label }) => (
              <button key={key} onClick={() => handleRangeChange(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  range === key
                    ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                    : "text-white/35 hover:text-white/60 hover:bg-white/5"
                }`}>
                {label}
              </button>
            ))}
            <button onClick={() => setRange("custom")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                range === "custom"
                  ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                  : "text-white/35 hover:text-white/60 hover:bg-white/5"
              }`}
              title="Custom range — max 6 months">
              Custom
            </button>
          </div>

          {/* Custom date pickers */}
          {range === "custom" && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className={`bg-white/5 border rounded-xl px-3 py-2 text-white/70 text-xs focus:outline-none transition-all ${
                  rangeExceedsLimit(fromDate, toDate) ? "border-red-500/40" : "border-white/10 focus:border-blue-400/40"
                }`}
              />
              <span className="text-white/25 text-xs">→</span>
              <input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                className={`bg-white/5 border rounded-xl px-3 py-2 text-white/70 text-xs focus:outline-none transition-all ${
                  rangeExceedsLimit(fromDate, toDate) ? "border-red-500/40" : "border-white/10 focus:border-blue-400/40"
                }`}
              />
              <button
                onClick={() => {
                  if (rangeExceedsLimit(fromDate, toDate)) {
                    toast.error("Maximum range is 6 months (180 days)");
                    return;
                  }
                  fetchTransactions("custom", mode, fromDate, toDate);
                }}
                disabled={rangeExceedsLimit(fromDate, toDate)}
                className="px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-300 text-xs font-semibold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                Apply
              </button>
              {rangeExceedsLimit(fromDate, toDate) && (
                <span className="text-red-400 text-xs flex items-center gap-1">
                  ⚠ Max 6 months
                </span>
              )}
            </div>
          )}

          {/* Mode filter */}
          <div className="flex bg-white/3 border border-white/8 rounded-xl p-1 gap-1">
            {(["all", "cash", "online"] as ModeFilter[]).map(m => (
              <button key={m} onClick={() => handleModeChange(m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize ${
                  mode === m
                    ? "bg-white/10 text-white border border-white/15"
                    : "text-white/35 hover:text-white/60 hover:bg-white/5"
                }`}>
                {m === "all" ? "All Types" : m === "cash" ? "💵 Cash" : "💳 Online"}
              </button>
            ))}
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/40 hover:text-white/70 text-xs font-semibold rounded-xl transition-all">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button onClick={() => downloadCSV(transactions, summary)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/40 hover:text-white/70 text-xs font-semibold rounded-xl transition-all">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button
            onClick={async () => {
              setPdfLoading(true);
              try {
                await downloadPDF(transactions, txTotals, summary, range, mode, fromDate, toDate);
              } finally { setPdfLoading(false); }
            }}
            disabled={pdfLoading}
            className="flex items-center gap-1.5 px-3 py-2 bg-red-500/10 hover:bg-red-500/18 border border-red-500/20 text-red-400 hover:text-red-300 text-xs font-semibold rounded-xl transition-all disabled:opacity-50">
            {pdfLoading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <FileText className="w-3.5 h-3.5" />}
            {pdfLoading ? "Generating…" : "PDF"}
          </button>
          <button onClick={() => setCollectOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold rounded-xl transition-all shadow-lg shadow-amber-500/20">
            <Wallet className="w-4 h-4" /> Collect Cash
          </button>
        </div>
      </div>

      {/* ── Transaction Statement ── */}
      <div className="bg-white/2 border border-white/8 rounded-2xl overflow-hidden">
        {/* Statement header */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 border-b border-white/8">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-white/30" />
            <p className="font-semibold text-white text-sm">Transaction Statement</p>
            <span className="text-white/25 text-xs">·</span>
            <span className="text-white/30 text-xs capitalize">
              {rangeLabelDisplay}
            </span>
          </div>
          <div className="flex items-center gap-5 text-sm">
            <div className="flex items-center gap-1.5">
              <ArrowDownCircle className="w-4 h-4 text-green-400" />
              <span className="text-green-400 font-bold">{fmt(txTotals.credits)}</span>
              <span className="text-white/25 text-xs">in</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ArrowUpCircle className="w-4 h-4 text-red-400" />
              <span className="text-red-400 font-bold">{fmt(txTotals.debits)}</span>
              <span className="text-white/25 text-xs">out</span>
            </div>
            <div className="flex items-center gap-1.5 border-l border-white/8 pl-5">
              <span className="text-white/40 text-xs">Net</span>
              <span className={`font-bold ${txTotals.net >= 0 ? "text-green-400" : "text-red-400"}`}>
                {txTotals.net >= 0 ? "+" : ""}{fmt(txTotals.net)}
              </span>
            </div>
          </div>
        </div>

        {/* Table */}
        {txLoading ? (
          <div className="py-16 flex items-center justify-center gap-3 text-white/30">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading transactions…</span>
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-16 text-center">
            <Receipt className="w-8 h-8 text-white/15 mx-auto mb-3" />
            <p className="text-white/30 text-sm font-medium">No transactions found</p>
            <p className="text-white/20 text-xs mt-1">Try adjusting the date range or filter</p>
          </div>
        ) : (
          <>
            {/* Desktop table header */}
            <div className="hidden sm:grid grid-cols-[1fr_2fr_auto_auto] gap-4 px-5 py-2.5 border-b border-white/5 bg-white/2">
              <p className="text-white/25 text-[10px] uppercase tracking-wider font-semibold">Date</p>
              <p className="text-white/25 text-[10px] uppercase tracking-wider font-semibold">Details</p>
              <p className="text-white/25 text-[10px] uppercase tracking-wider font-semibold">Mode</p>
              <p className="text-white/25 text-[10px] uppercase tracking-wider font-semibold text-right">Amount</p>
            </div>

            {/* Rows */}
            <div className="divide-y divide-white/5">
              {transactions.map((tx) => {
                const badge = txBadge(tx.type, tx.mode);
                return (
                  <div key={tx.id}
                    className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto_auto] gap-2 sm:gap-4 px-5 py-3.5 hover:bg-white/2 transition-colors">

                    {/* Date */}
                    <div>
                      <p className="text-white/60 text-sm font-medium">
                        {format(new Date(tx.date), "dd MMM")}
                      </p>
                      <p className="text-white/25 text-[10px]">
                        {fmtIST(new Date(tx.date), "hh:mm a")}
                      </p>
                    </div>

                    {/* Description */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-white/80 text-sm font-semibold truncate">{tx.description}</p>
                        {tx.isDebit && (
                          <span className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded-full font-semibold shrink-0">
                            DEBIT
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {tx.guestName && (
                          <span className="text-white/30 text-xs">{tx.guestName}</span>
                        )}
                        {tx.bookingRef && (
                          <span className="text-white/20 text-[10px] font-mono">{tx.bookingRef}</span>
                        )}
                        {tx.subDescription && !tx.bookingRef && (
                          <span className="text-white/25 text-xs">{tx.subDescription}</span>
                        )}
                      </div>
                    </div>

                    {/* Mode badge */}
                    <div className="flex items-center">
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${badge.cls}`}>
                        {badge.text}
                      </span>
                    </div>

                    {/* Amount */}
                    <div className="text-right">
                      <p className={`font-bold text-base ${
                        tx.isDebit ? "text-red-400"
                        : tx.type === "BOOKING_PAY_AT_HOTEL" ? "text-orange-400"
                        : "text-green-400"
                      }`}>
                        {tx.isDebit ? "−" : tx.type === "BOOKING_PAY_AT_HOTEL" ? "⏳" : "+"}{fmt(tx.amount)}
                      </p>
                      {tx.type === "BOOKING_PAY_AT_HOTEL" && (
                        <p className="text-orange-400/50 text-[10px]">pending</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer total */}
            <div className="border-t border-white/8 px-5 py-3 flex justify-between items-center bg-white/2">
              <p className="text-white/30 text-xs">{transactions.length} transaction{transactions.length !== 1 ? "s" : ""}</p>
              <div className="flex items-center gap-2">
                <span className="text-white/30 text-xs">Period net:</span>
                <span className={`font-bold text-sm ${txTotals.net >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {txTotals.net >= 0 ? "+" : ""}{fmt(txTotals.net)}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Collect Cash Modal ── */}
      {collectOpen && s && (
        <CollectCashModal
          cashInHand={s.cashInHand}
          onClose={() => setCollectOpen(false)}
          onSuccess={() => {
            setCollectOpen(false);
            fetchSummary();
            fetchTransactions(range, mode, fromDate, toDate);
          }}
        />
      )}
    </div>
  );
}
