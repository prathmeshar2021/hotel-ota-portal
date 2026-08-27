"use client";

import { useState } from "react";
import { readJson } from "@/lib/utils/fetch-json";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Loader2, X, AlertTriangle } from "lucide-react";

/**
 * Delete a booking from the panel.
 *
 * The booking is archived rather than erased — its payments and any tax invoice
 * have to be retained — but from the desk's point of view it is gone: it leaves
 * every list, frees its room, and stops counting in the accounts. The owner is
 * told on WhatsApp and by email each time.
 *
 * Deliberately deliberate: a reason is required, and a booking with money on it
 * has to have the amount acknowledged before the button will fire.
 */

/** Why a booking usually gets removed — one tap instead of typing. */
const REASONS = [
  "Guest never turned up",
  "Test / duplicate entry",
  "Entered by mistake",
  "Booked on the wrong dates",
];

/** The common case, pre-selected so the usual delete is one tap. */
const DEFAULT_REASON = REASONS[0];

export default function DeleteBookingButton({
  bookingId,
  bookingRef,
  guestName,
  amountPaid = 0,
}: {
  bookingId: string;
  bookingRef: string;
  guestName: string;
  amountPaid?: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState(DEFAULT_REASON);
  const [moneyAcknowledged, setMoneyAcknowledged] = useState(false);

  const blocked = !reason.trim() || (amountPaid > 0 && !moneyAcknowledged);

  async function doDelete() {
    setLoading(true);
    try {
      const res = await fetch(`/api/hotel-admin/bookings/${bookingId}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const data = await readJson(res);
      if (res.ok) {
        // Offered right here, because the moment staff realise it was the wrong
        // booking is the moment the toast is still on screen.
        toast.success(data.message ?? `${bookingRef} deleted`, {
          duration: 12000,
          action: data.actionId
            ? {
                label: "Undo",
                onClick: async () => {
                  const r = await fetch(`/api/hotel-admin/activity/${data.actionId}/undo`, { method: "POST" });
                  const d = await readJson(r);
                  if (r.ok) { toast.success(d.message ?? `${bookingRef} restored`); router.push(`/hotel-admin/bookings/${bookingId}`); }
                  else toast.error(d.error ?? "Could not undo");
                },
              }
            : undefined,
        });
        setOpen(false);
        router.push("/hotel-admin/bookings");
        router.refresh();
      } else {
        toast.error(data.error ?? "Failed to delete booking");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => { setReason(DEFAULT_REASON); setMoneyAcknowledged(false); setOpen(true); }}
        className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 hover:border-red-500/40 text-red-400 hover:text-red-300 text-sm font-semibold px-3.5 py-2 rounded-xl transition-all"
      >
        <Trash2 className="w-4 h-4" />
        Delete
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !loading && setOpen(false)} />
          <div className="relative bg-[#0d1a0e] border border-white/10 rounded-3xl p-6 w-full max-w-md shadow-2xl">

            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h2 className="font-bold text-white">Delete Booking</h2>
                  <p className="text-white/35 text-xs font-mono">{bookingRef}</p>
                </div>
              </div>
              <button onClick={() => !loading && setOpen(false)} className="text-white/30 hover:text-white/60 p-1 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-white/60 text-sm mb-4 leading-relaxed">
              <strong className="text-white/85">{guestName}</strong>&rsquo;s booking will be removed
              from the panel. The room is freed straight away and it stops counting towards your
              accounts. The owner is notified.
            </p>

            {amountPaid > 0 && (
              <div className="flex items-start gap-2.5 bg-red-500/12 border border-red-500/30 rounded-2xl px-4 py-3 mb-4">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-200 text-sm font-bold">
                    ₹{amountPaid.toLocaleString("en-IN")} has been paid on this booking
                  </p>
                  <p className="text-red-200/70 text-xs mt-0.5 leading-relaxed">
                    Deleting removes it from your revenue. If the guest is owed it back, refund
                    them first — deleting does not refund anything.
                  </p>
                </div>
              </div>
            )}

            <p className="text-xs text-white/40 uppercase tracking-wider font-semibold mb-2.5">
              Reason
            </p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {REASONS.map(r => (
                <button key={r} type="button" onClick={() => setReason(r)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
                    reason === r
                      ? "bg-red-500 text-white border-red-400"
                      : "bg-white/5 border-white/10 text-white/55 hover:text-white/85 hover:border-white/20"
                  }`}>
                  {r}
                </button>
              ))}
            </div>
            <input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Why is this being deleted?"
              maxLength={300}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-red-400/40 transition-all mb-4"
            />

            {amountPaid > 0 && (
              <label className="flex items-start gap-2.5 bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-3 mb-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={moneyAcknowledged}
                  onChange={e => setMoneyAcknowledged(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-red-500 shrink-0"
                />
                <span className="text-white/70 text-xs leading-relaxed">
                  I understand ₹{amountPaid.toLocaleString("en-IN")} will come out of the
                  revenue figures, and that any refund has to be handled separately.
                </span>
              </label>
            )}

            <div className="flex gap-2.5">
              <button onClick={() => !loading && setOpen(false)} disabled={loading}
                className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-white/60 font-semibold text-sm hover:text-white/85 hover:border-white/20 transition-all disabled:opacity-50">
                Keep it
              </button>
              <button onClick={doDelete} disabled={loading || blocked}
                title={blocked ? "Give a reason first" : undefined}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-500 hover:bg-red-400 text-white font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {loading ? "Deleting…" : "Delete Booking"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
