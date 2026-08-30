"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  X, Banknote, Smartphone, Loader2, CheckCircle2, IndianRupee, Layers,
} from "lucide-react";
import PayModePicker, { splitFor, type PayMode } from "@/components/hotel-admin/PayModePicker";

interface Props {
  bookingId: string;
  balanceDue: number;
  guestName: string;
  bookingRef: string;
}

export default function CollectPaymentModal({
  bookingId,
  balanceDue,
  guestName,
  bookingRef,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(balanceDue.toString());
  const [mode, setMode] = useState<PayMode>("CASH");
  // Cash side when the guest settles part in notes, part by UPI.
  const [cashPart, setCashPart] = useState(0);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState<{ collected: number; newBalance: number; isFullyPaid: boolean } | null>(null);

  // Reset form whenever modal opens
  useEffect(() => {
    if (open) {
      setAmount(balanceDue.toString());
      setMode("CASH");
      setCashPart(0);
      setNotes("");
      setDone(false);
      setResult(null);
    }
  }, [open, balanceDue]);

  const parsedAmount = parseFloat(amount) || 0;
  const isOverpay = parsedAmount > balanceDue;

  async function handleCollect(e: React.FormEvent) {
    e.preventDefault();
    if (parsedAmount <= 0) { toast.error("Enter a valid amount"); return; }
    if (isOverpay)         { toast.error("Amount exceeds balance due"); return; }

    setLoading(true);
    try {
      const res = await fetch(`/api/hotel-admin/bookings/${bookingId}/payment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parsedAmount,
          mode,
          cashAmount: mode === "MIXED" ? splitFor("MIXED", parsedAmount, cashPart).cashAmount : undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to record payment");
        return;
      }
      setResult(data);
      setDone(true);
      toast.success(data.message);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    if (!loading) setOpen(false);
  }

  return (
    <>
      {/* Trigger — red badge + button */}
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between mt-3 bg-red-500/10 hover:bg-red-500/15 border border-red-500/25 hover:border-red-500/40 rounded-xl px-4 py-3 transition-all group"
      >
        <div className="flex items-center gap-2.5">
          <IndianRupee className="w-4 h-4 text-red-400" />
          <div className="text-left">
            <p className="text-red-400 font-bold text-sm">
              ₹{balanceDue.toLocaleString("en-IN")} balance due
            </p>
            <p className="text-red-400/50 text-xs">Tap to collect payment</p>
          </div>
        </div>
        <Banknote className="w-4 h-4 text-red-400/50 group-hover:text-red-400 transition-colors" />
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            onClick={handleClose}
          />

          <div className="relative z-10 w-full max-w-md bg-[#0A1A0D] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-green-500/15 border border-green-500/20 flex items-center justify-center">
                  <Banknote className="w-4 h-4 text-green-400" />
                </div>
                <div>
                  <h2 className="font-bold text-white text-sm">Collect Payment</h2>
                  <p className="text-white/35 text-xs">{guestName} · {bookingRef}</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                disabled={loading}
                className="text-white/30 hover:text-white/70 p-1.5 rounded-lg hover:bg-white/8 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            {done && result ? (
              /* ── Success state ── */
              <div className="px-6 py-8 flex flex-col items-center text-center gap-4">
                <div className="w-14 h-14 rounded-full bg-green-500/15 border border-green-500/20 flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7 text-green-400" />
                </div>
                <div>
                  <p className="text-white font-bold text-lg">
                    ₹{result.collected.toLocaleString("en-IN")} Collected
                  </p>
                  {result.isFullyPaid ? (
                    <p className="text-green-400 text-sm mt-1">Booking fully settled ✓</p>
                  ) : (
                    <p className="text-amber-400 text-sm mt-1">
                      ₹{result.newBalance.toLocaleString("en-IN")} still outstanding
                    </p>
                  )}
                </div>
                <button
                  onClick={handleClose}
                  className="mt-2 px-6 py-2.5 rounded-xl bg-white/8 hover:bg-white/12 border border-white/10 text-white/70 font-semibold text-sm transition-all"
                >
                  Close
                </button>
              </div>
            ) : (
              /* ── Form ── */
              <form onSubmit={handleCollect} className="px-6 py-5 space-y-5">

                {/* Balance due summary */}
                <div className="bg-red-500/8 border border-red-500/20 rounded-xl px-4 py-3 flex items-center justify-between">
                  <p className="text-white/50 text-sm">Total balance due</p>
                  <p className="text-red-400 font-bold text-lg">
                    ₹{balanceDue.toLocaleString("en-IN")}
                  </p>
                </div>

                {/* Amount to collect */}
                <div>
                  <label className="block text-xs font-semibold text-white/45 uppercase tracking-wider mb-2">
                    Amount Collecting Now
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 text-sm font-bold">₹</span>
                    <input
                      type="number"
                      min="1"
                      max={balanceDue}
                      step="1"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      required
                      className={`w-full bg-white/5 border rounded-xl pl-8 pr-4 py-3 text-white text-sm font-mono focus:outline-none transition-all ${
                        isOverpay
                          ? "border-red-500/50 focus:border-red-500/70"
                          : "border-white/10 focus:border-green-400/50"
                      }`}
                    />
                  </div>
                  {isOverpay && (
                    <p className="text-red-400 text-xs mt-1.5">Cannot exceed balance of ₹{balanceDue.toLocaleString("en-IN")}</p>
                  )}
                  {/* Quick-fill: collect full amount */}
                  {parsedAmount !== balanceDue && (
                    <button
                      type="button"
                      onClick={() => setAmount(balanceDue.toString())}
                      className="text-xs text-blue-400 hover:text-blue-300 mt-1.5 transition-colors"
                    >
                      Collect full amount →
                    </button>
                  )}
                </div>

                {/* Payment mode */}
                <div>
                  <label className="block text-xs font-semibold text-white/45 uppercase tracking-wider mb-2">
                    Payment Mode
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { value: "CASH",   label: "Cash",       icon: Banknote,   desc: "Notes" },
                      { value: "ONLINE", label: "UPI / Card", icon: Smartphone, desc: "GPay, PhonePe…" },
                      { value: "MIXED",  label: "Both",       icon: Layers,     desc: "Cash + UPI" },
                    ] as const).map(opt => {
                      const Icon = opt.icon;
                      const selected = mode === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setMode(opt.value)}
                          className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-sm font-semibold transition-all ${
                            selected
                              ? "bg-green-500/15 border-green-500/40 text-green-300"
                              : "bg-white/4 border-white/10 text-white/40 hover:bg-white/8 hover:text-white/60"
                          }`}
                        >
                          <Icon className="w-5 h-5" />
                          <span>{opt.label}</span>
                          <span className={`text-[10px] font-normal ${selected ? "text-green-400/60" : "text-white/20"}`}>
                            {opt.desc}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {mode === "MIXED" && (
                    <div className="mt-2.5">
                      <PayModePicker
                        mode="MIXED"
                        total={parsedAmount}
                        cashAmount={cashPart}
                        label=""
                        compact
                        allowMixed={false}
                        onChange={sp => setCashPart(sp.cashAmount)}
                      />
                    </div>
                  )}
                </div>

                {/* Optional notes */}
                <div>
                  <label className="block text-xs font-semibold text-white/45 uppercase tracking-wider mb-2">
                    Notes <span className="text-white/20 font-normal normal-case tracking-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="e.g. Collected at check-out, UPI ref 12345"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder:text-white/20 text-sm focus:outline-none focus:border-green-400/50 transition-all"
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={loading}
                    className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 font-semibold text-sm transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading || parsedAmount <= 0 || isOverpay}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black font-bold text-sm transition-all shadow-lg shadow-green-500/20"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Confirm
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
