"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2, LogIn, LogOut, XCircle, ShieldCheck, ShieldX,
  AlertTriangle, X, IndianRupee, CheckCircle2,
} from "lucide-react";

interface Props {
  bookingId: string;
  currentStatus: string;
  depositAmount?: number; // refundableDeposit from booking
  balanceDue?: number;    // outstanding amount owed by the guest
}

// ─── Check-In Button ──────────────────────────────────────────────────────────
// Simple: just confirm then PATCH
export default function BookingStatusButton({ bookingId, currentStatus, depositAmount = 0, balanceDue = 0 }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);

  // Render for PENDING_PAYMENT (manual confirm), CONFIRMED and CHECKED_IN
  if (currentStatus !== "PENDING_PAYMENT" && currentStatus !== "CONFIRMED" && currentStatus !== "CHECKED_IN") return null;

  // ── Confirm a still-pending booking (e.g. paid externally / pay-at-hotel) ──
  async function handleConfirm() {
    if (!window.confirm("Confirm this booking? It will hold the room and unlock check-in.")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/hotel-admin/bookings/${bookingId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CONFIRMED" }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message ?? "Booking confirmed");
        router.refresh();
      } else {
        toast.error(data.error ?? "Failed to confirm booking");
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Check In (no deposit prompt) ──────────────────────────────────────────
  async function handleCheckIn() {
    if (!window.confirm("Check this guest in? This will mark the room as occupied.")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/hotel-admin/bookings/${bookingId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CHECKED_IN" }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message ?? "Guest checked in");
        router.refresh();
      } else {
        toast.error(data.error ?? "Failed to check in");
      }
    } finally {
      setLoading(false);
    }
  }

  if (currentStatus === "PENDING_PAYMENT") {
    return (
      <button
        onClick={handleConfirm}
        disabled={loading}
        className="flex items-center gap-2 font-bold px-6 py-3 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 shadow-lg bg-blue-500 hover:bg-blue-400 text-white shadow-blue-500/20"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
        {loading ? "Confirming…" : "Confirm Booking"}
      </button>
    );
  }

  if (currentStatus === "CONFIRMED") {
    return (
      <button
        onClick={handleCheckIn}
        disabled={loading}
        className="flex items-center gap-2 font-bold px-6 py-3 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 shadow-lg bg-green-500 hover:bg-green-400 text-white shadow-green-500/20"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
        {loading ? "Updating…" : "Check Guest In"}
      </button>
    );
  }

  // CHECKED_IN → show checkout button that opens deposit modal
  return (
    <>
      <button
        onClick={() => setCheckoutModalOpen(true)}
        disabled={loading}
        className="flex items-center gap-2 font-bold px-6 py-3 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 shadow-lg bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/20"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
        {loading ? "Checking out…" : "Check Guest Out"}
      </button>

      {checkoutModalOpen && (
        <CheckoutDepositModal
          bookingId={bookingId}
          depositAmount={depositAmount}
          balanceDue={balanceDue}
          onClose={() => setCheckoutModalOpen(false)}
          onSuccess={() => { setCheckoutModalOpen(false); router.refresh(); }}
        />
      )}
    </>
  );
}

// ─── Checkout Deposit Modal ───────────────────────────────────────────────────

interface ModalProps {
  bookingId: string;
  depositAmount: number;
  balanceDue: number;
  onClose: () => void;
  onSuccess: () => void;
}

type DepositDecision = "FULL_REFUND" | "PARTIAL_DEDUCTION" | "FULL_DEDUCTION";

function CheckoutDepositModal({ bookingId, depositAmount, balanceDue, onClose, onSuccess }: ModalProps) {
  const [loading, setLoading] = useState(false);
  const [decision, setDecision] = useState<DepositDecision | null>(null);
  const [deductAmount, setDeductAmount] = useState("");
  const [notes, setNotes] = useState("");

  // Outstanding balance the guest still owes — must be settled or explicitly
  // waived before checkout can complete.
  const [due, setDue] = useState(balanceDue);
  const [collecting, setCollecting] = useState(false);
  const [payMode, setPayMode] = useState<"CASH" | "ONLINE">("CASH");
  const [waivePending, setWaivePending] = useState(false);

  // derived
  const deduct = Number(deductAmount) || 0;
  const refundBack = Math.max(0, depositAmount - deduct);
  const damageExtra = deduct > depositAmount ? deduct - depositAmount : 0;

  // Checkout is blocked while money is owed, unless staff explicitly waive it.
  const dueBlocks = due > 0 && !waivePending;

  async function collectDue() {
    setCollecting(true);
    try {
      const res = await fetch(`/api/hotel-admin/bookings/${bookingId}/payment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: due, mode: payMode, notes: "Collected at checkout" }),
      });
      const data = await res.json();
      if (res.ok) {
        setDue(data.newBalance ?? 0);
        toast.success(data.message ?? "Payment collected");
      } else {
        toast.error(data.error ?? "Failed to record payment");
      }
    } finally {
      setCollecting(false);
    }
  }

  async function doCheckout(opts: { depositRefunded: boolean; depositDeducted: number; depositNotes?: string }) {
    setLoading(true);
    try {
      const res = await fetch(`/api/hotel-admin/bookings/${bookingId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CHECKED_OUT", ...opts }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Guest checked out. Room marked for cleaning.");
        onSuccess();
      } else {
        toast.error(data.error ?? "Checkout failed");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleCheckout() {
    if (!decision) { toast.error("Choose a deposit decision"); return; }
    if ((decision === "PARTIAL_DEDUCTION" || decision === "FULL_DEDUCTION") && deduct <= 0) {
      toast.error("Enter a deduction amount"); return;
    }
    doCheckout({
      depositRefunded: decision === "FULL_REFUND",
      depositDeducted: decision === "FULL_REFUND" ? 0 : deduct,
      depositNotes: notes || undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !loading && onClose()} />
      <div className="relative bg-[#0d1a0e] border border-white/10 rounded-3xl p-6 w-full max-w-md shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <LogOut className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="font-bold text-white">Check Guest Out</h2>
              <p className="text-white/35 text-xs">Deposit decision required</p>
            </div>
          </div>
          <button onClick={() => !loading && onClose()} className="text-white/30 hover:text-white/60 p-1 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ⚠️ Outstanding balance due — prompt to collect before checkout */}
        {due > 0 && (
          <div className="bg-red-500/8 border border-red-500/25 rounded-xl px-4 py-3.5 mb-5">
            <p className="text-sm text-red-300 font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              ₹{due.toLocaleString("en-IN")} payment due — collect from the guest
            </p>
            <div className="flex gap-2 mt-3">
              {(["CASH", "ONLINE"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setPayMode(m)}
                  disabled={collecting}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all ${
                    payMode === m ? "bg-white/10 border-white/25 text-white" : "border-white/10 text-white/40 hover:text-white/70"
                  }`}
                >
                  {m === "CASH" ? "Cash" : "UPI / Online"}
                </button>
              ))}
              <button
                onClick={collectDue}
                disabled={collecting}
                className="flex-[1.4] py-2 rounded-lg text-xs font-bold bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-300 transition-all disabled:opacity-50"
              >
                {collecting ? "Recording…" : `Mark ₹${due.toLocaleString("en-IN")} collected`}
              </button>
            </div>
            <label className="flex items-center gap-2 mt-3 text-xs text-white/40 cursor-pointer">
              <input type="checkbox" checked={waivePending} onChange={(e) => setWaivePending(e.target.checked)} className="accent-red-400" />
              Check out with dues still pending
            </label>
          </div>
        )}
        {due === 0 && balanceDue > 0 && (
          <div className="bg-green-500/8 border border-green-500/20 rounded-xl px-4 py-2.5 mb-5">
            <p className="text-sm text-green-300 font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> Payment settled
            </p>
          </div>
        )}

        {/* Deposit info */}
        {depositAmount > 0 && (
          <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl px-4 py-3 mb-5">
            <p className="text-sm text-amber-300/80 font-semibold flex items-center gap-1.5">
              <IndianRupee className="w-4 h-4" />
              ₹{depositAmount.toLocaleString("en-IN")} refundable deposit was collected
            </p>
            <p className="text-xs text-white/35 mt-0.5">Decide how much to return to the guest.</p>
          </div>
        )}

        {/* Decision buttons */}
        <p className="text-xs text-white/40 uppercase tracking-wider font-semibold mb-3">Room Condition</p>
        <div className="space-y-2 mb-4">

          {/* Full refund */}
          <button
            onClick={() => { setDecision("FULL_REFUND"); setDeductAmount(""); setNotes(""); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
              decision === "FULL_REFUND"
                ? "bg-green-500/15 border-green-500/30 text-green-300"
                : "bg-white/3 border-white/8 text-white/50 hover:bg-white/6 hover:border-white/15"
            }`}
          >
            <ShieldCheck className={`w-5 h-5 shrink-0 ${decision === "FULL_REFUND" ? "text-green-400" : "text-white/30"}`} />
            <div>
              <p className="font-semibold text-sm">Room is fine — full deposit refund</p>
              <p className="text-xs opacity-60">Return ₹{depositAmount.toLocaleString("en-IN")} to guest</p>
            </div>
          </button>

          {/* Partial / damage deduction */}
          <button
            onClick={() => setDecision("PARTIAL_DEDUCTION")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
              decision === "PARTIAL_DEDUCTION"
                ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                : "bg-white/3 border-white/8 text-white/50 hover:bg-white/6 hover:border-white/15"
            }`}
          >
            <AlertTriangle className={`w-5 h-5 shrink-0 ${decision === "PARTIAL_DEDUCTION" ? "text-amber-400" : "text-white/30"}`} />
            <div>
              <p className="font-semibold text-sm">Minor issue — deduct from deposit</p>
              <p className="text-xs opacity-60">Specify deduction amount below</p>
            </div>
          </button>

          {/* Full / excess damage */}
          <button
            onClick={() => setDecision("FULL_DEDUCTION")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
              decision === "FULL_DEDUCTION"
                ? "bg-red-500/15 border-red-500/30 text-red-300"
                : "bg-white/3 border-white/8 text-white/50 hover:bg-white/6 hover:border-white/15"
            }`}
          >
            <ShieldX className={`w-5 h-5 shrink-0 ${decision === "FULL_DEDUCTION" ? "text-red-400" : "text-white/30"}`} />
            <div>
              <p className="font-semibold text-sm">Significant damage — charge guest</p>
              <p className="text-xs opacity-60">Can exceed deposit for damage recovery</p>
            </div>
          </button>
        </div>

        {/* Deduction amount input */}
        {(decision === "PARTIAL_DEDUCTION" || decision === "FULL_DEDUCTION") && (
          <div className="space-y-3 mb-4">
            <div>
              <label className="block text-xs font-semibold text-white/45 uppercase tracking-wider mb-2">
                Deduction Amount (₹)
                {decision === "FULL_DEDUCTION" && (
                  <span className="normal-case font-normal text-amber-400/70 ml-1">— can exceed deposit</span>
                )}
              </label>
              <div className="relative">
                <IndianRupee className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                <input
                  type="number"
                  min={1}
                  value={deductAmount}
                  onChange={e => setDeductAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/40 transition-all"
                />
              </div>
              {deduct > 0 && (
                <div className="mt-2 flex gap-2 text-xs">
                  {refundBack > 0 ? (
                    <span className="text-green-400/80">Guest receives back ₹{refundBack.toLocaleString("en-IN")}</span>
                  ) : (
                    <span className="text-red-400/80">Full deposit retained</span>
                  )}
                  {damageExtra > 0 && (
                    <span className="text-amber-400/80 ml-auto">₹{damageExtra.toLocaleString("en-IN")} extra damage charge</span>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-white/45 uppercase tracking-wider mb-2">
                Reason / Notes
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="E.g. broken mirror, stains on mattress..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/40 transition-all resize-none"
              />
            </div>
          </div>
        )}

        {/* No deposit case */}
        {depositAmount === 0 && (
          <div className="bg-white/3 border border-white/8 rounded-xl px-4 py-3 mb-4 text-sm text-white/40">
            No deposit was collected for this booking.
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => !loading && onClose()}
            disabled={loading}
            className="flex-1 py-3 rounded-xl border border-white/10 text-white/50 hover:text-white hover:border-white/20 text-sm font-semibold transition-all disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={depositAmount === 0
              ? () => doCheckout({ depositRefunded: true, depositDeducted: 0 })
              : handleCheckout}
            disabled={loading || collecting || dueBlocks || (depositAmount > 0 && !decision)}
            className="flex-1 py-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/25 text-amber-400 hover:text-amber-300 text-sm font-bold transition-all disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Checking out…
              </span>
            ) : dueBlocks ? (
              "Collect payment first"
            ) : (
              "Confirm Checkout"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── No-Show Button (unchanged) ───────────────────────────────────────────────

export function NoShowButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleNoShow() {
    if (!window.confirm("Mark this booking as No Show?")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/hotel-admin/bookings/${bookingId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "NO_SHOW" }),
      });
      if (res.ok) {
        toast.success("Marked as No Show");
        router.refresh();
      } else {
        toast.error("Failed to update");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleNoShow}
      disabled={loading}
      className="flex items-center gap-2 text-sm font-semibold text-red-400/70 hover:text-red-400 border border-red-500/20 hover:border-red-500/40 bg-red-500/5 hover:bg-red-500/10 px-4 py-2.5 rounded-xl transition-all disabled:opacity-50"
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
      No Show
    </button>
  );
}
