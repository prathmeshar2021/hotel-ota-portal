"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar, Users, Search, Loader2 } from "lucide-react";

interface Props {
  hotelSlug: string;
  defaultCheckIn?: string;
  defaultCheckOut?: string;
  defaultGuests?: number;
}

const dateCls =
  "w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-400/40 transition-all [color-scheme:dark]";

export default function HotelDateSearch({
  hotelSlug,
  defaultCheckIn = "",
  defaultCheckOut = "",
  defaultGuests = 2,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [checkIn, setCheckIn] = useState(defaultCheckIn);
  const [checkOut, setCheckOut] = useState(defaultCheckOut);
  const [guests, setGuests] = useState(defaultGuests);
  const [loading, setLoading] = useState(false);

  // Reset loading once navigation completes (URL search params update)
  useEffect(() => {
    setLoading(false);
  }, [searchParams]);

  const today = new Date().toISOString().split("T")[0];
  const hasFilter = !!(checkIn && checkOut);

  function handleSearch() {
    if (!checkIn || !checkOut) return;
    setLoading(true);
    const params = new URLSearchParams({ checkIn, checkOut, guests: String(guests) });
    router.push(`/hotel/${hotelSlug}?${params.toString()}`);
  }

  function clearDates() {
    setCheckIn(""); setCheckOut("");
    setLoading(true);
    router.push(`/hotel/${hotelSlug}`);
  }

  return (
    <div className="space-y-3">
      {/* Check-in */}
      <div>
        <label className="block text-xs font-semibold text-white/35 uppercase tracking-wider mb-1.5">
          Check-in
        </label>
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25 pointer-events-none" />
          <input
            type="date"
            value={checkIn}
            min={today}
            onChange={(e) => {
              setCheckIn(e.target.value);
              if (checkOut && checkOut <= e.target.value) setCheckOut("");
            }}
            className={`${dateCls} pl-9`}
          />
        </div>
      </div>

      {/* Check-out */}
      <div>
        <label className="block text-xs font-semibold text-white/35 uppercase tracking-wider mb-1.5">
          Check-out
        </label>
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25 pointer-events-none" />
          <input
            type="date"
            value={checkOut}
            min={checkIn || today}
            onChange={(e) => setCheckOut(e.target.value)}
            className={`${dateCls} pl-9`}
          />
        </div>
      </div>

      {/* Guests */}
      <div>
        <label className="block text-xs font-semibold text-white/35 uppercase tracking-wider mb-1.5">
          Guests
        </label>
        <div className="relative">
          <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25 pointer-events-none" />
          <select
            value={guests}
            onChange={(e) => setGuests(Number(e.target.value))}
            className={`${dateCls} pl-9 appearance-none cursor-pointer`}
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n} className="bg-[#0D1B0E] text-white">
                {n} Guest{n > 1 ? "s" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={handleSearch}
        disabled={!checkIn || !checkOut || loading}
        className="w-full flex items-center justify-center gap-2 text-sm font-bold py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <><Search className="w-4 h-4" /> Check Availability</>
        )}
      </button>

      {/* Clear filter */}
      {hasFilter && !loading && (
        <button
          onClick={clearDates}
          className="w-full text-xs text-white/30 hover:text-white/60 transition-colors py-1"
        >
          Clear dates · show all rooms
        </button>
      )}

      {/* Hint when no dates */}
      {!hasFilter && (
        <p className="text-xs text-white/25 text-center leading-relaxed">
          Select dates to see only rooms available for your stay
        </p>
      )}
    </div>
  );
}
