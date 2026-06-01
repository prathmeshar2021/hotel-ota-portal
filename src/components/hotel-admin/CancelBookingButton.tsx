"use client";

import { useState } from "react";
import { toast } from "sonner";
import { X, AlertTriangle, ShieldCheck, CheckCircle } from "lucide-react";
import { getCancellationPolicy, computeCancellationBreakdown, formatHoursUntilCheckIn } from "@/lib/utils/cancellation";
import OtpGate from "@/components/hotel-admin/OtpGate";

interface Props {
  bookingId: string;
  bookingRef: string;
  checkInDate: Date;
  totalAmount: number;
  depositAmount: number;
}

export default function AdminCancelBookingButton({
  bookingId, bookingRef, checkInDate, totalAmount, depositAmount,
}: Props) {
  const [open, setOpen] = useState(false);
  const [otpOpen, setOtpOpen] = useState(false);
  const [waiveCharge, setWaiveCharge] = useState(false);

  const policy = getCancellationPolicy(new Date(checkInDate));
  const breakdown = computeCancellationBreakdown(totalAmount, depositAmount, policy.chargePercent);
  const finalCharge = waiveCharge ? 0 : breakdown.cancellationCharge;
  const finalRefund = totalAmount - finalCharge;

  const tierBg =
    policy.tier === "FREE" ? "bg-green-500/10 border-green-500/20 text-green-400" :
    policy.tier === "HALF" ? "bg-amber-500/10 border-amber-500/20 text-amber-400" :
    "bg-red-500/10 border-red-500/20 text-red-400";

  async function handleCancel(otpId: string, otpCode: string) {
    const res = await fetch(`/api/hotel-admin/bookings/${bookingId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ overrideCharge: finalCharge, otpId, otpCode }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Cancellation failed");
    toast.success(`Booking #${bookingRef} cancelled`);
    setOtpOpen(false);
    setOpen(false);
    window.location.reload();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm font-semibold text-red-400/70 hover:text-red-400 bg-red-500/8 hover:bg-red-500/15 border border-red-500/20 px-4 py-2.5 rounded-xl transition-all"
      >
        <X className="w-4 h-4" /> Cancel Booking
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative bg-[#0d1a0e] border border-white/10 rounded-3xl p-6 w-full max-w-md shadow-2xl">

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
              <button onClick={() => setOpen(false)} className="text-white/30 hover:text-white/60 p-1 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Policy */}
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
                <span>Total booking amount</span>
                <span className="text-white/70">₹{totalAmount.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-white/50 text-xs">
                <span>Room charges</span>
                <span>₹{breakdown.roomCharges.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-red-400">
                <span>
                  Cancellation charge
                  {waiveCharge ? " (waived)" : ` (${policy.chargePercent}%)`}
                </span>
                <span className={waiveCharge ? "line-through opacity-40" : ""}>
                  − ₹{breakdown.cancellationCharge.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="flex justify-between text-green-400 text-xs">
                <span className="flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Deposit (always returned)</span>
                <span>₹{depositAmount.toLocaleString("en-IN")}</span>
              </div>
              <div className="pt-2 border-t border-white/8 flex justify-between font-bold text-white">
                <span>Guest refund</span>
                <span className={finalCharge === 0 ? "text-green-400" : "text-amber-400"}>
                  ₹{finalRefund.toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            {/* Admin override: waive the charge */}
            {policy.tier !== "FREE" && (
              <label className="flex items-center gap-3 bg-white/3 border border-white/8 rounded-xl px-4 py-3 mb-4 cursor-pointer hover:bg-white/5 transition-all">
                <input
                  type="checkbox"
                  checked={waiveCharge}
                  onChange={(e) => setWaiveCharge(e.target.checked)}
                  className="w-4 h-4 rounded accent-amber-400"
                />
                <div>
                  <p className="text-sm text-white/70 font-semibold">Waive cancellation charge</p>
                  <p className="text-xs text-white/35">Offer a full refund as goodwill (admin override)</p>
                </div>
              </label>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 py-3 rounded-xl border border-white/10 text-white/50 hover:text-white hover:border-white/20 text-sm font-semibold transition-all"
              >
                Keep Booking
              </button>
              <button
                onClick={() => setOtpOpen(true)}
                className="flex-1 py-3 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/25 text-red-400 hover:text-red-300 text-sm font-bold transition-all"
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}

      <OtpGate
        open={otpOpen}
        onClose={() => setOtpOpen(false)}
        purpose="DELETE_BOOKING"
        description={`Cancel booking #${bookingRef}`}
        amount={finalCharge > 0 ? finalCharge : undefined}
        refId={bookingId}
        onConfirm={handleCancel}
        title="Owner Approval — Cancel Booking"
      />
    </>
  );
}
