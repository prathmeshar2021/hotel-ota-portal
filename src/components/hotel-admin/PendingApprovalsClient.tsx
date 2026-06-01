"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  ShieldCheck, Clock, CheckCircle2, Loader2, RefreshCw,
  IndianRupee, KeyRound, ExternalLink, X, Inbox,
} from "lucide-react";
import type { Prisma } from "@prisma/client";

export interface PendingOtpItem {
  id: string;
  purpose: string;
  description: string;
  amount: number | null;
  refId: string | null;
  actionPayload: Prisma.JsonValue;
  status: string;
  requestedBy: string | null;
  issuedAt: string | null;
  createdAt: string;
}

// ── Labels ────────────────────────────────────────────────────────────────────

const PURPOSE_LABEL: Record<string, string> = {
  CASH_COLLECTION: "Cash Collection",
  EXPENSE_DEBIT: "Expense / Debit",
  DELETE_BOOKING: "Cancel Booking",
  DELETE_TRANSACTION: "Delete Transaction",
  DEPOSIT_DEDUCTION: "Deposit Deduction",
  REFUND: "Refund",
  OTHER: "Other",
};

const PURPOSE_COLOR: Record<string, string> = {
  CASH_COLLECTION: "text-amber-400 bg-amber-500/10 border-amber-500/25",
  EXPENSE_DEBIT: "text-red-400 bg-red-500/10 border-red-500/25",
  DELETE_BOOKING: "text-red-400 bg-red-500/10 border-red-500/25",
  DELETE_TRANSACTION: "text-orange-400 bg-orange-500/10 border-orange-500/25",
  DEPOSIT_DEDUCTION: "text-orange-400 bg-orange-500/10 border-orange-500/25",
  REFUND: "text-blue-400 bg-blue-500/10 border-blue-500/25",
  OTHER: "text-white/50 bg-white/5 border-white/15",
};

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function getPayload(ap: Prisma.JsonValue): Record<string, unknown> {
  if (ap && typeof ap === "object" && !Array.isArray(ap)) return ap as Record<string, unknown>;
  return {};
}

/**
 * Safely extract a human-readable error string from any API response body.
 * Handles: plain string errors, Zod flatten objects ({ fieldErrors, formErrors }),
 * and generic fallback.
 */
function extractError(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const d = data as Record<string, unknown>;
  if (typeof d.error === "string") return d.error;
  if (d.error && typeof d.error === "object") {
    // Zod's error.flatten() → { formErrors: string[], fieldErrors: Record<string, string[]> }
    const flat = d.error as { formErrors?: string[]; fieldErrors?: Record<string, string[]> };
    const msgs = [
      ...(flat.formErrors ?? []),
      ...Object.values(flat.fieldErrors ?? {}).flat(),
    ];
    if (msgs.length > 0) return msgs[0];
  }
  return fallback;
}

// ── Execute action by purpose ─────────────────────────────────────────────────

