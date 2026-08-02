"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Zap, Loader2, X, User, Phone, IndianRupee, StickyNote } from "lucide-react";

interface Props {
  roomId: string;
  roomNumber: string;
  basePrice: number;
  onClose: () => void;
}

const inputCls =
  "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-blue-400/50 focus:bg-white/8 transition-all";
const labelCls = "block text-[11px] font-semibold text-white/45 uppercase tracking-wider mb-1.5";

function isoDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split("T")[0];
}

/**
 * One-screen booking for a call the owner is already on. Everything about the
 * guest is optional — the point is to block the room now and capture the rest
 * at check-in, rather than keeping the caller waiting through a full form.
 */
export default function InstantBookModal({ roomId, roomNumber, basePrice, onClose }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [checkIn, setCheckIn] = useState(isoDate(0));
  const [checkOut, setCheckOut] = useState(isoDate(1));
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");

  const nights = Math.max(
    0,
    Math.ceil((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000)
  );

  async function submit() {
    if (nights < 1) { toast.error("Check-out must be after check-in"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/hotel-admin/bookings/instant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          checkInDate: checkIn,
          checkOutDate: checkOut,
          guestName: guestName.trim() || undefined,
          guestPhone: guestPhone.trim() || undefined,
          price: price.trim() ? Number(price) : undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Could not block the room"); return; }
      toast.success(data.message ?? "Room blocked");
      onClose();
      router.refresh();
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !loading && onClose()} />
      <div className="relative bg-[#0d1a0e] border border-white/10 rounded-3xl p-6 w-full max-w-md shadow-2xl max-h-[92vh] overflow-y-auto">

        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="font-bold text-white">Instant Book</h2>
              <p className="text-white/35 text-xs">Room {roomNumber} · everything below is optional</p>
            </div>
          </div>
          <button onClick={() => !loading && onClose()} className="text-white/30 hover:text-white/60 p-1 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Dates — the only thing actually needed to hold a room */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className={labelCls}>Check-in</label>
            <input type="date" value={checkIn} onChange={e => setCheckIn(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Check-out</label>
            <input type="date" value={checkOut} min={checkIn} onChange={e => setCheckOut(e.target.value)} className={inputCls} />
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className={labelCls}>Guest Name</label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
              <input value={guestName} onChange={e => setGuestName(e.target.value)}
                placeholder="Skip if not asked" className={`${inputCls} pl-10`} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Mobile Number</label>
            <div className="relative">
              <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
              <input value={guestPhone} type="tel" inputMode="numeric"
                onChange={e => setGuestPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="Skip if not asked" className={`${inputCls} pl-10`} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Price agreed (₹)</label>
            <div className="relative">
              <IndianRupee className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
              <input value={price} type="number" min={0}
                onChange={e => setPrice(e.target.value)}
                placeholder={`Standard: ₹${Math.round(basePrice * 1.05 * Math.max(1, nights)).toLocaleString("en-IN")}`}
                className={`${inputCls} pl-10`} />
            </div>
            <p className="text-[11px] text-white/25 mt-1.5">
              Total for the stay, GST included. Leave blank to use the standard tariff.
            </p>
          </div>
          <div>
            <label className={labelCls}>Notes</label>
            <div className="relative">
              <StickyNote className="absolute left-3.5 top-3 w-4 h-4 text-white/25" />
              <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="e.g. arriving late, extra mattress"
                className={`${inputCls} pl-10 resize-none`} />
            </div>
          </div>
        </div>

        <p className="text-[11px] text-white/30 mt-4 leading-relaxed">
          Blocks Room {roomNumber} for {nights} night{nights !== 1 ? "s" : ""} straight away. Name and mobile
          can be corrected at check-in, and the full guest details are captured there as usual.
        </p>

        <div className="flex gap-3 mt-5">
          <button onClick={() => !loading && onClose()} disabled={loading}
            className="flex-1 py-3 rounded-xl border border-white/10 text-white/50 hover:text-white hover:border-white/20 text-sm font-semibold transition-all disabled:opacity-50">
            Cancel
          </button>
          <button onClick={submit} disabled={loading || nights < 1}
            className="flex-1 py-3 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Blocking…</> : <><Zap className="w-4 h-4" /> Block Room</>}
          </button>
        </div>
      </div>
    </div>
  );
}
