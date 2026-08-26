"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Undo2, Loader2 } from "lucide-react";

/**
 * Put a deleted booking back. Super admin only — it undoes a decision the desk
 * made, and restoring a stay whose dates are still live puts its room back into
 * use, so it's worth confirming rather than being a one-tap action.
 */
export default function RestoreBookingButton({
  bookingId,
  bookingRef,
  amountPaid,
}: {
  bookingId: string;
  bookingRef: string;
  amountPaid: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function restore() {
    const money =
      amountPaid > 0
        ? `\n\n₹${amountPaid.toLocaleString("en-IN")} will go back into your revenue figures.`
        : "";
    if (!window.confirm(`Restore ${bookingRef}?\n\nIt will reappear in the bookings list and hold its room again.${money}`))
      return;

    setLoading(true);
    try {
      const res = await fetch(`/api/hotel-admin/bookings/${bookingId}/delete`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message ?? `${bookingRef} restored`);
        router.refresh();
      } else {
        toast.error(data.error ?? "Failed to restore booking");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={restore}
      disabled={loading}
      className="flex items-center gap-1.5 bg-green-500/10 hover:bg-green-500/20 border border-green-500/25 hover:border-green-500/40 text-green-300 hover:text-green-200 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
      {loading ? "Restoring…" : "Restore"}
    </button>
  );
}
