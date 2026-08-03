"use client";

import { useState } from "react";
import { UserPlus, AlertCircle } from "lucide-react";
import AddCompanionModal from "./AddCompanionModal";

/**
 * Surfaces the gap between how many guests a booking is for and how many have
 * actually been registered — which is exactly what raising the guest count on a
 * checked-in stay creates. Renders nothing when everyone is accounted for.
 */
export default function AddCompanionButton({
  bookingId,
  pending,
}: {
  bookingId: string;
  pending: number;
}) {
  const [open, setOpen] = useState(false);
  if (pending <= 0) return null;

  return (
    <>
      <div className="flex items-center justify-between gap-3 bg-amber-500/8 border border-amber-500/25 rounded-xl px-4 py-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-amber-200/80 text-xs">
            {pending} guest{pending !== 1 ? "s have" : " has"} no ID details recorded yet.
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black transition-all shrink-0"
        >
          <UserPlus className="w-3.5 h-3.5" /> Add Guest Details
        </button>
      </div>

      {open && (
        <AddCompanionModal
          bookingId={bookingId}
          pending={pending}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