async function executeAction(item: PendingOtpItem, code: string): Promise<string> {
  const payload = getPayload(item.actionPayload);
  const otpId = item.id;
  const otpCode = code.trim();

  switch (item.purpose) {
    case "DELETE_BOOKING": {
      const res = await fetch(`/api/hotel-admin/bookings/${item.refId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, otpId, otpCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(extractError(data, "Cancellation failed"));
      const ref = (payload.bookingRef as string) ?? item.refId ?? "";
      return `Booking${ref ? ` #${ref}` : ""} cancelled successfully`;
    }

    case "EXPENSE_DEBIT": {
      // Ensure required fields are present (payload may be empty for legacy requests)
      const debitAmount = typeof payload.amount === "number" ? payload.amount : item.amount;
      const debitCategory = typeof payload.category === "string" ? payload.category : null;
      const debitMode = typeof payload.mode === "string" ? payload.mode : null;
      if (!debitAmount || !debitCategory || !debitMode)
        throw new Error("Expense details are incomplete — please delete this request and re-submit the expense");
      const res = await fetch("/api/hotel-admin/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryType: "DEBIT",
          ...payload,
          amount: debitAmount,
          category: debitCategory,
          mode: debitMode,
          otpId,
          otpCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(extractError(data, "Expense record failed"));
      return data.message ?? "Expense recorded";
    }

    case "CASH_COLLECTION": {
      // Fall back to item.amount for legacy requests that pre-date actionPayload storage
      const collectAmount = typeof payload.amount === "number" ? payload.amount : item.amount;
      if (!collectAmount)
        throw new Error("Collection amount is missing — please delete this request and re-submit");
      const res = await fetch("/api/hotel-admin/accounts/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: collectAmount, note: payload.note ?? undefined, otpId, otpCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(extractError(data, "Collection failed"));
      return data.message ?? "Cash collection recorded";
    }

    case "DELETE_TRANSACTION": {
      const params = new URLSearchParams({ id: item.refId ?? "", otpId, otpCode });
      const res = await fetch(`/api/hotel-admin/ledger?${params}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(extractError(data, "Delete failed"));
      }
      return "Transaction deleted";
    }

    default:
      throw new Error(`Unknown action type: ${item.purpose}`);
  }
}

// ── OTP Entry inline card ─────────────────────────────────────────────────────

