"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DoorOpen, Loader2 } from "lucide-react";

/**
 * Final, gated check-in step. The server refuses the CONFIRMED → CHECKED_IN
 * transition unless a room is assigned and consent is confirmed, returning a
 * 409 with an actionable message that we surface to the staff.
 */
export default function CompleteCheckinButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function complete() {
    setLoading(true);
    try {
      const res = await fetch(`/api/hotel-admin/bookings/${bookingId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CHECKED_IN" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not complete check-in");
      toast.success(data.message ?? "Guest checked in successfully");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not complete check-in");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={complete}
      disabled={loading}
      className="flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white transition-all disabled:opacity-50"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <DoorOpen className="w-4 h-4" />}
      Complete Check-In
    </button>
  );
}
