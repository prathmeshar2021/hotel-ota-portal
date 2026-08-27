"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { format } from "date-fns";
import {
  Search, X, Banknote, Receipt, Trash2, CalendarX, ShieldAlert,
  ExternalLink, Inbox, AlertTriangle, MailWarning, Pencil, Undo2, Loader2,
} from "lucide-react";

export interface ActivityRow {
  id: string;
  kind: string;
  summary: string;
  amount: number | null;
  refType: string | null;
  refId: string | null;
  bookingRef: string | null;
  guestName: string | null;
  reason: string | null;
  actorName: string;
  actorRole: string;
  notifiedWhatsapp: boolean;
  notifiedEmail: boolean;
  createdAt: string;
  undoneAt: string | null;
  undoneByName: string | null;
}

/** What can genuinely be put back. Anything that moved money through the
 *  payment gateway is not on this list, because it cannot be. */
const UNDOABLE = [
  "DELETE_BOOKING", "PRICE_CHANGE", "DEPOSIT_CHANGE",
  "CASH_COLLECTION", "EXPENSE_DEBIT", "DELETE_TRANSACTION",
];

const KIND_META: Record<string, { label: string; icon: typeof Banknote; cls: string }> = {
  PRICE_CHANGE:       { label: "Price changed",     icon: Pencil,     cls: "bg-amber-500/12 text-amber-300 border-amber-500/25" },
  DEPOSIT_CHANGE:     { label: "Deposit changed",   icon: Pencil,     cls: "bg-amber-500/12 text-amber-300 border-amber-500/25" },
  CASH_COLLECTION:    { label: "Cash taken",        icon: Banknote,   cls: "bg-red-500/12 text-red-300 border-red-500/25" },
  EXPENSE_DEBIT:      { label: "Expense",           icon: Receipt,    cls: "bg-orange-500/12 text-orange-300 border-orange-500/25" },
  DELETE_TRANSACTION: { label: "Entry deleted",     icon: Trash2,     cls: "bg-red-500/12 text-red-300 border-red-500/25" },
  CANCEL_BOOKING:     { label: "Booking cancelled", icon: CalendarX,  cls: "bg-amber-500/12 text-amber-300 border-amber-500/25" },
  DELETE_BOOKING:     { label: "Booking deleted",   icon: Trash2,     cls: "bg-red-500/12 text-red-300 border-red-500/25" },
  DEPOSIT_DEDUCTION:  { label: "Deposit deduction", icon: ShieldAlert,cls: "bg-purple-500/12 text-purple-300 border-purple-500/25" },
  REFUND:             { label: "Refund",            icon: Banknote,   cls: "bg-blue-500/12 text-blue-300 border-blue-500/25" },
  OTHER:              { label: "Other",             icon: ShieldAlert,cls: "bg-white/8 text-white/60 border-white/15" },
};

/** Edits to money already agreed — the group the owner most often wants alone. */
export const FINANCIAL_EDITS = ["PRICE_CHANGE", "DEPOSIT_CHANGE"];

