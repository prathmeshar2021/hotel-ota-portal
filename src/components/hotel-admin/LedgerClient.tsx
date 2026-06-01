"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { format, startOfMonth, subMonths, endOfMonth } from "date-fns";
import {
  TrendingDown, TrendingUp, Loader2, Trash2, RefreshCw,
  IndianRupee, CalendarDays, Tag, AlignLeft, Banknote, CreditCard,
  Plus, ChevronDown,
} from "lucide-react";
import type { LedgerEntry } from "@/app/api/hotel-admin/ledger/route";
import OtpGate from "@/components/hotel-admin/OtpGate";

// ─── Constants ────────────────────────────────────────────────────────────────

const DEBIT_CATEGORIES = [
  "Electricity Bill",
  "Water Supply",
  "Plumber",
  "Electrician",
  "Internet / Cable TV",
  "Housekeeping Supplies",
  "Laundry",
  "Staff Salary",
  "Food & Beverages",
  "Maintenance & Repairs",
  "Fuel / Transport",
  "Printing & Stationery",
  "Other Expense",
];

const CREDIT_CATEGORIES = [
  "Owner Investment",
  "Advance Received",
  "Refund Received",
  "Miscellaneous Income",
  "Other Credit",
];

type DateRange = "month" | "lastmonth" | "custom";

const inputCls = "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-purple-400/40 focus:bg-white/8 transition-all";
const labelCls = "block text-xs font-semibold text-white/45 uppercase tracking-wider mb-1.5";
const selectCls = "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-purple-400/40 transition-all appearance-none cursor-pointer";

