"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Equal } from "lucide-react";
import { readJson } from "@/lib/utils/fetch-json";
import { computeTotalsForPrice } from "@/lib/utils/booking-calc";

/**
 * Make the bill equal what was actually taken.
 *
 * The bill and the money can drift apart — a price discounted after the payment
 * was typed, a deposit entered in the wrong box, a rate agreed verbally and
 * never keyed in. Rather than asking staff to retype the price and keep two
 * numbers in step by hand, this sets the bill to the amount received in one tap.
 *
 * It is deliberately a tap and not automatic. A booking that has simply been
 * part-paid also has a bill above its receipts, and silently "correcting" that
 * would erase money the guest still owes. The button therefore only appears when
 * MORE has been taken than billed, which is the case that has no other honest
 * reading.
 */
export default function MatchBillButton({
  bookingId,
  billed,
  taken,
  noOfNights,
}: {
  bookingId: string;
  billed: number;
  taken: number;
  noOfNights: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // What the bill would legally become — the slabs cannot express every rupee,
  // so staff see the figure that will actually be saved before they commit.
  const preview = computeTotalsForPrice({ inclusiveTotal: taken, noOfNights });
  const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  // Offer this only when it would actually change the bill. Some amounts are
  // not reachable as a whole-rupee total under the GST slabs, so a small
  // overpayment can round straight back to the price already set — and a button
  // that does nothing is worse than no button.
  if (preview.totalAmount <= billed + 0.5) return null;

  async function match() {
    if (!confirm(
      `Charge ${inr(preview.totalAmount)} for this stay instead of ${inr(billed)}?\n\n` +
      `That is what the guest has actually paid. GST is recalculated and the owner is told.`
    )) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/hotel-admin/bookings/${bookingId}/pricing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalAmount: taken,
          reason: `Bill matched to the ${inr(taken)} actually taken`,
        }),
      });
      const d = await readJson(res);
      if (res.ok) { toast.success(d.message ?? "Bill updated"); router.refresh(); }
      else toast.error(d.error ?? "Could not update the bill");
    } finally { setLoading(false); }
  }

  return (
    <button
      onClick={match}
      disabled={loading}
      title={`Set the room total to ${inr(preview.totalAmount)}`}
      className="mt-1.5 w-full inline-flex items-center justify-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-sky-500/25 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 transition-all disabled:opacity-50"
    >
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Equal className="w-3 h-3" />}
      {loading ? "Updating…" : `Charge ${inr(preview.totalAmount)} instead`}
    </button>
  );
}
