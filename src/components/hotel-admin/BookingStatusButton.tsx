"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, LogIn, LogOut, XCircle } from "lucide-react";

interface Props {
  bookingId: string;
  currentStatus: string;
}

const ACTIONS: Record<string, { label: string; next: string; icon: React.ReactNode; cls: string } | null> = {
  CONFIRMED: {
    label: "Check Guest In",
    next: "CHECKED_IN",
    icon: <LogIn className="w-4 h-4" />,
    cls: "bg-green-500 hover:bg-green-400 text-white shadow-green-500/20",
  },
  CHECKED_IN: {
    label: "Check Guest Out",
    next: "CHECKED_OUT",
    icon: <LogOut className="w-4 h-4" />,
    cls: "bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/20",
  },
};

export default function BookingStatusButton({ bookingId, currentStatus }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const action = ACTIONS[currentStatus];

  if (!action) return null;

  async function handleAction() {
    if (!action) return;
    const confirmed = window.confirm(
      `${action.label}? This will update the booking status to ${action.next.replace("_", " ")}.`
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/hotel-admin/bookings/${bookingId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: action.next }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message ?? "Status updated");
        router.refresh();
      } else {
        toast.error(data.error ?? "Failed to update status");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleAction}
      disabled={loading}
      className={`flex items-center gap-2 font-bold px-6 py-3 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 shadow-lg ${action.cls}`}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : action.icon}
      {loading ? "Updating…" : action.label}
    </button>
  );
}

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
