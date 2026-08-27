"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Loader2, X, AlertTriangle, Receipt } from "lucide-react";
import { computeTotalsForPrice } from "@/lib/utils/booking-calc";

/**
 * Change what a booking costs after it was made, and correct the deposit.
 *
 * The figure staff type is what the guest pays, GST included — that is how a
 * price gets agreed at the desk. The tax split underneath is shown live as they
 * type, using the same slab logic the server will apply, so nobody has to
 * discover after saving that ₹1,000 and ₹1,050 come to the same thing (the
 * band between them is unreachable at a legal whole-rupee total).
 *
 * The server recomputes the split rather than trusting these numbers; this
 * preview exists so the desk can see what it is agreeing to.
 */
export default function EditPricingButton({
  bookingId,
  bookingRef,
  noOfNights,
  currentTotal,
  currentDeposit,
  depositCollected,
  amountPaid,
  status,
}: {
  bookingId: string;
  bookingRef: string;
  noOfNights: number;
  currentTotal: number;
  currentDeposit: number;
  depositCollected: number;
  amountPaid: number;
  status: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(String(currentTotal));
  const [deposit, setDeposit] = useState(String(currentDeposit));
  const [held, setHeld] = useState(String(depositCollected));
  const [reason, setReason] = useState("");

  const typedTotal = Number(total) || 0;
  const typedDeposit = Number(deposit) || 0;
  const typedHeld = Number(held) || 0;

  // Same reverse-GST split the server runs, so what's shown is what's saved.
  const preview = useMemo(
    () => computeTotalsForPrice({ inclusiveTotal: typedTotal, noOfNights }),
    [typedTotal, noOfNights]
  );

  const belowPaid = typedTotal < amountPaid - 0.5;
  const unreachable = typedTotal > 0 && Math.abs(preview.totalAmount - typedTotal) > 0.5;
  const newBalance = Math.max(0, +(preview.totalAmount - amountPaid).toFixed(2));

  const changed =
    Math.abs(typedTotal - currentTotal) > 0.5 ||
    Math.abs(typedDeposit - currentDeposit) > 0.5 ||
    Math.abs(typedHeld - depositCollected) > 0.5;

  const blocked = loading || !changed || belowPaid || !reason.trim();

  function reset() {
    setTotal(String(currentTotal));
    setDeposit(String(currentDeposit));
    setHeld(String(depositCollected));
    setReason("");
  }

  async function save() {
    setLoading(true);
    try {
      const res = await fetch(`/api/hotel-admin/bookings/${bookingId}/pricing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalAmount: Math.abs(typedTotal - currentTotal) > 0.5 ? typedTotal : undefined,
          refundableDeposit: Math.abs(typedDeposit - currentDeposit) > 0.5 ? typedDeposit : undefined,
          depositCollected: Math.abs(typedHeld - depositCollected) > 0.5 ? typedHeld : undefined,
          reason: reason.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message ?? "Booking updated", { duration: 5000 });
        setOpen(false);
        router.refresh();
      } else {
        toast.error(typeof data.error === "string" ? data.error : "Failed to update");
      }
    } finally {
      setLoading(false);
    }
  }

  const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
  const Row = ({ label, value, dim }: { label: string; value: string; dim?: boolean }) => (
    <div className="flex justify-between text-sm">
      <span className={dim ? "text-white/35 text-xs" : "text-white/50"}>{label}</span>
      <span className={dim ? "text-white/45 text-xs" : "text-white/85 font-semibold"}>{value}</span>
    </div>
  );

  return (
    <>
      <button
        onClick={() => { reset(); setOpen(true); }}
        className="flex items-center gap-2 bg-white/6 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white/60 hover:text-white/85 text-sm font-semibold px-3.5 py-2 rounded-xl transition-all"
      >
        <Pencil className="w-4 h-4" />
        Edit Price
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !loading && setOpen(false)} />
          <div className="relative bg-[#0d1a0e] border border-white/10 rounded-3xl p-6 w-full max-w-md shadow-2xl max-h-[92vh] overflow-y-auto">

            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <Receipt className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h2 className="font-bold text-white">Edit Price &amp; Deposit</h2>
                  <p className="text-white/35 text-xs font-mono">{bookingRef}</p>
                </div>
              </div>
              <button onClick={() => !loading && setOpen(false)} className="text-white/30 hover:text-white/60 p-1 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Room total */}
            <label className="block text-[10px] text-white/35 uppercase tracking-wider font-semibold mb-1.5">
              Total the guest pays (with GST)
            </label>
            <input
              type="number" min={0} value={total}
              onChange={e => setTotal(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-lg font-bold focus:outline-none focus:border-amber-400/50 transition-all mb-3"
            />

            {/* Live breakdown — what this price actually splits into */}
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 space-y-2 mb-3">
              <p className="text-[10px] text-white/35 uppercase tracking-wider font-semibold mb-1">
                Breakdown at this price · {noOfNights} night{noOfNights !== 1 ? "s" : ""}
              </p>
              <Row label="Taxable value" value={inr(preview.taxableAmount)} />
              <Row label={`CGST @ ${preview.cgstRate}%`} value={inr(preview.cgst)} dim />
              <Row label={`SGST @ ${preview.sgstRate}%`} value={inr(preview.sgst)} dim />
              <div className="border-t border-white/10 pt-2 mt-1 flex justify-between font-bold text-white">
                <span>Total</span>
                <span className="text-amber-300">{inr(preview.totalAmount)}</span>
              </div>
              <div className="flex justify-between text-xs pt-1">
                <span className="text-white/35">Paid so far</span>
                <span className="text-white/55">{inr(amountPaid)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-white/35">Still to pay</span>
                <span className={newBalance > 0 ? "text-amber-300 font-semibold" : "text-green-400 font-semibold"}>
                  {inr(newBalance)}
                </span>
              </div>
            </div>

            {unreachable && (
              <p className="text-[11px] text-amber-400/80 mb-3 leading-relaxed">
                {inr(typedTotal)} is not possible with the GST slabs — it will be saved as <strong>{inr(preview.totalAmount)}</strong>, the nearest price below it.
              </p>
            )}

            {belowPaid && (
              <div className="flex items-start gap-2.5 bg-red-500/12 border border-red-500/30 rounded-2xl px-4 py-3 mb-3">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-red-200/85 text-xs leading-relaxed">
                  {inr(amountPaid)} is already paid. Set the total to at least that, or give the difference back
                  first — this does not refund.
                </p>
              </div>
            )}

            {/* Deposit */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-[10px] text-white/35 uppercase tracking-wider font-semibold mb-1.5">
                  Deposit expected
                </label>
                <input
                  type="number" min={0} value={deposit}
                  onChange={e => setDeposit(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-400/50 transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] text-green-400/60 uppercase tracking-wider font-semibold mb-1.5">
                  Deposit held
                </label>
                <input
                  type="number" min={0} value={held}
                  onChange={e => setHeld(e.target.value)}
                  disabled={status === "CHECKED_OUT"}
                  className="w-full bg-green-500/8 border border-green-500/25 rounded-xl px-3 py-2.5 text-green-200 font-semibold text-sm focus:outline-none focus:border-green-400/60 transition-all disabled:opacity-40"
                />
              </div>
            </div>
            <p className="text-[11px] text-white/25 mb-4 leading-relaxed">
              The deposit is separate from the bill. It is not counted as income unless it is used
              or kept back.
            </p>

            <input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Reason for the change"
              maxLength={300}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/40 transition-all mb-4"
            />

            <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-3 mb-4 text-xs text-amber-300/80 leading-relaxed">
              The owner is notified of any price or deposit change, and it is kept in the activity log.
            </div>

            <div className="flex gap-2.5">
              <button onClick={() => !loading && setOpen(false)} disabled={loading}
                className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-white/60 font-semibold text-sm hover:text-white/85 hover:border-white/20 transition-all disabled:opacity-50">
                Cancel
              </button>
              <button onClick={save} disabled={blocked}
                title={!reason.trim() ? "Give a reason first" : undefined}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
                {loading ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
