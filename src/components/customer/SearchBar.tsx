"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Calendar, Users, Search } from "lucide-react";
import { format } from "date-fns";

interface SearchBarProps {
  variant?: "hero" | "compact";
  defaultCity?: string;
  defaultCheckIn?: string;
  defaultCheckOut?: string;
  defaultGuests?: number;
}

const fieldCls = "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder:text-white/30 text-sm focus:outline-none focus:border-amber-400/40 focus:bg-white/8 transition-all [color-scheme:dark]";
const labelCls = "text-[10px] font-bold text-white/35 uppercase tracking-widest mb-1.5 block";

export default function SearchBar({
  variant = "hero",
  defaultCity = "",
  defaultCheckIn = "",
  defaultCheckOut = "",
  defaultGuests = 2,
}: SearchBarProps) {
  const router = useRouter();
  const [city, setCity] = useState(defaultCity);
  const [checkIn, setCheckIn] = useState(defaultCheckIn);
  const [checkOut, setCheckOut] = useState(defaultCheckOut);
  const [guests, setGuests] = useState(defaultGuests);

  function handleSearch() {
    const params = new URLSearchParams();
    if (city) params.set("city", city);
    if (checkIn) params.set("checkIn", checkIn);
    if (checkOut) params.set("checkOut", checkOut);
    if (guests) params.set("guests", guests.toString());
    router.push(`/hotels?${params.toString()}`);
  }

  const today = format(new Date(), "yyyy-MM-dd");

  if (variant === "compact") {
    return (
      <div className="glass-card rounded-2xl p-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[160px]">
          <MapPin className="w-4 h-4 text-amber-400/60 shrink-0" />
          <input
            type="text"
            placeholder="City or hotel name"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="bg-transparent border-0 outline-none text-sm text-white placeholder:text-white/30 flex-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-amber-400/60 shrink-0" />
          <input
            type="date"
            className="text-sm bg-transparent text-white outline-none [color-scheme:dark]"
            min={today}
            value={checkIn}
            onChange={(e) => { setCheckIn(e.target.value); if (checkOut <= e.target.value) setCheckOut(""); }}
          />
          <span className="text-white/30">→</span>
          <input
            type="date"
            className="text-sm bg-transparent text-white outline-none [color-scheme:dark]"
            min={checkIn || today}
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-amber-400/60 shrink-0" />
          <select
            className="text-sm bg-transparent text-white outline-none [color-scheme:dark]"
            value={guests}
            onChange={(e) => setGuests(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n} className="bg-[#0D1B0E]">{n} Guest{n > 1 ? "s" : ""}</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleSearch}
          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold px-4 py-2 rounded-xl transition-all hover:scale-105 active:scale-95"
        >
          <Search className="w-3.5 h-3.5" /> Search
        </button>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-3xl p-6 w-full max-w-4xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* City */}
        <div className="md:col-span-1">
          <label className={labelCls}>Where</label>
          <div className="relative">
            <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400/60 shrink-0" />
            <input
              type="text"
              placeholder="City, area or hotel"
              className={`${fieldCls} pl-10`}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
          </div>
        </div>

        {/* Check-in */}
        <div>
          <label className={labelCls}>Check-in</label>
          <div className="relative">
            <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400/60 shrink-0 pointer-events-none" />
            <input
              type="date"
              className={`${fieldCls} pl-10`}
              min={today}
              value={checkIn}
              onChange={(e) => { setCheckIn(e.target.value); if (checkOut && checkOut <= e.target.value) setCheckOut(""); }}
            />
          </div>
        </div>

        {/* Check-out */}
        <div>
          <label className={labelCls}>Check-out</label>
          <div className="relative">
            <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400/60 shrink-0 pointer-events-none" />
            <input
              type="date"
              className={`${fieldCls} pl-10`}
              min={checkIn || today}
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
            />
          </div>
        </div>

        {/* Guests + Search */}
        <div>
          <label className={labelCls}>Guests</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Users className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400/60 shrink-0" />
              <select
                className={`${fieldCls} pl-10 appearance-none`}
                value={guests}
                onChange={(e) => setGuests(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n} className="bg-[#0D1B0E]">{n} Guest{n > 1 ? "s" : ""}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleSearch}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm px-4 py-2.5 rounded-xl transition-all hover:scale-105 active:scale-95 shadow-lg shadow-amber-500/20 shrink-0"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
