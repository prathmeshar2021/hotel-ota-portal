"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2, LogIn, LogOut, XCircle, ShieldCheck,
  AlertTriangle, X, CheckCircle2,
} from "lucide-react";
import PayModePicker, { splitFor, type PayMode } from "@/components/hotel-admin/PayModePicker";

interface Props {
  bookingId: string;
  currentStatus: string;
  depositCollected?: number;  // refundable deposit actually held
  additionalCharges?: number; // extra charges accrued during the stay
  balanceDue?: number;        // outstanding bill owed by the guest
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
          totalBilled={totalAmount}
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
  const [collectMode, setCollectMode] = useState<PayMode>("CASH");
  const [collectCash, setCollectCash] = useState(0);
  const [refundCash, setRefundCash] = useState(0);
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
          settlement: {
            amount: collected,
            collectMode,
            collectCash: collectMode === "MIXED" ? splitFor("MIXED", collected, collectCash).cashAmount : undefined,
          },
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
            <span className="text-white/50">Still to pay</span>
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
            <PayModePicker
              mode={collectMode}
              total={collected}
              cashAmount={collectCash}
              label="Paid by"
              onChange={sp => { setCollectMode(sp.mode); setCollectCash(sp.cashAmount); }}
            />
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
                ₹{stillDue.toLocaleString("en-IN")} will still be pending.
              </p>
            )}
          </div>
        ) : (
          <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/25 rounded-2xl px-4 py-3 mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-amber-200/85 text-xs leading-relaxed">
              The room will be held and check-in unlocked, but{" "}
              <strong>₹{outstanding.toLocaleString("en-IN")}</strong> is still to pay —
              take it before the guest leaves.
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
  balanceDue: number;         // unpaid bill
  totalBilled: number;        // what the stay is worth, before any over-refund
  /** true when an online payment exists that a refund can be pushed back to */
  canRefundToSource: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/** Why a guest gets back more than their deposit — one tap instead of typing. */
const EXTRA_REFUND_REASONS = [
  "Left early",
  "Room changed",
  "Overcharged",
  "Goodwill",
];

/** Common reasons to withhold part of a deposit — one tap instead of typing. */
const DEDUCTION_PRESETS = [
  { label: "Cleaning / dirt", amount: 200 },
  { label: "Damage",         amount: 500 },
  { label: "Missing item",   amount: 300 },
  { label: "Late checkout",  amount: 250 },
];

function CheckoutDepositModal({
  bookingId, depositCollected, additionalCharges, balanceDue, totalBilled,
  canRefundToSource, onClose, onSuccess,
}: ModalProps) {
  const [loading, setLoading] = useState(false);
  const [collectMode, setCollectMode] = useState<PayMode>("CASH");
  const [collectCash, setCollectCash] = useState(0);
  const [refundCash, setRefundCash] = useState(0);
  const [notes, setNotes] = useState("");
  const [deduction, setDeduction] = useState(0);
  // Ticked by staff to say the outstanding balance really is being taken now.
  // Deliberately unticked by default: checkout records the balance as collected,
  // and a guest once walked out owing the whole stay because nothing made that
  // consequence visible at the desk.
  const [balanceAcknowledged, setBalanceAcknowledged] = useState(false);
  // Money handed back on top of the deposit — reduces what the stay is worth.
  const [extraRefund, setExtraRefund] = useState(0);
  // Default to sending it back the way it came, when that's possible.
  const [refundMode, setRefundMode] = useState<"RAZORPAY" | PayMode>(
    canRefundToSource ? "RAZORPAY" : "CASH"
  );

  // Net settlement: the deposit held offsets everything still owed
  // (unpaid bill + extra charges). Positive → refund; negative → collect.
  const owed = +(balanceDue + additionalCharges).toFixed(2);
  const net = +(depositCollected - owed).toFixed(2);
  const refundable = Math.max(0, net);
  const collect = Math.max(0, -net);
  // What the guest actually gets back. Normally the deposit less anything
  // withheld, but staff can hand back more than the deposit — an early
  // checkout is the usual reason, where part of the room money is owed back
  // too. `extraRefund` is that part, and it comes off what the stay is worth.
  const refund = +Math.max(0, refundable - deduction + extraRefund).toFixed(2);

  /**
   * Staff type the final figure. Below the deposit it becomes a withholding;
   * above it, the difference is room money going back.
   */
  function setFinalRefund(value: number) {
    const v = Math.max(0, value);
    if (v > refundable) {
      setDeduction(0);
      setExtraRefund(+(v - refundable).toFixed(2));
    } else {
      setExtraRefund(0);
      setDeduction(+(refundable - v).toFixed(2));
    }
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
            refund, collect, collectMode, deduction, extraRefund,
            refundMode: refund > 0 ? refundMode : undefined,
            // Exact split when the money moves both ways at once.
            collectCash: collectMode === "MIXED" ? splitFor("MIXED", collect, collectCash).cashAmount : undefined,
            refundCash: refundMode === "MIXED" ? splitFor("MIXED", refund, refundCash).cashAmount : undefined,
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

        {/* Unpaid bill — the one thing that must not slip past the desk */}
        {balanceDue > 0 && (
          <div className="flex items-start gap-2.5 bg-red-500/12 border border-red-500/30 rounded-2xl px-4 py-3 mb-4">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-red-200 text-sm font-bold">
                Still to pay: ₹{balanceDue.toLocaleString("en-IN")}
              </p>
              <p className="text-red-200/70 text-xs mt-0.5 leading-relaxed">
                Take it now. Checking out marks this as paid either way, so it will show as
                income even if you do not collect it.
              </p>
            </div>
          </div>
        )}

        {/* Settlement breakdown — deposit nets against everything owed */}
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 space-y-2 mb-4">
          {balanceDue > 0 && <Row label="Bill still to pay" value={balanceDue} />}
          {additionalCharges > 0 && <Row label="Extra charges" value={additionalCharges} />}
          <Row label="Deposit with us" value={depositCollected} />
          <div className="border-t border-white/10 pt-2.5 mt-1">
            {refundable > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-green-300 font-bold flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> To give back</span>
                <span className="text-green-300 font-bold text-lg">₹{refundable.toLocaleString("en-IN")}</span>
              </div>
            )}
            {collect > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-red-300 font-bold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> To collect</span>
                <span className="text-red-300 font-bold text-lg">₹{collect.toLocaleString("en-IN")}</span>
              </div>
            )}
            {refundable === 0 && collect === 0 && (
              <p className="flex items-center gap-1.5 text-white/60 text-sm font-semibold"><CheckCircle2 className="w-4 h-4 text-green-400" /> All settled — nothing to pay or return</p>
            )}
          </div>
        </div>
        {additionalCharges > depositCollected && depositCollected >= 0 && collect > 0 && (
          <p className="text-xs text-amber-400/70 mb-4 -mt-1">Extra charges are more than the deposit — collecting the difference.</p>
        )}

        {/* Deduct-and-confirm — only when money is going back to the guest */}
        {refundable > 0 && (
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 mb-4">
            <p className="text-xs text-white/40 uppercase tracking-wider font-semibold mb-2.5">
              Keep back for damage or cleaning
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
                <label className="block text-[10px] text-white/35 uppercase tracking-wider font-semibold mb-1.5">Keep back (₹)</label>
                <input type="number" min={0} max={refundable} value={deduction || ""}
                  onChange={e => setDeduction(Math.min(Math.max(0, Number(e.target.value) || 0), refundable))}
                  placeholder="0"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/50 transition-all" />
              </div>
              <div>
                <label className="block text-[10px] text-green-400/60 uppercase tracking-wider font-semibold mb-1.5">Refund to guest (₹)</label>
                <input type="number" min={0} value={refund}
                  onChange={e => setFinalRefund(Number(e.target.value) || 0)}
                  className="w-full bg-green-500/8 border border-green-500/25 rounded-xl px-3 py-2.5 text-green-200 font-bold text-sm focus:outline-none focus:border-green-400/60 transition-all" />
              </div>
            </div>

            {deduction > 0 && (
              <p className="text-[11px] text-amber-400/70 mt-2">
                ₹{deduction.toLocaleString("en-IN")} kept back from the ₹{refundable.toLocaleString("en-IN")} deposit — write the reason below.
              </p>
            )}

            {extraRefund > 0 && (
              <div className="mt-3 bg-sky-500/10 border border-sky-500/25 rounded-xl px-3 py-2.5">
                <p className="text-sky-200 text-[11px] font-semibold">
                  ₹{extraRefund.toLocaleString("en-IN")} more than the deposit
                </p>
                <p className="text-sky-200/70 text-[11px] mt-0.5 leading-relaxed">
                  This part comes out of the room money, so the booking drops to
                  ₹{Math.max(0, totalBilled - extraRefund).toLocaleString("en-IN")}. The owner is told.
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {EXTRA_REFUND_REASONS.map(r => (
                    <button key={r} type="button" onClick={() => setNotes(r)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                        notes === r
                          ? "bg-sky-500 text-white border-sky-400"
                          : "bg-white/5 border-white/10 text-white/55 hover:text-white/85"
                      }`}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* How the refund goes back */}
        {refund > 0 && (
          <div className="mb-4">
            <p className="text-xs text-white/40 uppercase tracking-wider font-semibold mb-2">How to give it back</p>
            <div className="flex gap-2">
              {canRefundToSource && (
                <button onClick={() => setRefundMode("RAZORPAY")}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${refundMode === "RAZORPAY" ? "bg-green-500/15 border-green-500/30 text-green-300" : "border-white/10 text-white/40 hover:text-white/70"}`}>
                  Same account
                </button>
              )}
              {(["CASH", "ONLINE", "MIXED"] as const).map(m => (
                <button key={m} onClick={() => { setRefundMode(m); if (m === "MIXED") setRefundCash(Math.round(refund / 2)); }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${refundMode === m ? "bg-white/10 border-white/25 text-white" : "border-white/10 text-white/40 hover:text-white/70"}`}>
                  {m === "CASH" ? "Cash" : m === "ONLINE" ? "UPI" : "Both"}
                </button>
              ))}
            </div>
            {refundMode === "MIXED" && (
              <div className="mt-2.5">
                <PayModePicker
                  mode="MIXED"
                  total={refund}
                  cashAmount={refundCash}
                  label=""
                  compact
                  allowMixed={false}
                  onChange={sp => setRefundCash(sp.cashAmount)}
                />
              </div>
            )}
            <p className="text-[11px] text-white/30 mt-2">
              {refundMode === "RAZORPAY"
                ? "Goes back to the card or UPI the guest paid with. Usually instant; some banks take 5–7 days."
                : canRefundToSource
                  ? `Give ₹${refund.toLocaleString("en-IN")} back at the desk. Nothing is sent online.`
                  : `Guest paid at the desk, so give ₹${refund.toLocaleString("en-IN")} back here.`}
            </p>
          </div>
        )}

        {/* Collect mode (only when the guest owes money) */}
        {collect > 0 && (
          <div className="mb-4">
            <PayModePicker
              mode={collectMode}
              total={collect}
              cashAmount={collectCash}
              label="How is it being paid?"
              onChange={sp => { setCollectMode(sp.mode); setCollectCash(sp.cashAmount); }}
            />
          </div>
        )}

        {/* Notes */}
        <textarea
          rows={2}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Notes — reason for keeping back or giving extra…"
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
              I have taken the ₹{balanceDue.toLocaleString("en-IN")} bill
              {collect > 0 ? " (included in the amount below)" : ""}, or the owner has agreed to let it go.
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
            title={balanceDue > 0 && !balanceAcknowledged ? "Confirm the bill has been collected first" : undefined}
            className="flex-1 py-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/25 text-amber-400 hover:text-amber-300 text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Checking out…
              </span>
            ) : collect > 0 ? (
              `Take ₹${collect.toLocaleString("en-IN")} & Check Out`
            ) : refund > 0 ? (
              `Give Back ₹${refund.toLocaleString("en-IN")} & Check Out`
            ) : (
              "Check Out"
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
