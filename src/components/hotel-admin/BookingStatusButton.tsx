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
  totalAmount?: number;       // full price of the stay — what a pending booking still owes
  /** an online payment exists that a deposit refund can be pushed back to */
  canRefundToSource?: boolean;
}

// ─── Check-In Button ──────────────────────────────────────────────────────────
// Simple: just confirm then PATCH
export default function BookingStatusButton({ bookingId, currentStatus, depositCollected = 0, additionalCharges = 0, balanceDue = 0, totalAmount = 0, canRefundToSource = false }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  // Render for PENDING_PAYMENT (manual confirm), CONFIRMED and CHECKED_IN
  if (currentStatus !== "PENDING_PAYMENT" && currentStatus !== "CONFIRMED" && currentStatus !== "CHECKED_IN") return null;

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
      <>
        <button
          onClick={() => setConfirmModalOpen(true)}
          disabled={loading}
          className="flex items-center gap-2 font-bold px-6 py-3 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 shadow-lg bg-blue-500 hover:bg-blue-400 text-white shadow-blue-500/20"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          {loading ? "Confirming…" : "Confirm Booking"}
        </button>

        {confirmModalOpen && (
          <ConfirmBookingModal
            bookingId={bookingId}
            outstanding={balanceDue > 0 ? balanceDue : totalAmount}
            onClose={() => setConfirmModalOpen(false)}
            onSuccess={() => { setConfirmModalOpen(false); router.refresh(); }}
          />
        )}
      </>
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
          canRefundToSource={canRefundToSource}
          onClose={() => setCheckoutModalOpen(false)}
          onSuccess={() => { setCheckoutModalOpen(false); router.refresh(); }}
        />
      )}
    </>
  );
}

// ─── Confirm Booking Modal ────────────────────────────────────────────────────
// A pending booking is one the guest started paying for online and never
// finished. Confirming it holds the room and unlocks check-in — but if it also
// records nothing, the result is indistinguishable from a pay-at-hotel booking,
// and a guest can check out owing the whole stay without anyone noticing. So the
// desk has to say how it was actually settled.

