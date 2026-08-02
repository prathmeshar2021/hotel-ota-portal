"use client";

import { useState } from "react";
import { Zap } from "lucide-react";
import InstantBookModal from "./InstantBookModal";

/**
 * Opens Instant Book from a screen with no room context (the bookings list),
 * so the modal offers whichever rooms are free for the chosen dates.
 */
export default function InstantBookButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-300 hover:text-blue-200 font-semibold px-4 py-2.5 rounded-xl text-sm transition-all shrink-0"
      >
        <Zap className="w-4 h-4" /> Instant Book
      </button>
      {open && <InstantBookModal onClose={() => setOpen(false)} />}
    </>
  );
}