function OtpEntry({
  item,
  onDone,
}: {
  item: PendingOtpItem;
  onDone: (id: string, successMsg: string) => void;
}) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const isIssued = item.status === "ISSUED";

  async function submit() {
    if (code.trim().length < 6) { toast.error("Enter the 6-digit OTP"); return; }
    setLoading(true);
    try {
      const msg = await executeAction(item, code);
      onDone(item.id, msg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setLoading(false); }
  }

  return (
    <div className="mt-4 border-t border-white/8 pt-4">
      {!isIssued && (
        <p className="text-white/35 text-xs mb-3 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
          Waiting for owner approval. Once issued, enter the code here.
        </p>
      )}
      {isIssued && (
        <p className="text-green-400 text-xs mb-3 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Code ready — enter the OTP from the owner.
        </p>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
          placeholder="6-digit OTP"
          className="flex-1 bg-white/5 border border-white/10 focus:border-blue-400/50 rounded-xl px-4 py-2.5 text-white text-center text-lg tracking-[0.3em] font-mono placeholder:tracking-normal placeholder:text-sm placeholder:text-white/25 focus:outline-none transition-all"
        />
        <button
          onClick={submit}
          disabled={loading || code.trim().length < 6}
          className="flex items-center gap-2 bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-xl transition-all text-sm"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
          {loading ? "Executing…" : "Complete"}
        </button>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PendingApprovalsClient({
  initialItems,
}: {
  initialItems: PendingOtpItem[];
}) {
  const [items, setItems] = useState<PendingOtpItem[]>(initialItems);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  // Poll every 10 s to pick up ISSUED status changes without page reload
  const refresh = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await fetch("/api/hotel-admin/otp", { cache: "no-store" });
      if (res.ok) {
        const data: PendingOtpItem[] = await res.json();
        setItems(data);
      }
    } catch { /* silent */ }
    finally { if (!silent) setRefreshing(false); }
  }, []);

  useEffect(() => {
    const t = setInterval(() => refresh(true), 10_000);
    return () => clearInterval(t);
  }, [refresh]);

  function handleDone(id: string, msg: string) {
    toast.success(msg);
    setItems(prev => prev.filter(i => i.id !== id));
    setExpanded(null);
    router.refresh();
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-3">
        <div>
          <p className="text-blue-400/70 text-xs font-bold tracking-[0.2em] uppercase mb-1">
            Front Desk
          </p>
          <h1 className="text-2xl lg:text-3xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-blue-400" /> Pending Approvals
          </h1>
          <p className="text-white/40 text-sm mt-1">
            Transactions waiting for owner approval. Once the owner issues a code,
            enter it here to complete the action.
          </p>
        </div>
        <button
          onClick={() => refresh(false)}
          className="flex items-center gap-2 text-white/50 hover:text-white text-sm font-semibold px-3 py-2 rounded-xl hover:bg-white/5 transition-all shrink-0"
        >
          {refreshing
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <RefreshCw className="w-4 h-4" />}
          Refresh
        </button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/3 border border-white/8 flex items-center justify-center mb-4">
            <Inbox className="w-8 h-8 text-white/20" />
          </div>
          <p className="text-white/40 font-semibold">No pending approvals</p>
          <p className="text-white/20 text-sm mt-1">
            All clear — no transactions are waiting for owner approval.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => {
            const payload = getPayload(item.actionPayload);
            const isOpen = expanded === item.id;
            const purposeColor = PURPOSE_COLOR[item.purpose] ?? "text-white/50 bg-white/5 border-white/15";
            const isIssued = item.status === "ISSUED";

            // Booking ref from payload or description parsing
            const bookingRef = (payload.bookingRef as string) ??
              (item.purpose === "DELETE_BOOKING" && item.description.includes("#")
                ? item.description.split("#")[1]?.trim()
                : null);

            return (
              <div
                key={item.id}
                className={`rounded-2xl border transition-all ${
                  isIssued
                    ? "border-green-500/30 bg-green-500/[0.04]"
                    : "border-white/10 bg-white/[0.03]"
                }`}
              >
                <div className="p-4 lg:p-5">
                  {/* Row 1: purpose badge + amount + status */}
                  <div className="flex items-start gap-3 justify-between flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${purposeColor}`}>
                        {PURPOSE_LABEL[item.purpose] ?? item.purpose}
                      </span>
                      {item.amount != null && (
                        <span className="flex items-center gap-0.5 text-white/70 font-bold text-sm">
                          <IndianRupee className="w-3.5 h-3.5" />
                          {item.amount.toLocaleString("en-IN")}
                        </span>
                      )}
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                      isIssued
                        ? "text-green-300 bg-green-500/10 border-green-500/20"
                        : "text-amber-300 bg-amber-500/10 border-amber-500/20"
                    }`}>
                      {isIssued ? "Code Ready" : "Pending Approval"}
                    </span>
                  </div>

                  {/* Row 2: description */}
                  <p className="text-white/70 text-sm mt-2">{item.description}</p>

                  {/* Booking ref link for DELETE_BOOKING */}
                  {item.purpose === "DELETE_BOOKING" && (item.refId || bookingRef) && (
                    <a
                      href={item.refId ? `/hotel-admin/bookings/${item.refId}` : "#"}
                      className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-xs mt-1.5 transition-colors"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="w-3 h-3" />
                      View booking{bookingRef ? ` #${bookingRef}` : ""}
                    </a>
                  )}

                  {/* Row 3: meta */}
                  <p className="text-white/25 text-xs mt-2">
                    Requested by {item.requestedBy ?? "Staff"} · {timeAgo(item.createdAt)}
                    {isIssued && item.issuedAt && ` · Code issued ${timeAgo(item.issuedAt)}`}
                  </p>

                  {/* Enter OTP button / collapse */}
                  <div className="mt-4">
                    {!isOpen ? (
                      <button
                        onClick={() => setExpanded(item.id)}
                        className={`flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-xl transition-all ${
                          isIssued
                            ? "bg-green-500 hover:bg-green-400 text-black"
                            : "bg-white/8 hover:bg-white/12 border border-white/15 text-white/70 hover:text-white"
                        }`}
                      >
                        <KeyRound className="w-4 h-4" />
                        {isIssued ? "Enter OTP — Complete Action" : "Enter OTP when Ready"}
                      </button>
                    ) : (
                      <button
                        onClick={() => setExpanded(null)}
                        className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/50 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" /> Collapse
                      </button>
                    )}
                  </div>

                  {/* Inline OTP entry */}
                  {isOpen && (
                    <OtpEntry item={item} onDone={handleDone} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
