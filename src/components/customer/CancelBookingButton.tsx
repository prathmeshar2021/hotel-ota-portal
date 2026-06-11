"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { X, AlertTriangle, CheckCircle, Loader2, ShieldCheck } from "lucide-react";
import { getCancellationPolicy, computeCancellationBreakdown, formatHoursUntilCheckIn } from "@/lib/utils/cancellation";

interface Props {
  bookingId: string;
  bookingRef: string;
  checkInDate: Date;
  totalAmount: number;
  depositAmount: number;
  onCancelled?: () => void;
}

export default function CancelBookingButton({
  bookingId, bookingRef, checkInDate, totalAmount, depositAmount, onCancelled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const policy = getCancellationPolicy(new Date(checkInDate));
  const breakdown = computeCancellationBreakdown(totalAmount, depositAmount, policy.chargePercent);

  const tierColor =
    policy.tier === "FREE" ? "green" :
    policy.tier === "HALF" ? "amber" : "red";

  const tierBg =
    policy.tier === "FREE" ? "bg-green-500/10 border-green-500/20 text-green-400" :
    policy.tier === "HALF" ? "bg-amber-500/10 border-amber-500/20 text-amber-400" :
    "bg-red-500/10 border-red-500/20 text-red-400";

  async function handleCancel() {
    setLoading(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/cancel`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Cancellation failed"); return; }
      toast.success(data.message ?? "Booking cancelled");
      setOpen(false);
      onCancelled?.();
      window.location.reload();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center justify-center gap-1.5 text-xs font-semibold text-red-400/70 hover:text-red-400 bg-red-500/5 hover:bg-red-500/10 border border-red-500/15 hover:border-red-500/30 px-3 py-2.5 rounded-xl transition-all"
      >
        <X className="w-3.5 h-3.5" /> Cancel
      </button>

      {open && mounted && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !loading && setOpen(false)} />
          <div className="relative bg-[#0d1a0e] border border-white/10 rounded-3xl p-6 w-full max-w-md shadow-2xl my-auto max-h-[90vh] overflow-y-auto">

            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h2 className="font-bold text-white">Cancel Booking</h2>
                  <p className="text-white/35 text-xs">#{bookingRef}</p>
                </div>
              </div>
              <button onClick={() => !loading && setOpen(false)} className="text-white/30 hover:text-white/60 p-1 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Policy tier badge */}
            <div className={`flex items-center gap-2 border rounded-xl px-4 py-3 mb-4 text-sm font-semibold ${tierBg}`}>
              {policy.tier === "FREE" ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
              {policy.label}
              <span className="ml-auto text-xs font-normal opacity-70">
                {formatHoursUntilCheckIn(policy.hoursUntilCheckIn)} to check-in
              </span>
            </div>

            {/* Breakdown */}
            <div className="bg-white/3 border border-white/8 rounded-2xl p-4 mb-4 space-y-2.5 text-sm">
              <div className="flex justify-between text-white/50">
                <span>Total paid</span>
                <span className="text-white/70">₹{totalAmount.toLocaleString("en-IN")}</span>
              </div>
              {breakdown.cancellationCharge > 0 && (
                <div className="flex justify-between text-red-400">
                  <span>Cancellation charge ({policy.chargePercent}% of room charges)</span>
                  <span>− ₹{breakdown.cancellationCharge.toLocaleString("en-IN")}</span>
                </div>
              )}
              <div className="flex justify-between text-green-400 text-xs">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Deposit refund (always returned)
                </span>
                <span>₹{breakdown.depositRefund.toLocaleString("en-IN")}</span>
              </div>
              <div className="pt-2 border-t border-white/8 flex justify-between font-bold text-white">
                <span>You will receive</span>
                <span style={{ color: tierColor === "green" ? "#4ade80" : tierColor === "amber" ? "#fbbf24" : "#f87171" }}>
                  ₹{breakdown.totalRefund.toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            {/* Deposit note */}
            <div className="bg-green-500/5 border border-green-500/15 rounded-xl px-4 py-2.5 mb-5">
              <p className="text-xs text-green-400/80">
                <span className="font-semibold">₹200 refundable deposit</span> is always returned — cancellation charges apply only to room rent.
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => !loading && setOpen(false)}
                disabled={loading}
                className="flex-1 py-3 rounded-xl border border-white/10 text-white/50 hover:text-white hover:border-white/20 text-sm font-semibold transition-all disabled:opacity-50"
              >
                Keep Booking
              </button>
              <button
                onClick={handleCancel}
                disabled={loading}
                className="flex-1 py-3 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/25 text-red-400 hover:text-red-300 text-sm font-bold transition-all disabled:opacity-60"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Cancelling…
                  </span>
                ) : (
                  "Yes, Cancel Booking"
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
