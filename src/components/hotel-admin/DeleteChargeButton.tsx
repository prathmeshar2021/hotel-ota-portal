"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Loader2 } from "lucide-react";

interface Props {
  bookingId: string;
  chargeId: string;
  chargeLabel: string;
}

export default function DeleteChargeButton({ bookingId, chargeId, chargeLabel }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm(`Remove "${chargeLabel}" from the bill?`)) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/hotel-admin/bookings/${bookingId}/charges/${chargeId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        toast.success(`${chargeLabel} removed from bill`);
        router.refresh();
      } else {
        const data = await res.json();
        toast.error(data.error ?? "Failed to remove charge");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      title="Remove charge"
      className="p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-40"
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Trash2 className="w-3.5 h-3.5" />
      )}
    </button>
  );
}
