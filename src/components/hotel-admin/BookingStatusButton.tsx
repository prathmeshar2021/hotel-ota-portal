"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2, LogIn, LogOut, XCircle, ShieldCheck,
  AlertTriangle, X, CheckCircle2,
} from "lucide-react";

interface Props {
  bookingId: string;
  currentStatus: string;
  depositCollected?: number;  // refundable deposit actually held
  additionalCharges?: number; // extra charges accrued during the stay
  balanceDue?: number;        // outstanding room balance owed by the guest
}

// ─── Check-In Button ──────────────────────────────────────────────────────────
// Simple: just confirm then PATCH
export default function BookingStatusButton({ bookingId, currentStatus, depositCollected = 0, additionalCharges = 0, balanceDue = 0 }: Props) {
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
          depositCollected={depositCollected}
          additionalCharges={additionalCharges}
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
  depositCollected: number;   // refundable deposit actually held (0 if never taken)
  additionalCharges: number;  // extra charges accrued during the stay
  balanceDue: number;         // unpaid room balance
  onClose: () => void;
  onSuccess: () => void;
}

function CheckoutDepositModal({ bookingId, depositCollected, additionalCharges, balanceDue, onClose, onSuccess }: ModalProps) {
  const [loading, setLoading] = useState(false);
  const [collectMode, setCollectMode] = useState<"CASH" | "ONLINE">("CASH");
  const [notes, setNotes] = useState("");

  // Net settlement: the deposit held offsets everything still owed
  // (unpaid room balance + extra charges). Positive → refund; negative → collect.
  const owed = +(balanceDue + additionalCharges).toFixed(2);
  const net = +(depositCollected - owed).toFixed(2);
  const refund = Math.max(0, net);
  const collect = Math.max(0, -net);

  async function doCheckout() {
    setLoading(true);
    try {
      const res = await fetch(`/api/hotel-admin/bookings/${bookingId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "CHECKED_OUT",
          settlement: { refund, collect, collectMode, notes: notes || undefined },
        }),
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

  const Row = ({ label, value }: { label: string; value: number }) => (
    <div className="flex justify-between text-sm">
      <span className="text-white/50">{label}</span>
      <span className="text-white/85 font-semibold">₹{value.toLocaleString("en-IN")}</span>
    </div>
  );

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
              <p className="text-white/35 text-xs">Final settlement</p>
            </div>
          </div>
          <button onClick={() => !loading && onClose()} className="text-white/30 hover:text-white/60 p-1 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Settlement breakdown — deposit nets against everything owed */}
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 space-y-2 mb-4">
          {balanceDue > 0 && <Row label="Room balance owed" value={balanceDue} />}
          {additionalCharges > 0 && <Row label="Extra charges (tea, damage…)" value={additionalCharges} />}
          <Row label="Refundable deposit held" value={depositCollected} />
          <div className="border-t border-white/10 pt-2.5 mt-1">
            {refund > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-green-300 font-bold flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> Refund to guest</span>
                <span className="text-green-300 font-bold text-lg">₹{refund.toLocaleString("en-IN")}</span>
              </div>
            )}
            {collect > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-red-300 font-bold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Collect from guest</span>
                <span className="text-red-300 font-bold text-lg">₹{collect.toLocaleString("en-IN")}</span>
              </div>
            )}
            {refund === 0 && collect === 0 && (
              <p className="flex items-center gap-1.5 text-white/60 text-sm font-semibold"><CheckCircle2 className="w-4 h-4 text-green-400" /> Fully settled — nothing to collect or refund</p>
            )}
          </div>
        </div>
        {additionalCharges > depositCollected && depositCollected >= 0 && collect > 0 && (
          <p className="text-xs text-amber-400/70 mb-4 -mt-1">Extra charges exceed the deposit held — the difference is being collected.</p>
        )}

        {/* Collect mode (only when the guest owes money) */}
        {collect > 0 && (
          <div className="mb-4">
            <p className="text-xs text-white/40 uppercase tracking-wider font-semibold mb-2">Collect via</p>
            <div className="flex gap-2">
              {(["CASH", "ONLINE"] as const).map((m) => (
                <button key={m} onClick={() => setCollectMode(m)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${collectMode === m ? "bg-white/10 border-white/25 text-white" : "border-white/10 text-white/40 hover:text-white/70"}`}>
                  {m === "CASH" ? "Cash" : "UPI / Online"}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <textarea
          rows={2}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Notes (e.g. damage details)…"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/40 transition-all resize-none mb-4"
        />

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
            onClick={doCheckout}
            disabled={loading}
            className="flex-1 py-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/25 text-amber-400 hover:text-amber-300 text-sm font-bold transition-all disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Checking out…
              </span>
            ) : collect > 0 ? (
              `Collect ₹${collect.toLocaleString("en-IN")} & Check Out`
            ) : refund > 0 ? (
              `Refund ₹${refund.toLocaleString("en-IN")} & Check Out`
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