const FILTERS = [
  { key: "ALL", label: "All" },
  { key: "FINANCIAL_EDITS", label: "Price & deposit edits" },
  { key: "CASH_COLLECTION", label: "Cash taken" },
  { key: "EXPENSE_DEBIT", label: "Expenses" },
  { key: "DELETE_TRANSACTION", label: "Entries deleted" },
  { key: "CANCEL_BOOKING", label: "Cancellations" },
  { key: "DELETE_BOOKING", label: "Bookings deleted" },
];

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function ActivityLogClient({ rows }: { rows: ActivityRow[] }) {
  const router = useRouter();
  const [undoing, setUndoing] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("ALL");
  const [staff, setStaff] = useState("ALL");

  const staffNames = useMemo(
    () => [...new Set(rows.map(r => r.actorName))].sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    // Search is deliberately forgiving about case and spacing — the owner is
    // usually typing half a name or a booking ref from memory.
    const needle = q.trim().toLowerCase().replace(/\s+/g, " ");
    return rows.filter(r => {
      if (kind === "FINANCIAL_EDITS") {
        if (!FINANCIAL_EDITS.includes(r.kind)) return false;
      } else if (kind !== "ALL" && r.kind !== kind) return false;
      if (staff !== "ALL" && r.actorName !== staff) return false;
      if (!needle) return true;
      const hay = [
        r.summary, r.actorName, r.bookingRef, r.guestName, r.reason,
        KIND_META[r.kind]?.label, r.amount != null ? String(r.amount) : "",
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, q, kind, staff]);

  const unnotified = filtered.filter(r => !r.notifiedWhatsapp && !r.notifiedEmail);

  async function undo(r: ActivityRow) {
    if (!confirm(`Undo this?\n\n${r.summary}\n\nIt will be put back as it was, and the owner is told.`)) return;
    setUndoing(r.id);
    try {
      const res = await fetch(`/api/hotel-admin/activity/${r.id}/undo`, { method: "POST" });
      const d = await res.json();
      if (res.ok) { toast.success(d.message ?? "Undone"); router.refresh(); }
      else toast.error(d.error ?? "Could not undo");
    } finally { setUndoing(null); }
  }

  return (
    <>
      {/* Search + filters */}
      <div className="bg-white/3 border border-white/8 rounded-2xl p-4 mb-5">
        <div className="relative mb-3">
          <Search className="w-4 h-4 text-white/25 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search by staff, booking, guest, reason or amount…"
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-9 py-2.5 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/40 transition-all"
          />
          {q && (
            <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setKind(f.key)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
                kind === f.key
                  ? "bg-amber-500 text-black border-amber-400"
                  : "bg-white/5 border-white/10 text-white/55 hover:text-white/85 hover:border-white/20"
              }`}>
              {f.label}
            </button>
          ))}
        </div>

        {staffNames.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setStaff("ALL")}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
                staff === "ALL" ? "bg-white/15 text-white border-white/25" : "bg-white/5 border-white/10 text-white/45 hover:text-white/75"
              }`}>
              Everyone
            </button>
            {staffNames.map(n => (
              <button key={n} onClick={() => setStaff(n)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
                  staff === n ? "bg-white/15 text-white border-white/25" : "bg-white/5 border-white/10 text-white/45 hover:text-white/75"
                }`}>
                {n}
              </button>
            ))}
          </div>
        )}
      </div>

      {unnotified.length > 0 && (
        <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/25 rounded-2xl px-4 py-3 mb-5">
          <MailWarning className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-amber-200/85 text-xs leading-relaxed">
            {unnotified.length} of these reached neither your WhatsApp nor your email. The action
            still happened — only the alert failed — so these are the ones worth reading here.
          </p>
        </div>
      )}

      <p className="text-white/35 text-xs mb-3">
        {filtered.length} action{filtered.length !== 1 ? "s" : ""}
        {filtered.length !== rows.length ? ` of ${rows.length}` : ""}
      </p>

      {filtered.length === 0 ? (
        <div className="bg-white/3 border border-white/8 rounded-2xl p-10 text-center">
          <Inbox className="w-8 h-8 text-white/15 mx-auto mb-3" />
          <p className="text-white/40 text-sm">
            {rows.length === 0 ? "No actions recorded yet." : "Nothing matches that search."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => {
            const meta = KIND_META[r.kind] ?? KIND_META.OTHER;
            const Icon = meta.icon;
            return (
              <div key={r.id} className="bg-white/3 border border-white/8 rounded-2xl p-4 hover:bg-white/5 transition-all">
                <div className="flex items-start gap-3">
                  <span className={`shrink-0 w-9 h-9 rounded-xl border flex items-center justify-center ${meta.cls}`}>
                    <Icon className="w-4 h-4" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold border mb-1.5 ${meta.cls}`}>
                          {meta.label}
                        </span>
                        <p className="text-white/85 text-sm font-medium leading-snug">{r.summary}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {r.amount != null && (
                          <span className="text-white font-bold text-sm">{inr(r.amount)}</span>
                        )}
                        {r.undoneAt ? (
                          <span className="text-[10px] px-2 py-1 rounded-lg border border-white/10 text-white/30">
                            undone
                          </span>
                        ) : UNDOABLE.includes(r.kind) ? (
                          <button
                            onClick={() => undo(r)}
                            disabled={undoing === r.id}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-white/10 text-white/45 hover:text-white/85 hover:border-white/25 transition-all disabled:opacity-40"
                          >
                            {undoing === r.id
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <Undo2 className="w-3 h-3" />}
                            Undo
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-2 text-[11px] text-white/35">
                      <span>
                        By <span className="text-white/60 font-semibold">{r.actorName}</span>
                      </span>
                      <span>{format(new Date(r.createdAt), "dd MMM yyyy, h:mm a")}</span>
                      {r.bookingRef && (
                        r.refType === "booking" && r.refId ? (
                          <Link href={`/hotel-admin/bookings/${r.refId}`}
                            className="text-blue-300 hover:text-blue-200 inline-flex items-center gap-1 font-mono">
                            {r.bookingRef} <ExternalLink className="w-3 h-3" />
                          </Link>
                        ) : (
                          <span className="font-mono text-white/50">{r.bookingRef}</span>
                        )
                      )}
                      {r.guestName && <span className="text-white/45">{r.guestName}</span>}
                      {r.undoneAt && r.undoneByName && (
                        <span className="text-white/30">undone by {r.undoneByName}</span>
                      )}
                      {!r.notifiedWhatsapp && !r.notifiedEmail && (
                        <span className="inline-flex items-center gap-1 text-amber-400/80">
                          <AlertTriangle className="w-3 h-3" /> alert failed
                        </span>
                      )}
                    </div>

                    {r.reason && (
                      <p className="text-white/40 text-xs mt-2 leading-relaxed">
                        <span className="text-white/25">Reason:</span> {r.reason}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
