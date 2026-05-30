"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X, Plus, Loader2, Receipt } from "lucide-react";

const CHARGE_TYPES = [
  { value: "FOOD",         label: "Food",         emoji: "🍽️" },
  { value: "LAUNDRY",      label: "Laundry",      emoji: "🧺" },
  { value: "EXTRA_BED",    label: "Extra Bed",    emoji: "🛏️" },
  { value: "PARKING",      label: "Parking",      emoji: "🚗" },
  { value: "TRANSPORT",    label: "Transport",    emoji: "🛺" },
  { value: "ROOM_SERVICE", label: "Room Service", emoji: "🛎️" },
  { value: "MINIBAR",      label: "Minibar",      emoji: "🧃" },
  { value: "DAMAGE",       label: "Damage",       emoji: "⚠️" },
  { value: "OTHER",        label: "Other",        emoji: "📋" },
] as const;

interface Props {
  bookingId: string;
  disabled?: boolean;
}

export default function AddChargeModal({ bookingId, disabled }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [chargeType, setChargeType] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");

  const qty = parseFloat(quantity) || 0;
  const price = parseFloat(unitPrice) || 0;
  const total = qty * price;

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setChargeType("");
      setDescription("");
      setQuantity("1");
      setUnitPrice("");
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!chargeType) { toast.error("Select a charge type"); return; }
    if (qty <= 0)    { toast.error("Quantity must be greater than 0"); return; }
    if (price <= 0)  { toast.error("Unit price must be greater than 0"); return; }

    setLoading(true);
    try {
      const res = await fetch(`/api/hotel-admin/bookings/${bookingId}/charges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chargeType,
          description: description.trim() || undefined,
          quantity: qty,
          unitPrice: price,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to add charge");
        return;
      }
      toast.success(`${CHARGE_TYPES.find(t => t.value === chargeType)?.label ?? "Charge"} — ₹${total.toLocaleString("en-IN")} added to bill`);
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Trigger */}
      <button
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="flex items-center gap-2 bg-white/6 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white/55 hover:text-white/80 text-sm font-semibold px-3.5 py-2 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Plus className="w-3.5 h-3.5" />
        Add Charge
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => !loading && setOpen(false)}
          />

          <div className="relative z-10 w-full max-w-md bg-[#0A1A0D] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center">
                  <Receipt className="w-4 h-4 text-amber-400" />
                </div>
                <h2 className="font-bold text-white text-sm">Add Charge to Bill</h2>
              </div>
              <button
                onClick={() => !loading && setOpen(false)}
                disabled={loading}
                className="text-white/30 hover:text-white/70 p-1.5 rounded-lg hover:bg-white/8 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">

              {/* Charge type grid */}
              <div>
                <label className="block text-xs font-semibold text-white/45 uppercase tracking-wider mb-3">
                  Charge Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {CHARGE_TYPES.map(t => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setChargeType(t.value)}
                      className={`flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border text-xs font-semibold transition-all ${
                        chargeType === t.value
                          ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                          : "bg-white/4 border-white/8 text-white/40 hover:bg-white/8 hover:text-white/60"
                      }`}
                    >
                      <span className="text-lg leading-none">{t.emoji}</span>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-white/45 uppercase tracking-wider mb-2">
                  Description <span className="text-white/20 font-normal normal-case tracking-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="e.g. Butter chicken + naan × 2"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder:text-white/20 text-sm focus:outline-none focus:border-amber-400/50 transition-all"
                />
              </div>

              {/* Quantity × Unit Price → Total */}
              <div>
                <label className="block text-xs font-semibold text-white/45 uppercase tracking-wider mb-2">
                  Amount
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <p className="text-[10px] text-white/30 mb-1">Qty</p>
                    <input
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={quantity}
                      onChange={e => setQuantity(e.target.value)}
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm text-center focus:outline-none focus:border-amber-400/50 transition-all"
                    />
                  </div>
                  <span className="text-white/20 text-lg mt-4">×</span>
                  <div className="flex-1">
                    <p className="text-[10px] text-white/30 mb-1">Unit Price (₹)</p>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={unitPrice}
                      onChange={e => setUnitPrice(e.target.value)}
                      placeholder="0"
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm text-center focus:outline-none focus:border-amber-400/50 transition-all"
                    />
                  </div>
                  <span className="text-white/20 text-lg mt-4">=</span>
                  <div className="flex-1">
                    <p className="text-[10px] text-white/30 mb-1">Total</p>
                    <div className={`w-full rounded-xl px-3 py-2.5 text-sm text-center font-bold border ${
                      total > 0
                        ? "bg-amber-500/10 border-amber-500/25 text-amber-300"
                        : "bg-white/3 border-white/8 text-white/25"
                    }`}>
                      ₹{total > 0 ? total.toLocaleString("en-IN") : "—"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Info note */}
              <p className="text-xs text-white/25 bg-white/3 rounded-xl px-4 py-2.5 leading-relaxed">
                This charge will be added to the guest&apos;s bill. Collect the outstanding balance at checkout using the <strong className="text-white/40">Collect Payment</strong> button.
              </p>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => !loading && setOpen(false)}
                  disabled={loading}
                  className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 font-semibold text-sm transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !chargeType || total <= 0}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold text-sm transition-all shadow-lg shadow-amber-500/20"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Add to Bill
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