function fmt(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LedgerClient() {
  // ── Form state ──
  const [entryType, setEntryType] = useState<"DEBIT" | "CREDIT">("DEBIT");
  const [category, setCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"CASH" | "ONLINE">("CASH");
  const [expenseDate, setExpenseDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [submitting, setSubmitting] = useState(false);

  // ── List state ──
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<DateRange>("month");
  const [fromDate, setFromDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── OTP gate state ──
  type DebitPayload = { category: string; description?: string; amount: number; mode: "CASH" | "ONLINE"; expenseDate: string };
  const [debitOtp, setDebitOtp] = useState<DebitPayload | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LedgerEntry | null>(null);

  const categories = entryType === "DEBIT" ? DEBIT_CATEGORIES : CREDIT_CATEGORIES;

  // Reset category when type changes
  useEffect(() => { setCategory(""); }, [entryType]);

  // ── Fetch entries ──
  const fetchEntries = useCallback(async (r: DateRange, from: string, to: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ range: r });
      if (r === "custom") { params.set("from", from); params.set("to", to); }
      const res = await fetch(`/api/hotel-admin/ledger?${params}`);
      if (res.ok) setEntries(await res.json());
      else {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error ?? "Failed to load ledger");
      }
    } catch { toast.error("Could not load ledger"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchEntries(range, fromDate, toDate); }, [range, fetchEntries, fromDate, toDate]);

  function resetForm() {
    setAmount("");
    setDescription("");
    setCategory("");
    setCustomCategory("");
    setExpenseDate(format(new Date(), "yyyy-MM-dd"));
  }

  // Shared POST — `otp` only present for owner-approved debits
  async function postEntry(
    payload: DebitPayload & { entryType: "DEBIT" | "CREDIT" },
    otp?: { otpId: string; otpCode: string },
  ) {
    const res = await fetch("/api/hotel-admin/ledger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, ...otp }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed to save entry");
    toast.success(data.message);
    resetForm();
    fetchEntries(range, fromDate, toDate);
  }

  // ── Submit ──
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const finalCategory = category === "__custom__" ? customCategory.trim() : category;
    if (!finalCategory) { toast.error("Select or enter a category"); return; }
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }

    const payload: DebitPayload = {
      category: finalCategory,
      description: description.trim() || undefined,
      amount: amt,
      mode,
      expenseDate,
    };

    // Debits (money going out) require owner OTP approval; credits do not.
    if (entryType === "DEBIT") {
      setDebitOtp(payload);
      return;
    }

    setSubmitting(true);
    try {
      await postEntry({ ...payload, entryType: "CREDIT" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save entry");
    } finally { setSubmitting(false); }
  }

  // ── Delete ── (requires owner OTP approval)
  async function performDelete(entry: LedgerEntry, otpId: string, otpCode: string) {
    setDeletingId(entry.id);
    try {
      const params = new URLSearchParams({ id: entry.id, otpId, otpCode });
      const res = await fetch(`/api/hotel-admin/ledger?${params}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(typeof err?.error === "string" ? err.error : "Delete failed");
      }
      toast.success("Entry deleted");
      setEntries(prev => prev.filter(e => e.id !== entry.id));
      setDeleteTarget(null);
    } finally { setDeletingId(null); }
  }

  // ── Totals ──
  const totalDebits = entries.filter(e => e.entryType === "DEBIT").reduce((s, e) => s + e.amount, 0);
  const totalCredits = entries.filter(e => e.entryType === "CREDIT").reduce((s, e) => s + e.amount, 0);

  const rangeLabel =
    range === "month" ? "This Month"
    : range === "lastmonth" ? "Last Month"
    : `${fromDate} → ${toDate}`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-5 items-start">

      {/* ── Left: Add Entry Form ── */}
      <div className="bg-white/3 border border-white/8 rounded-2xl p-5 sticky top-6">
        <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4 text-purple-400" /> Add Entry
        </h2>

        {/* Debit / Credit toggle */}
        <div className="flex gap-2 mb-5">
          <button
            type="button"
            onClick={() => setEntryType("DEBIT")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold border transition-all ${
              entryType === "DEBIT"
                ? "bg-red-500/20 text-red-300 border-red-500/30"
                : "bg-white/3 text-white/35 border-white/8 hover:bg-white/6"
            }`}>
            <TrendingDown className="w-4 h-4" /> Debit (Expense)
          </button>
          <button
            type="button"
            onClick={() => setEntryType("CREDIT")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold border transition-all ${
              entryType === "CREDIT"
                ? "bg-green-500/20 text-green-300 border-green-500/30"
                : "bg-white/3 text-white/35 border-white/8 hover:bg-white/6"
            }`}>
            <TrendingUp className="w-4 h-4" /> Credit (Income)
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Category */}
          <div>
            <label className={labelCls}>
              <Tag className="inline w-3 h-3 mr-1" />
              Category *
            </label>
            <div className="relative">
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className={selectCls}
                required>
                <option value="" disabled className="bg-[#0D1B0E]">Select category…</option>
                {categories.map(c => (
                  <option key={c} value={c} className="bg-[#0D1B0E]">{c}</option>
                ))}
                <option value="__custom__" className="bg-[#0D1B0E]">✏ Enter custom…</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none" />
            </div>
            {category === "__custom__" && (
              <input
                value={customCategory}
                onChange={e => setCustomCategory(e.target.value)}
                placeholder="e.g. Garden maintenance"
                className={`${inputCls} mt-2`}
              />
            )}
          </div>

          {/* Amount */}
          <div>
            <label className={labelCls}>
              <IndianRupee className="inline w-3 h-3 mr-1" />
              Amount *
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 text-sm font-bold">₹</span>
              <input
                type="number"
                min={1}
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className={`${inputCls} pl-8`}
                required
              />
            </div>
          </div>

          {/* Payment mode */}
          <div>
            <label className={labelCls}>Payment Mode</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode("CASH")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                  mode === "CASH"
                    ? "bg-green-500/15 text-green-300 border-green-500/25"
                    : "bg-white/3 text-white/35 border-white/8 hover:bg-white/6"
                }`}>
                <Banknote className="w-3.5 h-3.5" /> Cash
              </button>
              <button
                type="button"
                onClick={() => setMode("ONLINE")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                  mode === "ONLINE"
                    ? "bg-blue-500/15 text-blue-300 border-blue-500/25"
                    : "bg-white/3 text-white/35 border-white/8 hover:bg-white/6"
                }`}>
                <CreditCard className="w-3.5 h-3.5" /> Online
              </button>
            </div>
          </div>

          {/* Date */}
          <div>
            <label className={labelCls}>
              <CalendarDays className="inline w-3 h-3 mr-1" />
              Date
            </label>
            <input
              type="date"
              value={expenseDate}
              onChange={e => setExpenseDate(e.target.value)}
              max={format(new Date(), "yyyy-MM-dd")}
              className={inputCls}
            />
          </div>

          {/* Description */}
          <div>
            <label className={labelCls}>
              <AlignLeft className="inline w-3 h-3 mr-1" />
              Note <span className="normal-case font-normal text-white/20">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Additional details…"
              rows={2}
              className={`${inputCls} resize-none`}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className={`w-full py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              entryType === "DEBIT"
                ? "bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white shadow-lg shadow-red-500/20"
                : "bg-green-500 hover:bg-green-400 disabled:opacity-50 text-white shadow-lg shadow-green-500/20"
            }`}>
            {submitting
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              : entryType === "DEBIT"
                ? <><TrendingDown className="w-4 h-4" /> Record Expense</>
                : <><TrendingUp className="w-4 h-4" /> Record Credit</>}
          </button>
        </form>
      </div>

      {/* ── Right: Entries List ── */}
      <div className="space-y-4">
        {/* Controls */}
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="flex bg-white/3 border border-white/8 rounded-xl p-1 gap-1">
            {(["month", "lastmonth", "custom"] as DateRange[]).map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  range === r
                    ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                    : "text-white/35 hover:text-white/60 hover:bg-white/5"
                }`}>
                {r === "month" ? "This Month" : r === "lastmonth" ? "Last Month" : "Custom"}
              </button>
            ))}
          </div>

          {range === "custom" && (
            <div className="flex items-center gap-2 flex-wrap">
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white/70 text-xs focus:outline-none focus:border-purple-400/40 transition-all" />
              <span className="text-white/25 text-xs">→</span>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white/70 text-xs focus:outline-none focus:border-purple-400/40 transition-all" />
              <button
                onClick={() => fetchEntries("custom", fromDate, toDate)}
                className="px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 text-purple-300 text-xs font-semibold rounded-xl transition-all">
                Apply
              </button>
            </div>
          )}

          <button
            onClick={() => fetchEntries(range, fromDate, toDate)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/40 hover:text-white/70 text-xs font-semibold rounded-xl transition-all">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>

        {/* Period totals */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-red-500/8 border border-red-500/15 rounded-2xl px-4 py-3 text-center">
            <p className="text-white/35 text-[10px] uppercase tracking-wider mb-0.5">Expenses</p>
            <p className="text-red-400 font-bold text-lg">{fmt(totalDebits)}</p>
            <p className="text-white/25 text-[10px]">{rangeLabel}</p>
          </div>
          <div className="bg-green-500/8 border border-green-500/15 rounded-2xl px-4 py-3 text-center">
            <p className="text-white/35 text-[10px] uppercase tracking-wider mb-0.5">Credits</p>
            <p className="text-green-400 font-bold text-lg">{fmt(totalCredits)}</p>
            <p className="text-white/25 text-[10px]">{rangeLabel}</p>
          </div>
          <div className={`border rounded-2xl px-4 py-3 text-center ${
            totalCredits - totalDebits >= 0
              ? "bg-white/3 border-white/8"
              : "bg-red-500/5 border-red-500/10"
          }`}>
            <p className="text-white/35 text-[10px] uppercase tracking-wider mb-0.5">Net</p>
            <p className={`font-bold text-lg ${totalCredits - totalDebits >= 0 ? "text-white/70" : "text-red-400"}`}>
              {totalCredits - totalDebits >= 0 ? "+" : ""}{fmt(totalCredits - totalDebits)}
            </p>
            <p className="text-white/25 text-[10px]">{rangeLabel}</p>
          </div>
        </div>

        {/* Entries */}
        <div className="bg-white/2 border border-white/8 rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-white/8 flex items-center justify-between">
            <p className="text-white/60 text-sm font-semibold">
              {entries.length} entr{entries.length !== 1 ? "ies" : "y"}
            </p>
            <p className="text-white/25 text-xs">{rangeLabel}</p>
          </div>

          {loading ? (
            <div className="py-14 flex items-center justify-center gap-3 text-white/30">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : entries.length === 0 ? (
            <div className="py-14 text-center">
              <p className="text-white/25 text-sm">No entries for this period</p>
              <p className="text-white/15 text-xs mt-1">Add your first expense or credit using the form</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {entries.map(entry => (
                <div key={entry.id}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/2 transition-colors group">
                  {/* Icon */}
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    entry.entryType === "DEBIT"
                      ? "bg-red-500/15 border border-red-500/20"
                      : "bg-green-500/15 border border-green-500/20"
                  }`}>
                    {entry.entryType === "DEBIT"
                      ? <TrendingDown className="w-4 h-4 text-red-400" />
                      : <TrendingUp className="w-4 h-4 text-green-400" />}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-white/80 text-sm font-semibold">{entry.category}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        entry.mode === "CASH"
                          ? "bg-green-500/10 text-green-400 border-green-500/20"
                          : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                      }`}>
                        {entry.mode}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="text-white/30 text-xs">
                        {format(new Date(entry.expenseDate), "dd MMM yyyy")}
                      </span>
                      {entry.description && (
                        <span className="text-white/25 text-xs truncate max-w-[200px]">{entry.description}</span>
                      )}
                      {entry.addedBy && (
                        <span className="text-white/20 text-[10px]">by {entry.addedBy}</span>
                      )}
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="text-right shrink-0">
                    <p className={`font-bold text-base ${
                      entry.entryType === "DEBIT" ? "text-red-400" : "text-green-400"
                    }`}>
                      {entry.entryType === "DEBIT" ? "−" : "+"}{fmt(entry.amount)}
                    </p>
                  </div>

                  {/* Delete */}
                  <button
                    onClick={() => setDeleteTarget(entry)}
                    disabled={!!deletingId}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/8 transition-all shrink-0 disabled:opacity-30">
                    {deletingId === entry.id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Owner OTP gate — debit creation ── */}
      <OtpGate
        open={!!debitOtp}
        onClose={() => { setDebitOtp(null); setSubmitting(false); }}
        purpose="EXPENSE_DEBIT"
        description={debitOtp ? `Expense — ${debitOtp.category}` : "Expense debit"}
        amount={debitOtp?.amount}
        onConfirm={async (otpId, otpCode) => {
          if (!debitOtp) return;
          await postEntry({ ...debitOtp, entryType: "DEBIT" }, { otpId, otpCode });
          setDebitOtp(null);
        }}
        title="Owner Approval — Expense Debit"
      />

      {/* ── Owner OTP gate — delete entry ── */}
      <OtpGate
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        purpose="DELETE_TRANSACTION"
        description={deleteTarget ? `Delete ${deleteTarget.entryType.toLowerCase()} — ${deleteTarget.category}` : "Delete ledger entry"}
        amount={deleteTarget?.amount}
        refId={deleteTarget?.id}
        onConfirm={async (otpId, otpCode) => {
          if (!deleteTarget) return;
          await performDelete(deleteTarget, otpId, otpCode);
        }}
        title="Owner Approval — Delete Entry"
      />
    </div>
  );
}
