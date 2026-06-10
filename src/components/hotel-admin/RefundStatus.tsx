"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle, BadgeCheck } from "lucide-react";

interface Props {
  bookingId: string;
  refundStatus: string; // NONE | PENDING | PROCESSED | FAILED
  refundAmount: number;
  refundId?: string | null;
}

export default function RefundStatus({ bookingId, refundStatus, refundAmount, refundId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<"auto" | "manual" | null>(null);

  if (refundStatus === "NONE") return null;

  async function act(markManual: boolean) {
    setLoading(markManual ? "manual" : "auto");
    try {
      const res = await fetch(`/api/hotel-admin/bookings/${bookingId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markManual }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message ?? "Refund updated");
        router.refresh();
      } else {
        toast.error(data.message ?? data.error ?? "Refund failed");
      }
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setLoading(null);
    }
  }

  // ── Processed ──
  if (refundStatus === "PROCESSED") {
    const manual = refundId?.startsWith("MANUAL:");
    return (
      <div className="mt-2 flex items-center gap-2 text-xs text-green-400 bg-green-500/8 border border-green-500/20 rounded-lg px-3 py-2">
        <BadgeCheck className="w-3.5 h-3.5 shrink-0" />
        <span>
          Refund of ₹{refundAmount.toLocaleString("en-IN")} {manual ? "marked as paid" : "processed"}
          {!manual && refundId ? ` · ${refundId}` : ""}
        </span>
      </div>
    );
  }

  // ── Pending / Failed → actionable ──
  const failed = refundStatus === "FAILED";
  return (
    <div className={`mt-2 rounded-lg px-3 py-2.5 border ${failed ? "bg-red-500/8 border-red-500/25" : "bg-amber-500/8 border-amber-500/25"}`}>
      <div className={`flex items-center gap-2 text-xs font-semibold mb-2 ${failed ? "text-red-400" : "text-amber-400"}`}>
        {failed ? <AlertTriangle className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
        {failed
          ? `Auto-refund failed — ₹${refundAmount.toLocaleString("en-IN")} owed`
          : `Refund pending — ₹${refundAmount.toLocaleString("en-IN")} owed to guest`}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => act(false)}
          disabled={loading !== null}
          className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-bold py-2 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-300 hover:bg-blue-500/25 transition-all disabled:opacity-50"
        >
          {loading === "auto" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {failed ? "Retry online refund" : "Refund online"}
        </button>
        <button
          onClick={() => act(true)}
          disabled={loading !== null}
          className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-bold py-2 rounded-lg bg-white/5 border border-white/15 text-white/70 hover:bg-white/10 transition-all disabled:opacity-50"
        >
          {loading === "manual" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
          Mark refunded (cash)
        </button>
      </div>
    </div>
  );
}
