"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Wallet, Plus, Loader2, X, AlertTriangle, ArrowDownLeft, ArrowUpRight,
  RefreshCw, Repeat, ShieldCheck,
} from "lucide-react";
import PayModePicker, { splitFor, type PayMode } from "@/components/hotel-admin/PayModePicker";

/**
 * A booking's account, as the front desk needs it.
 *
 * Money at a desk does not follow the happy path: a guest says UPI and pays
 * cash, a refund runs past the deposit, a rate is agreed after the fact. So any
 * amount can be put in or taken out here, in either direction. What keeps it
 * safe is not stopping people but showing everything — the two reference figures
 * stay pinned at the top, every entry is listed in the order it happened, and
 * anything unusual is flagged where it happened and sent to the owner.
 */

interface Entry {
  id: string;
  kind: string;
  direction: "CREDIT" | "DEBIT";
  mode: "CASH" | "ONLINE" | "DEPOSIT";
  amount: number;
  note: string | null;
  occurredAt: string;
  recordedBy: string | null;
  flagged: boolean;
  flagReason: string | null;
  affectsStatement: boolean;
}

interface Account {
  billed: number; roomTotal: number; extrasOnTab: number;
  paid: number; paidCash: number; paidOnline: number; refunded: number;
  balance: number; depositHeld: number; depositTaken: number;
  depositReturned: number; depositUsed: number; depositWithheld: number;
}

const KIND_LABEL: Record<string, string> = {
  ROOM_PAYMENT: "Room payment",
  EXTRA_CHARGE: "Extra paid at counter",
  DEPOSIT_TAKEN: "Deposit taken",
  DEPOSIT_RETURNED: "Deposit returned",
  DEPOSIT_APPLIED: "Deducted from deposit",
  DEPOSIT_WITHHELD: "Withheld from deposit",
  CANCELLATION_FEE: "Cancellation fee",
  REFUND: "Refund",
  ADJUSTMENT: "Adjustment",
};