function ConfirmBookingModal({
  bookingId, outstanding, onClose, onSuccess,
}: {
  bookingId: string;
  outstanding: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [settledNow, setSettledNow] = useState(true);
  const [collectMode, setCollectMode] = useState<"CASH" | "ONLINE">("CASH");
  const [amount, setAmount] = useState(outstanding);

  const collected = settledNow ? Math.min(Math.max(0, amount), outstanding) : 0;
  const stillDue = +(outstanding - collected).toFixed(2);

  async function doConfirm() {
    setLoading(true);
    try {
      const res = await fetch(`/api/hotel-admin/bookings/${bookingId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "CONFIRMED",
          settlement: { amount: collected, collectMode },
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(
          collected > 0
            ? `Booking confirmed — ₹${collected.toLocaleString("en-IN")} recorded`
            : `Booking confirmed — ₹${stillDue.toLocaleString("en-IN")} to collect at the desk`
        );
        onSuccess();
      } else {
        toast.error(data.error ?? "Failed to confirm booking");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !loading && onClose()} />
      <div className="relative bg-[#0d1a0e] border border-white/10 rounded-3xl p-6 w-full max-w-md shadow-2xl">

        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="font-bold text-white">Confirm Booking</h2>
              <p className="text-white/35 text-xs">The guest never completed payment online</p>
            </div>
          </div>
          <button onClick={() => !loading && onClose()} className="text-white/30 hover:text-white/60 p-1 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-white/50">Outstanding on this booking</span>
            <span className="text-white/85 font-semibold">₹{outstanding.toLocaleString("en-IN")}</span>
          </div>
        </div>

        <p className="text-xs text-white/40 uppercase tracking-wider font-semibold mb-2.5">
          How was it settled?
        </p>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { label: "Cash now", on: true, m: "CASH" as const },
            { label: "UPI now", on: true, m: "ONLINE" as const },
            { label: "Not paid", on: false, m: null },
          ].map(opt => {
            const active = opt.on ? settledNow && collectMode === opt.m : !settledNow;
            return (
              <button
                key={opt.label}
                type="button"
                onClick={() => {
                  if (opt.on) { setSettledNow(true); setCollectMode(opt.m!); setAmount(outstanding); }
                  else setSettledNow(false);
                }}
                className={`px-2.5 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
                  active
                    ? "bg-blue-500 text-white border-blue-400"
                    : "bg-white/5 border-white/10 text-white/55 hover:text-white/85 hover:border-white/20"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {settledNow ? (
          <div className="mb-4">
            <label className="block text-[10px] text-white/35 uppercase tracking-wider font-semibold mb-1.5">
              Amount taken (₹)
            </label>
            <input
              type="number" min={0} max={outstanding} value={amount || ""}
              onChange={e => setAmount(Math.min(Math.max(0, Number(e.target.value) || 0), outstanding))}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-blue-400/50 transition-all"
            />
            {stillDue > 0 && (
              <p className="text-[11px] text-amber-400/80 mt-2">
                ₹{stillDue.toLocaleString("en-IN")} will remain due at the desk.
              </p>
            )}
          </div>
        ) : (
          <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/25 rounded-2xl px-4 py-3 mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-amber-200/85 text-xs leading-relaxed">
              The room will be held and check-in unlocked, but{" "}
              <strong>₹{outstanding.toLocaleString("en-IN")}</strong> stays outstanding —
              collect it before the guest leaves.
            </p>
          </div>
        )}

        <div className="flex gap-2.5">
          <button onClick={() => !loading && onClose()} disabled={loading}
            className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-white/60 font-semibold text-sm hover:text-white/85 hover:border-white/20 transition-all disabled:opacity-50">
            Cancel
          </button>
          <button onClick={doConfirm} disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-bold text-sm transition-all disabled:opacity-60">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {loading ? "Confirming…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Checkout Deposit Modal ───────────────────────────────────────────────────

interface ModalProps {
  bookingId: string;
  depositCollected: number;   // refundable deposit actually held (0 if never taken)
  additionalCharges: number;  // extra charges accrued during the stay
  balanceDue: number;         // unpaid room balance
  /** true when an online payment exists that a refund can be pushed back to */
  canRefundToSource: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/** Common reasons to withhold part of a deposit — one tap instead of typing. */
const DEDUCTION_PRESETS = [
  { label: "Cleaning / dirt", amount: 200 },
  { label: "Damage",         amount: 500 },
  { label: "Missing item",   amount: 300 },
  { label: "Late checkout",  amount: 250 },
];

function CheckoutDepositModal({
  bookingId, depositCollected, additionalCharges, balanceDue,
  canRefundToSource, onClose, onSuccess,
}: ModalProps) {
  const [loading, setLoading] = useState(false);
  const [collectMode, setCollectMode] = useState<"CASH" | "ONLINE">("CASH");
  const [notes, setNotes] = useState("");
  const [deduction, setDeduction] = useState(0);
  // Ticked by staff to say the outstanding balance really is being taken now.
  // Deliberately unticked by default: checkout records the balance as collected,
  // and a guest once walked out owing the whole stay because nothing made that
  // consequence visible at the desk.
  const [balanceAcknowledged, setBalanceAcknowledged] = useState(false);
  // Default to sending it back the way it came, when that's possible.
  const [refundMode, setRefundMode] = useState<"RAZORPAY" | "CASH" | "ONLINE">(
    canRefundToSource ? "RAZORPAY" : "CASH"
  );

  // Net settlement: the deposit held offsets everything still owed
  // (unpaid room balance + extra charges). Positive → refund; negative → collect.
  const owed = +(balanceDue + additionalCharges).toFixed(2);
  const net = +(depositCollected - owed).toFixed(2);
  const refundable = Math.max(0, net);
  const collect = Math.max(0, -net);
  // What the guest actually gets back, after anything withheld at inspection.
  const refund = +Math.max(0, refundable - deduction).toFixed(2);

  /** Staff can type the final figure directly; the deduction follows from it. */
  function setFinalRefund(value: number) {
    const clamped = Math.min(Math.max(0, value), refundable);
    setDeduction(+(refundable - clamped).toFixed(2));
  }

  function togglePreset(amount: number) {
    setDeduction(d => (d === amount ? 0 : Math.min(amount, refundable)));
  }

  async function doCheckout() {
    setLoading(true);
    try {
      const res = await fetch(`/api/hotel-admin/bookings/${bookingId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "CHECKED_OUT",
          settlement: {
            refund, collect, collectMode, deduction,
            refundMode: refund > 0 ? refundMode : undefined,
            notes: notes || undefined,
          },
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message ?? "Guest checked out. Room marked for cleaning.");
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

        {/* Unpaid room balance — the one thing that must not slip past the desk */}
        {balanceDue > 0 && (
          <div className="flex items-start gap-2.5 bg-red-500/12 border border-red-500/30 rounded-2xl px-4 py-3 mb-4">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-red-200 text-sm font-bold">
                This guest still owes ₹{balanceDue.toLocaleString("en-IN")} for the room
              </p>
              <p className="text-red-200/70 text-xs mt-0.5 leading-relaxed">
                They never paid online. Take it now — checking out records this balance as
                collected, so it will show in the accounts either way.
              </p>
            </div>
          </div>
        )}

        {/* Settlement breakdown — deposit nets against everything owed */}
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 space-y-2 mb-4">
          {balanceDue > 0 && <Row label="Room balance owed" value={balanceDue} />}
          {additionalCharges > 0 && <Row label="Extra charges (tea, damage…)" value={additionalCharges} />}
          <Row label="Refundable deposit held" value={depositCollected} />
          <div className="border-t border-white/10 pt-2.5 mt-1">
            {refundable > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-green-300 font-bold flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> Refundable to guest</span>
                <span className="text-green-300 font-bold text-lg">₹{refundable.toLocaleString("en-IN")}</span>
              </div>
            )}
            {collect > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-red-300 font-bold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Collect from guest</span>
                <span className="text-red-300 font-bold text-lg">₹{collect.toLocaleString("en-IN")}</span>
              </div>
            )}
            {refundable === 0 && collect === 0 && (
              <p className="flex items-center gap-1.5 text-white/60 text-sm font-semibold"><CheckCircle2 className="w-4 h-4 text-green-400" /> Fully settled — nothing to collect or refund</p>
            )}
          </div>
        </div>
        {additionalCharges > depositCollected && depositCollected >= 0 && collect > 0 && (
          <p className="text-xs text-amber-400/70 mb-4 -mt-1">Extra charges exceed the deposit held — the difference is being collected.</p>
        )}

        {/* Deduct-and-confirm — only when money is going back to the guest */}
        {refundable > 0 && (
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 mb-4">
            <p className="text-xs text-white/40 uppercase tracking-wider font-semibold mb-2.5">
              Deduct for dirt / damage
            </p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {DEDUCTION_PRESETS.filter(p => p.amount <= refundable).map(p => (
                <button key={p.label} type="button" onClick={() => togglePreset(p.amount)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
                    deduction === p.amount
                      ? "bg-amber-500 text-black border-amber-400"
                      : "bg-white/5 border-white/10 text-white/55 hover:text-white/85 hover:border-white/20"
                  }`}>
                  {p.label} ₹{p.amount}
                </button>
              ))}
              {deduction > 0 && (
                <button type="button" onClick={() => setDeduction(0)}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-white/10 text-white/40 hover:text-red-300 transition-all">
                  Clear
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] text-white/35 uppercase tracking-wider font-semibold mb-1.5">Withheld (₹)</label>
                <input type="number" min={0} max={refundable} value={deduction || ""}
                  onChange={e => setDeduction(Math.min(Math.max(0, Number(e.target.value) || 0), refundable))}
                  placeholder="0"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/50 transition-all" />
              </div>
              <div>
                <label className="block text-[10px] text-green-400/60 uppercase tracking-wider font-semibold mb-1.5">Refund to guest (₹)</label>
                <input type="number" min={0} max={refundable} value={refund}
                  onChange={e => setFinalRefund(Number(e.target.value) || 0)}
                  className="w-full bg-green-500/8 border border-green-500/25 rounded-xl px-3 py-2.5 text-green-200 font-bold text-sm focus:outline-none focus:border-green-400/60 transition-all" />
              </div>
            </div>

            {deduction > 0 && (
              <p className="text-[11px] text-amber-400/70 mt-2">
                ₹{deduction.toLocaleString("en-IN")} withheld from the ₹{refundable.toLocaleString("en-IN")} deposit — add the reason in the notes below.
              </p>
            )}
          </div>
        )}

        {/* How the refund goes back */}
        {refund > 0 && (
          <div className="mb-4">
            <p className="text-xs text-white/40 uppercase tracking-wider font-semibold mb-2">Refund via</p>
            <div className="flex gap-2">
              {canRefundToSource && (
                <button onClick={() => setRefundMode("RAZORPAY")}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${refundMode === "RAZORPAY" ? "bg-green-500/15 border-green-500/30 text-green-300" : "border-white/10 text-white/40 hover:text-white/70"}`}>
                  Back to source
                </button>
              )}
              {(["CASH", "ONLINE"] as const).map(m => (
                <button key={m} onClick={() => setRefundMode(m)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${refundMode === m ? "bg-white/10 border-white/25 text-white" : "border-white/10 text-white/40 hover:text-white/70"}`}>
                  {m === "CASH" ? "Cash" : "UPI"}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-white/30 mt-2">
              {refundMode === "RAZORPAY"
                ? "Instant refund to the card / UPI the guest paid with — credited right away where their bank supports it, otherwise in the normal 5–7 day cycle."
                : canRefundToSource
                  ? `Hand ₹${refund.toLocaleString("en-IN")} back at the desk — nothing is sent through the gateway.`
                  : `Guest paid at the counter, so hand ₹${refund.toLocaleString("en-IN")} back at the desk.`}
            </p>
          </div>
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

        {/* Explicit acknowledgement — no accidental "check out and forget" */}
        {balanceDue > 0 && (
          <label className="flex items-start gap-2.5 bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-3 mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={balanceAcknowledged}
              onChange={e => setBalanceAcknowledged(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-amber-500 shrink-0"
            />
            <span className="text-white/70 text-xs leading-relaxed">
              I have collected the ₹{balanceDue.toLocaleString("en-IN")} room balance
              {collect > 0 ? " (included in the amount below)" : ""}, or the owner has agreed to write it off.
            </span>
          </label>
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
            onClick={doCheckout}
            disabled={loading || (balanceDue > 0 && !balanceAcknowledged)}
            title={balanceDue > 0 && !balanceAcknowledged ? "Confirm the room balance has been collected first" : undefined}
            className="flex-1 py-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/25 text-amber-400 hover:text-amber-300 text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
