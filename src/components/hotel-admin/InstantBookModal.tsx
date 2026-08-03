"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useEffect } from "react";
import { Zap, Loader2, X, User, Phone, IndianRupee, StickyNote, BedDouble } from "lucide-react";
import { getCategoryMeta } from "@/lib/utils/room-categories";
import GuestSearch, { type GuestResult } from "./GuestSearch";

interface Props {
  /** Pre-selected when opened from a room card. Omit to pick a room in-modal
   *  (how it opens from the bookings list, where there's no room context). */
  roomId?: string;
  roomNumber?: string;
  basePrice?: number;
  onClose: () => void;
}

interface AvailableRoom {
  id: string;
  roomNumber: string;
  roomType: string;
  capacity: number;
  basePrice: number;
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
  // Room-picking mode: no room was handed in, so offer whatever is free.
  const picksRoom = !roomId;
  const [rooms, setRooms] = useState<AvailableRoom[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [pickedRoom, setPickedRoom] = useState<AvailableRoom | null>(null);
  const [checkIn, setCheckIn] = useState(isoDate(0));
  const [checkOut, setCheckOut] = useState(isoDate(1));
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  // Set when a returning guest is picked from search, so the booking links to
  // that exact person rather than matching on a number they may not have.
  const [guestId, setGuestId] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  // Couples are the common case, so 2 unless the owner says otherwise.
  const [guests, setGuests] = useState(2);

  const nights = Math.max(
    0,
    Math.ceil((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000)
  );

  useEffect(() => {
    if (!picksRoom) return;
    if (nights < 1) { setRooms([]); return; }
    let cancelled = false;
    setLoadingRooms(true);
    fetch(`/api/hotel-admin/rooms/available?checkIn=${checkIn}&checkOut=${checkOut}`)
      .then(r => (r.ok ? r.json() : []))
      .then((data: AvailableRoom[]) => {
        if (cancelled) return;
        setRooms(Array.isArray(data) ? data : []);
        // Drop a selection that these dates no longer allow.
        setPickedRoom(prev => (prev && data.some(r => r.id === prev.id) ? prev : null));
      })
      .catch(() => !cancelled && setRooms([]))
      .finally(() => !cancelled && setLoadingRooms(false));
    return () => { cancelled = true; };
  }, [picksRoom, checkIn, checkOut, nights]);

  const effectiveRoomId = roomId ?? pickedRoom?.id;
  const effectiveRoomNumber = roomNumber ?? pickedRoom?.roomNumber;
  const effectiveBase = basePrice ?? pickedRoom?.basePrice ?? 0;

  async function submit() {
    if (!effectiveRoomId) { toast.error("Pick a room first"); return; }
    if (nights < 1) { toast.error("Check-out must be after check-in"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/hotel-admin/bookings/instant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: effectiveRoomId,
          checkInDate: checkIn,
          checkOutDate: checkOut,
          guestId: guestId ?? undefined,
          guestName: guestName.trim() || undefined,
          guestPhone: guestPhone.trim() || undefined,
          noOfPersons: guests,
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
              <p className="text-white/35 text-xs">
                {effectiveRoomNumber ? `Room ${effectiveRoomNumber} · ` : ""}everything below is optional
              </p>
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

        {picksRoom && (
          <div className="mb-4">
            <label className={labelCls}>
              Room {loadingRooms && <Loader2 className="inline w-3 h-3 animate-spin ml-1" />}
            </label>
            {nights < 1 ? (
              <p className="text-xs text-white/30">Pick valid dates to see free rooms.</p>
            ) : rooms.length === 0 && !loadingRooms ? (
              <p className="text-xs text-amber-400/70">No rooms free for these dates.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {rooms.map(r => (
                  <button type="button" key={r.id} onClick={() => setPickedRoom(r)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
                      pickedRoom?.id === r.id
                        ? "bg-blue-500 text-white border-blue-400"
                        : "bg-white/5 border-white/10 text-white/55 hover:text-white/85 hover:border-white/20"
                    }`}
                    title={getCategoryMeta(r.roomType as never)?.displayName ?? r.roomType}>
                    <BedDouble className="inline w-3 h-3 mr-1" />{r.roomNumber}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="space-y-3">
          {/* Returning guest? Pull their details in rather than retyping. A
              first-timer is simply typed straight into the fields below. */}
          <GuestSearch
            placeholder="Search existing guest by name, phone or ID…"
            onSelect={(g: GuestResult) => {
              setGuestId(g.id);
              setGuestName(g.name);
              if (g.phone) setGuestPhone(g.phone);
              toast.success(`Selected ${g.name}`);
            }}
          />

          <div>
            <label className={labelCls}>
              Guest Name
              {guestId && (
                <span className="ml-2 normal-case font-normal text-green-400/70">· existing guest</span>
              )}
            </label>
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
                onChange={e => { setGuestId(null); setGuestPhone(e.target.value.replace(/\D/g, "").slice(0, 10)); }}
                placeholder="Skip if not asked" className={`${inputCls} pl-10`} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Guests</label>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5, 6].map(n => (
                <button type="button" key={n} onClick={() => setGuests(n)}
                  className={`flex-1 h-10 rounded-lg text-xs font-bold border transition-all ${
                    guests === n
                      ? "bg-blue-500 text-white border-blue-400"
                      : "bg-white/5 border-white/10 text-white/50 hover:text-white/80"
                  }`}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>Price agreed (₹)</label>
            <div className="relative">
              <IndianRupee className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
              <input value={price} type="number" min={0}
                onChange={e => setPrice(e.target.value)}
                placeholder={effectiveBase ? `Standard: ₹${Math.round(effectiveBase * 1.05 * Math.max(1, nights)).toLocaleString("en-IN")}` : "Standard tariff"}
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
          Blocks {effectiveRoomNumber ? `Room ${effectiveRoomNumber}` : "the room"} for {nights} night{nights !== 1 ? "s" : ""} straight away. Name and mobile
          can be corrected at check-in, and the full guest details are captured there as usual.
        </p>

        <div className="flex gap-3 mt-5">
          <button onClick={() => !loading && onClose()} disabled={loading}
            className="flex-1 py-3 rounded-xl border border-white/10 text-white/50 hover:text-white hover:border-white/20 text-sm font-semibold transition-all disabled:opacity-50">
            Cancel
          </button>
          <button onClick={submit} disabled={loading || nights < 1 || !effectiveRoomId}
            className="flex-1 py-3 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Blocking…</> : <><Zap className="w-4 h-4" /> Block Room</>}
          </button>
        </div>
      </div>
    </div>
  );
}
