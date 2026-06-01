"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  ShieldCheck,
  Loader2,
  Check,
  X,
  Copy,
  Clock,
  IndianRupee,
  RefreshCw,
} from "lucide-react";

export interface OtpItem {
  id: string;
  purpose: string;
  description: string;
  amount: number | null;
  refId: string | null;
  status: string;
  code: string | null;
  requestedBy: string | null;
  issuedBy: string | null;
  expiresAt: string | null;
  createdAt: string;
}

const PURPOSE_LABEL: Record<string, string> = {
  CASH_COLLECTION: "Cash collection",
  EXPENSE_DEBIT: "Expense / debit",
  DELETE_BOOKING: "Delete booking",
  DELETE_TRANSACTION: "Delete transaction",
  DEPOSIT_DEDUCTION: "Deposit deduction",
  REFUND: "Refund",
  OTHER: "Other",
};

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function Countdown({ expiresAt }: { expiresAt: string }) {
  const [left, setLeft] = useState(() =>
    Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
  );
  useEffect(() => {
    const t = setInterval(() => {
      setLeft(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  const m = Math.floor(left / 60);
  const s = left % 60;
  return (
    <span className={left < 60 ? "text-red-400" : "text-amber-300"}>
      {m}:{String(s).padStart(2, "0")}
    </span>
  );
}

export default function ApprovalsClient({
  initialPending,
  initialRecent,
}: {
  initialPending: OtpItem[];
  initialRecent: OtpItem[];
}) {
  const [pending, setPending] = useState<OtpItem[]>(initialPending);
  const [recent, setRecent] = useState<OtpItem[]>(initialRecent);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/otp", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setPending(data.pending);
      setRecent(data.recent);
    } catch {
      /* silent */
    }
  }, []);

  // Poll every 8s for new requests
  useEffect(() => {
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, [refresh]);

  async function issue(item: OtpItem) {
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/admin/otp/${item.id}/issue`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(`OTP issued: ${data.code}`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  async function reject(item: OtpItem) {
    if (!confirm("Reject this request?")) return;
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/admin/otp/${item.id}/reject`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      toast.success("Request rejected");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code).then(
      () => toast.success("Code copied"),
      () => toast.error("Could not copy")
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-8 max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-6 gap-3">
        <div>
          <p className="text-amber-400/70 text-xs font-bold tracking-[0.2em] uppercase mb-1">
            Owner Console
          </p>
          <h1 className="text-2xl lg:text-3xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-red-400" /> Approvals
          </h1>
          <p className="text-white/40 text-sm mt-1">
            Issue a one-time code to authorize a debit, deletion, or refund.
            Codes expire in 10 minutes.
          </p>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-2 text-white/50 hover:text-white text-sm font-semibold px-3 py-2 rounded-xl hover:bg-white/5 transition-all"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Pending / issued queue */}
      <h2 className="text-white/60 text-sm font-semibold uppercase tracking-wider mb-3">
        Waiting ({pending.length})
      </h2>
      <div className="space-y-3 mb-10">
        {pending.length === 0 && (
          <p className="text-white/30 text-sm py-8 text-center">
            No pending approval requests.
          </p>
        )}
        {pending.map((item) => {
          const issued = item.status === "ISSUED";
          const expired = item.status === "EXPIRED";
          return (
            <div
              key={item.id}
              className={`rounded-2xl border p-4 lg:p-5 ${
                issued
                  ? "border-amber-500/30 bg-amber-500/[0.05]"
                  : "border-white/10 bg-white/[0.03]"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-bold text-sm">
                      {PURPOSE_LABEL[item.purpose] ?? item.purpose}
                    </span>
                    {item.amount != null && (
                      <span className="flex items-center gap-0.5 text-red-300 font-bold text-sm">
                        <IndianRupee className="w-3.5 h-3.5" />
                        {item.amount.toLocaleString("en-IN")}
                      </span>
                    )}
                  </div>
                  <p className="text-white/60 text-sm mt-1">{item.description}</p>
                  <p className="text-white/30 text-xs mt-1.5">
                    Requested by {item.requestedBy ?? "Staff"} · {timeAgo(item.createdAt)}
                  </p>
                </div>
              </div>

              {issued && item.code && (
                <div className="mt-4 flex items-center gap-3 bg-black/30 rounded-xl px-4 py-3 border border-amber-500/20">
                  <div>
                    <p className="text-white/40 text-[10px] uppercase tracking-wider mb-0.5">
                      OTP — read to staff
                    </p>
                    <span className="text-2xl font-black text-amber-300 tracking-[0.3em] font-mono">
                      {item.code}
                    </span>
                  </div>
                  <button
                    onClick={() => copyCode(item.code!)}
                    className="text-white/40 hover:text-white p-2 rounded-lg hover:bg-white/5 transition-all"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  {item.expiresAt && (
                    <span className="ml-auto flex items-center gap-1.5 text-sm font-bold">
                      <Clock className="w-4 h-4 text-white/40" />
                      <Countdown expiresAt={item.expiresAt} />
                    </span>
                  )}
                </div>
              )}

              <div className="flex gap-2 mt-4">
                {!issued && !expired && (
                  <button
                    onClick={() => issue(item)}
                    disabled={busyId === item.id}
                    className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-black font-bold text-sm px-4 py-2 rounded-xl transition-all"
                  >
                    {busyId === item.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    Issue OTP
                  </button>
                )}
                {expired && (
                  <button
                    onClick={() => issue(item)}
                    disabled={busyId === item.id}
                    className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-black font-bold text-sm px-4 py-2 rounded-xl transition-all"
                  >
                    <RefreshCw className="w-4 h-4" /> Re-issue
                  </button>
                )}
                <button
                  onClick={() => reject(item)}
                  disabled={busyId === item.id}
                  className="flex items-center gap-2 text-white/50 hover:text-red-400 hover:bg-red-500/8 font-semibold text-sm px-4 py-2 rounded-xl transition-all"
                >
                  <X className="w-4 h-4" /> Reject
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* History */}
      <h2 className="text-white/60 text-sm font-semibold uppercase tracking-wider mb-3">
        Recent
      </h2>
      <div className="space-y-2">
        {recent.length === 0 && (
          <p className="text-white/30 text-sm py-6 text-center">No history yet.</p>
        )}
        {recent.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-2.5"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-white/80 text-sm font-medium">
                  {PURPOSE_LABEL[item.purpose] ?? item.purpose}
                </span>
                {item.amount != null && (
                  <span className="text-white/50 text-xs">
                    ₹{item.amount.toLocaleString("en-IN")}
                  </span>
                )}
              </div>
              <p className="text-white/30 text-xs truncate">{item.description}</p>
            </div>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                item.status === "USED"
                  ? "text-emerald-300 bg-emerald-500/10 border border-emerald-500/20"
                  : item.status === "REJECTED"
                  ? "text-red-300 bg-red-500/10 border border-red-500/20"
                  : "text-white/40 bg-white/5 border border-white/10"
              }`}
            >
              {item.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