/** What the desk actually does, in its own words. */
const ACTIONS = [
  { key: "TAKE",     label: "Take payment",    kind: "ROOM_PAYMENT",     direction: "CREDIT" as const, help: "Guest pays the bill" },
  { key: "DEPOSIT",  label: "Take deposit",    kind: "DEPOSIT_TAKEN",    direction: "CREDIT" as const, help: "Refundable — not counted as income" },
  { key: "RETURN",   label: "Return deposit",  kind: "DEPOSIT_RETURNED", direction: "DEBIT"  as const, help: "Give the deposit back" },
  { key: "REFUND",   label: "Refund",          kind: "REFUND",           direction: "DEBIT"  as const, help: "Give bill money back" },
  { key: "CREDIT",   label: "Other credit",    kind: "ADJUSTMENT",       direction: "CREDIT" as const, help: "Any other money in" },
  { key: "DEBIT",    label: "Other debit",     kind: "ADJUSTMENT",       direction: "DEBIT"  as const, help: "Any other money out" },
];

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function BookingAccountPanel({
  bookingId,
  depositExpected,
}: {
  bookingId: string;
  depositExpected: number;
}) {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState(ACTIONS[0]);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<PayMode>("CASH");
  const [cashPart, setCashPart] = useState(0);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [correcting, setCorrecting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/hotel-admin/bookings/${bookingId}/account`);
      const d = await res.json();
      if (res.ok) { setAccount(d.account); setEntries(d.entries); }
    } finally { setLoading(false); }
  }, [bookingId]);

  useEffect(() => { load(); }, [load]);

  async function post() {
    const amt = Number(amount) || 0;
    if (amt <= 0) { toast.error("Enter an amount"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/hotel-admin/bookings/${bookingId}/account`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: action.kind, direction: action.direction,
          mode: action.kind === "DEPOSIT_APPLIED" ? "DEPOSIT" : mode,
          amount: amt,
          cashAmount: mode === "MIXED" ? splitFor("MIXED", amt, cashPart).cashAmount : undefined,
          note: note.trim() || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error ?? "Failed"); return; }
      if (d.flagged) toast.warning(d.message, { duration: 8000 });
      else toast.success(d.message);
      setOpen(false); setAmount(""); setNote("");
      await load();
      router.refresh();
    } finally { setSaving(false); }
  }

  /** The guest said UPI and paid cash — the money moved once, we noted it wrong. */
  async function correctMode(e: Entry) {
    const to = e.mode === "CASH" ? "ONLINE" : "CASH";
    if (!confirm(`This ${inr(e.amount)} was recorded as ${e.mode === "CASH" ? "cash" : "UPI"}. Change it to ${to === "CASH" ? "cash" : "UPI"}?\n\nCash in hand will move by ${inr(e.amount)}. The owner is notified.`)) return;
    setCorrecting(e.id);
    try {
      const res = await fetch(`/api/hotel-admin/bookings/${bookingId}/account`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txnId: e.id, mode: to }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error ?? "Failed"); return; }
      toast.success(d.message);
      await load();
      router.refresh();
    } finally { setCorrecting(null); }
  }

  if (loading) {
    return (
      <div className="bg-white/3 border border-white/8 rounded-2xl p-5 flex items-center gap-2 text-white/40 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading account…
      </div>
    );
  }
  if (!account) return null;

  const owes = account.balance > 0.5;
  const inCredit = account.balance < -0.5;

  return (
    <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-white text-sm flex items-center gap-2">
          <Wallet className="w-4 h-4 text-white/30" /> Account
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={load} className="text-white/25 hover:text-white/60 p-1 rounded-lg transition-colors" title="Refresh">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => { setAction(ACTIONS[0]); setAmount(""); setNote(""); setMode("CASH"); setCashPart(0); setOpen(true); }}
            className="flex items-center gap-1.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/25 text-amber-300 text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
          >
            <Plus className="w-3.5 h-3.5" /> Entry
          </button>
        </div>
      </div>

      {/* The two reference figures, always in view */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3">
          <p className="text-white/35 text-[10px] uppercase tracking-wider mb-1">Total bill</p>
          <p className="text-white font-bold text-lg">{inr(account.billed)}</p>
          {account.extrasOnTab > 0 && (
            <p className="text-white/25 text-[11px] mt-0.5">
              room {inr(account.roomTotal)} + extras {inr(account.extrasOnTab)}
            </p>
          )}
        </div>
        <div className="bg-green-500/8 border border-green-500/20 rounded-xl px-4 py-3">
          <p className="text-green-400/60 text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" /> Deposit held
          </p>
          <p className="text-green-300 font-bold text-lg">{inr(account.depositHeld)}</p>
          <p className="text-white/25 text-[11px] mt-0.5">
            {depositExpected > 0 ? `${inr(depositExpected)} to collect` : "none"}
            {account.depositUsed > 0 ? ` · ${inr(account.depositUsed)} used` : ""}
            {account.depositWithheld > 0 ? ` · ${inr(account.depositWithheld)} withheld` : ""}
            {account.depositReturned > 0 ? ` · ${inr(account.depositReturned)} returned` : ""}
          </p>
        </div>
      </div>

      <div className="space-y-1.5 mb-4 text-sm">
        <div className="flex justify-between"><span className="text-white/45">Paid</span><span className="text-white/85 font-semibold">{inr(account.paid)}</span></div>
        {account.refunded > 0 && (
          <div className="flex justify-between"><span className="text-white/45">Refunded</span><span className="text-red-300 font-semibold">−{inr(account.refunded)}</span></div>
        )}
        <div className="flex justify-between border-t border-white/8 pt-2 mt-1 font-bold">
          <span className="text-white">{owes ? "Pending" : inCredit ? "To return" : "Fully paid"}</span>
          <span className={owes ? "text-amber-300" : inCredit ? "text-red-300" : "text-green-400"}>
            {inr(Math.abs(account.balance))}
          </span>
        </div>
      </div>

      {/* Every movement, in the order it happened */}
      <div className="space-y-1.5">
        {entries.length === 0 ? (
          <p className="text-white/25 text-xs py-3 text-center">Nothing here yet.</p>
        ) : entries.map(e => (
          <div key={e.id}
            className={`rounded-xl px-3 py-2.5 border ${e.flagged ? "bg-amber-500/8 border-amber-500/25" : "bg-white/[0.02] border-white/8"}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {e.direction === "CREDIT"
                    ? <ArrowDownLeft className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    : <ArrowUpRight className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                  <span className="text-white/80 text-xs font-semibold">{KIND_LABEL[e.kind] ?? e.kind}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded border border-white/10 text-white/40">
                    {e.mode === "DEPOSIT" ? "from deposit" : e.mode === "CASH" ? "cash" : "UPI"}
                  </span>
                  {!e.affectsStatement && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-white/10 text-white/25">not income</span>
                  )}
                </div>
                <p className="text-white/30 text-[11px] mt-1">
                  {format(new Date(e.occurredAt), "dd MMM yyyy, h:mm a")}
                  {e.recordedBy ? ` · ${e.recordedBy}` : ""}
                </p>
                {e.note && <p className="text-white/35 text-[11px] mt-0.5 leading-relaxed">{e.note}</p>}
                {e.flagged && e.flagReason && (
                  <p className="text-amber-300/80 text-[11px] mt-1 flex items-start gap-1 leading-relaxed">
                    <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" /> {e.flagReason}
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className={`font-bold text-sm ${e.direction === "CREDIT" ? "text-green-300" : "text-red-300"}`}>
                  {e.direction === "CREDIT" ? "+" : "−"}{inr(e.amount)}
                </p>
                {e.mode !== "DEPOSIT" && (
                  <button
                    onClick={() => correctMode(e)}
                    disabled={correcting === e.id}
                    title={`Recorded as ${e.mode === "CASH" ? "cash" : "UPI"} — switch`}
                    className="mt-1 inline-flex items-center gap-1 text-[10px] text-white/30 hover:text-white/70 transition-colors disabled:opacity-40"
                  >
                    {correcting === e.id
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Repeat className="w-3 h-3" />}
                    {e.mode === "CASH" ? "was UPI?" : "was cash?"}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add entry */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !saving && setOpen(false)} />
          <div className="relative bg-[#0d1a0e] border border-white/10 rounded-3xl p-6 w-full max-w-md shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-white">Add Entry</h2>
              <button onClick={() => !saving && setOpen(false)} className="text-white/30 hover:text-white/60 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
              {ACTIONS.map(a => (
                <button key={a.key} type="button" onClick={() => setAction(a)}
                  className={`px-3 py-2.5 rounded-xl text-xs font-semibold border transition-all text-left ${
                    action.key === a.key
                      ? a.direction === "CREDIT"
                        ? "bg-green-500/20 text-green-200 border-green-400/40"
                        : "bg-red-500/20 text-red-200 border-red-400/40"
                      : "bg-white/5 border-white/10 text-white/55 hover:text-white/85"
                  }`}>
                  {a.label}
                  <span className="block text-[10px] font-normal opacity-60 mt-0.5">{a.help}</span>
                </button>
              ))}
            </div>

            <label className="block text-[10px] text-white/35 uppercase tracking-wider font-semibold mb-1.5">Amount (₹)</label>
            <input type="number" min={0} value={amount} onChange={e => setAmount(e.target.value)} autoFocus
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-lg font-bold focus:outline-none focus:border-amber-400/50 mb-3" />

            <PayModePicker
              mode={mode}
              total={Number(amount) || 0}
              cashAmount={cashPart}
              label=""
              onChange={sp => { setMode(sp.mode); setCashPart(sp.cashAmount); }}
            />

            <input value={note} onChange={e => setNote(e.target.value)} maxLength={300}
              placeholder="Note (optional)"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/40 mb-4" />

            <p className="text-[11px] text-white/30 mb-4 leading-relaxed">
              Nothing is blocked here. If it is unusual — paying back more than the deposit, or
              taking more than the bill — it is saved, marked, and the owner is told.
            </p>

            <div className="flex gap-2.5">
              <button onClick={() => !saving && setOpen(false)} disabled={saving}
                className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-white/60 font-semibold text-sm hover:text-white/85">Cancel</button>
              <button onClick={post} disabled={saving || !(Number(amount) > 0)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {saving ? "Saving…" : "Record"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
