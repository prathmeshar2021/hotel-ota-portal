"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Image from "next/image";
import {
  Search, User, Phone, Mail, CreditCard, ChevronRight, ChevronLeft,
  Check, Loader2, BedDouble, Calendar, Users, Banknote, Car,
  MapPin, X, ArrowRight, UserPlus, UserCheck,
} from "lucide-react";
import { computeTotals } from "@/lib/utils/booking-calc";
import IdPhotoUpload from "@/components/hotel-admin/IdPhotoUpload";

// ── Types ──────────────────────────────────────────────────────────────────────

interface AvailableRoom {
  id: string; roomNumber: string; roomType: string;
  capacity: number; basePrice: number; description: string | null; images: string[];
}

interface GuestResult {
  id: string; name: string; phone: string; email?: string | null;
  idType?: string | null; idNumber?: string | null;
  _count: { bookings: number };
}

const ROOM_LABELS: Record<string, string> = {
  LUXURY_COTTAGE: "Luxury Cottage", AC_ROOM: "AC Room", NON_AC_ROOM: "Non-AC Room",
};
const ROOM_ACCENT: Record<string, string> = {
  LUXURY_COTTAGE: "#F59E0B", AC_ROOM: "#60A5FA", NON_AC_ROOM: "#4ADE80",
};
const ROOM_FALLBACK: Record<string, string> = {
  LUXURY_COTTAGE: "/images/lc-interior.jpg",
  AC_ROOM: "/images/ac-interior.jpg",
  NON_AC_ROOM: "/images/nonac-interior.jpg",
};
const ID_TYPES = [
  { value: "AADHAR", label: "Aadhar Card" },
  { value: "DRIVING_LICENSE", label: "Driving License" },
  { value: "PASSPORT", label: "Passport" },
  { value: "VOTER_ID", label: "Voter ID" },
  { value: "OTHER", label: "Other ID" },
];

const inputCls = "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-blue-400/40 focus:bg-white/8 transition-all";
const labelCls = "block text-xs font-semibold text-white/45 uppercase tracking-wider mb-2";
const selectCls = "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-400/40 transition-all appearance-none cursor-pointer";

// ── Step indicator ─────────────────────────────────────────────────────────────

function StepBadge({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
      done ? "bg-green-500 text-white" : active ? "bg-blue-500 text-white" : "bg-white/8 text-white/30"
    }`}>
      {done ? <Check className="w-4 h-4" /> : n}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function NewBookingForm({ hotelId }: { hotelId: string }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);

  // Step 1
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [noOfPersons, setNoOfPersons] = useState(2);
  const [rooms, setRooms] = useState<AvailableRoom[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<AvailableRoom | null>(null);

  // Step 2
  const [guestPhone, setGuestPhone] = useState("");
  const [searching, setSearching] = useState(false);
  const [foundGuest, setFoundGuest] = useState<GuestResult | null>(null);
  const [guestNotFound, setGuestNotFound] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState<GuestResult | null>(null);
  // New guest form
  const [newGuestName, setNewGuestName] = useState("");
  const [newGuestEmail, setNewGuestEmail] = useState("");
  const [newGuestIdType, setNewGuestIdType] = useState("AADHAR");
  const [newGuestIdNumber, setNewGuestIdNumber] = useState("");
  const [newGuestIdFrontUrl, setNewGuestIdFrontUrl] = useState("");
  const [newGuestIdBackUrl, setNewGuestIdBackUrl] = useState("");
  const [comingFrom, setComingFrom] = useState("");
  const [purpose, setPurpose] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");

  // Step 3
  const [source, setSource] = useState<"WALK_IN" | "PHONE" | "OTHER">("WALK_IN");
  const [paymentMode, setPaymentMode] = useState<"CASH" | "ONLINE" | "MIXED">("CASH");
  const [cashPaid, setCashPaid] = useState("");
  const [onlinePaid, setOnlinePaid] = useState("");
  const [deposit, setDeposit] = useState("0");
  const [specialRequests, setSpecialRequests] = useState("");

  // ── Computed ──
  const nights = checkIn && checkOut
    ? Math.max(0, Math.ceil((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000))
    : 0;

  const totals = selectedRoom && nights > 0
    ? computeTotals({ roomRentPerNight: selectedRoom.basePrice, noOfNights: nights, refundableDeposit: Number(deposit) || 0 })
    : null;

  const totalPaid = (Number(cashPaid) || 0) + (Number(onlinePaid) || 0);
  const balanceDue = totals ? Math.max(0, totals.totalAmount - totalPaid) : 0;

  // ── Step 1 handlers ──
  async function findRooms() {
    if (!checkIn || !checkOut || nights < 1) { toast.error("Enter valid dates"); return; }
    setLoadingRooms(true);
    setSelectedRoom(null);
    setRooms([]);
    try {
      const res = await fetch(`/api/hotel-admin/rooms/available?checkIn=${checkIn}&checkOut=${checkOut}`);
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed to load rooms"); return; }
      setRooms(data);
      if (data.length === 0) toast.info("No rooms available for these dates");
    } finally { setLoadingRooms(false); }
  }

  // ── Step 2 handlers ──
  async function searchGuest() {
    const phone = guestPhone.replace(/\D/g, "");
    if (phone.length < 10) { toast.error("Enter a valid 10-digit phone number"); return; }
    setSearching(true);
    setFoundGuest(null);
    setGuestNotFound(false);
    setSelectedGuest(null);
    try {
      const res = await fetch(`/api/hotel-admin/guests?q=${phone}`);
      const data: GuestResult[] = await res.json();
      const match = data.find(g => g.phone === phone);
      if (match) {
        setFoundGuest(match);
        setSelectedGuest(match);
      } else {
        setGuestNotFound(true);
      }
    } finally { setSearching(false); }
  }

  function clearGuest() {
    setFoundGuest(null);
    setGuestNotFound(false);
    setSelectedGuest(null);
    setGuestPhone("");
    setNewGuestName("");
    setNewGuestEmail("");
    setNewGuestIdNumber("");
    setNewGuestIdFrontUrl("");
    setNewGuestIdBackUrl("");
  }

  // ── Submit ──
  async function handleSubmit() {
    const guestName = selectedGuest?.name ?? newGuestName;
    const phone = guestPhone.replace(/\D/g, "");

    if (!guestName || phone.length !== 10) { toast.error("Guest details incomplete"); return; }
    if (!selectedRoom || !checkIn || !checkOut || nights < 1) { toast.error("Room/dates missing"); return; }

    if (paymentMode === "CASH" && !cashPaid) { toast.error("Enter cash amount paid"); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/hotel-admin/bookings/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: selectedRoom.id,
          checkInDate: checkIn,
          checkOutDate: checkOut,
          noOfPersons,
          guestId: selectedGuest?.id,
          guestName,
          guestPhone: phone,
          guestEmail: selectedGuest?.email || newGuestEmail || undefined,
          guestIdType: selectedGuest?.idType || newGuestIdType,
          guestIdNumber: selectedGuest?.idNumber || newGuestIdNumber || undefined,
          guestIdFrontUrl: newGuestIdFrontUrl || undefined,
          guestIdBackUrl: newGuestIdBackUrl || undefined,
          comingFrom: comingFrom || undefined,
          purpose: purpose || undefined,
          vehicleNo: vehicleNo || undefined,
          source,
          paymentMode,
          cashPaid: Number(cashPaid) || 0,
          onlinePaid: Number(onlinePaid) || 0,
          refundableDeposit: Number(deposit) || 0,
          specialRequests: specialRequests || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Booking failed"); return; }
      toast.success(`Booking ${data.bookingRef} created!`);
      router.push(`/hotel-admin/bookings/${data.bookingId}`);
    } finally { setSubmitting(false); }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="max-w-4xl">
      {/* Step indicator */}
      <div className="flex items-center gap-3 mb-8">
        {[
          { n: 1, label: "Dates & Room" },
          { n: 2, label: "Guest" },
          { n: 3, label: "Payment" },
        ].map(({ n, label }, i) => (
          <div key={n} className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <StepBadge n={n} active={step === n} done={step > n} />
              <span className={`text-sm font-medium hidden sm:block ${step === n ? "text-white" : step > n ? "text-green-400" : "text-white/30"}`}>
                {label}
              </span>
            </div>
            {i < 2 && <ChevronRight className="w-4 h-4 text-white/15 shrink-0" />}
          </div>
        ))}
      </div>

      {/* ── STEP 1: Dates & Room ── */}
      {step === 1 && (
        <div className="space-y-5">
          <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
            <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-400" /> Stay Dates
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Check-in Date</label>
                <input type="date" min={today} value={checkIn}
                  onChange={e => { setCheckIn(e.target.value); setRooms([]); setSelectedRoom(null); }}
                  className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Check-out Date</label>
                <input type="date" min={checkIn || today} value={checkOut}
                  onChange={e => { setCheckOut(e.target.value); setRooms([]); setSelectedRoom(null); }}
                  className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Guests</label>
                <select value={noOfPersons} onChange={e => setNoOfPersons(Number(e.target.value))} className={selectCls}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <option key={n} value={n} className="bg-[#0D1B0E]">{n} Guest{n > 1 ? "s" : ""}</option>
                  ))}
                </select>
              </div>
            </div>
            {nights > 0 && (
              <p className="text-white/40 text-xs mt-3 flex items-center gap-1.5">
                <Calendar className="w-3 h-3" /> {nights} night{nights > 1 ? "s" : ""}
              </p>
            )}
            <button onClick={findRooms} disabled={!checkIn || !checkOut || nights < 1 || loadingRooms}
              className="mt-4 flex items-center gap-2 bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-all">
              {loadingRooms ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {loadingRooms ? "Searching…" : "Find Available Rooms"}
            </button>
          </div>

          {/* Room list */}
          {rooms.length > 0 && (
            <div className="space-y-3">
              <p className="text-white/40 text-xs uppercase tracking-wider font-semibold">
                {rooms.length} room{rooms.length !== 1 ? "s" : ""} available
              </p>
              {rooms.map(room => {
                const accent = ROOM_ACCENT[room.roomType] ?? "#F59E0B";
                const img = room.images[0] ?? ROOM_FALLBACK[room.roomType];
                const isSelected = selectedRoom?.id === room.id;
                return (
                  <button key={room.id} onClick={() => setSelectedRoom(isSelected ? null : room)}
                    className={`w-full text-left flex gap-4 rounded-2xl p-4 border transition-all ${
                      isSelected ? "border-blue-500/50 bg-blue-500/8" : "border-white/8 bg-white/3 hover:border-white/20 hover:bg-white/5"
                    }`}>
                    <div className="relative w-24 h-20 rounded-xl overflow-hidden shrink-0">
                      <Image src={img} alt={room.roomNumber} fill className="object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-bold" style={{ color: accent }}>
                          {ROOM_LABELS[room.roomType]}
                        </span>
                        <span className="text-xs text-white/40">#{room.roomNumber}</span>
                        {isSelected && <Check className="w-4 h-4 text-blue-400 ml-auto" />}
                      </div>
                      <p className="text-white/35 text-xs mb-2 flex items-center gap-1">
                        <Users className="w-3 h-3" /> Up to {room.capacity} guests
                      </p>
                      {room.description && <p className="text-white/25 text-xs line-clamp-1">{room.description}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-lg" style={{ color: accent }}>₹{room.basePrice.toLocaleString("en-IN")}</p>
                      <p className="text-white/30 text-xs">per night</p>
                      {nights > 0 && (
                        <p className="text-white/50 text-xs font-semibold mt-1">
                          ₹{(room.basePrice * nights).toLocaleString("en-IN")} total
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex justify-end">
            <button onClick={() => setStep(2)} disabled={!selectedRoom}
              className="flex items-center gap-2 bg-blue-500 hover:bg-blue-400 disabled:opacity-40 text-white font-bold px-6 py-3 rounded-xl transition-all">
              Next: Guest Details <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Guest ── */}
      {step === 2 && (
        <div className="space-y-5">
          {/* Search by phone */}
          <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
            <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
              <Search className="w-4 h-4 text-blue-400" /> Search Existing Guest
            </h2>
            <div className="flex gap-2">
              <div className="flex flex-1">
                <span className="flex items-center gap-1.5 px-3 bg-white/5 border border-white/10 border-r-0 rounded-l-xl text-white/35 text-sm shrink-0">
                  <Phone className="w-3.5 h-3.5" /> +91
                </span>
                <input type="tel" placeholder="Enter phone number"
                  value={guestPhone}
                  onChange={e => { setGuestPhone(e.target.value.replace(/\D/g, "").slice(0, 10)); clearGuest(); }}
                  className="flex-1 bg-white/5 border border-white/10 rounded-r-xl px-4 py-3 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-blue-400/40 transition-all" />
              </div>
              <button onClick={searchGuest} disabled={searching || guestPhone.replace(/\D/g, "").length < 10}
                className="flex items-center gap-2 bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white font-semibold px-4 py-3 rounded-xl text-sm transition-all shrink-0">
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Search
              </button>
            </div>

            {/* Found existing guest */}
            {foundGuest && (
              <div className="mt-4 bg-green-500/8 border border-green-500/20 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                      <UserCheck className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-white">{foundGuest.name}</p>
                      <p className="text-white/40 text-xs">+91 {foundGuest.phone}</p>
                      {foundGuest.email && <p className="text-white/35 text-xs">{foundGuest.email}</p>}
                      {foundGuest.idNumber && (
                        <p className="text-white/35 text-xs">{foundGuest.idType} · {foundGuest.idNumber}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-green-400 bg-green-500/15 border border-green-500/20 px-2 py-1 rounded-full">
                      Returning Guest
                    </span>
                    <p className="text-white/30 text-xs mt-1">{foundGuest._count.bookings} past booking{foundGuest._count.bookings !== 1 ? "s" : ""}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* New guest form */}
          {guestNotFound && (
            <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
              <h2 className="font-semibold text-white mb-1 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-amber-400" /> Register New Guest
              </h2>
              <p className="text-white/30 text-xs mb-4">No account found for this number. Fill in details to register.</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className={labelCls}>Full Name *</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                    <input value={newGuestName} onChange={e => setNewGuestName(e.target.value)}
                      placeholder="As on government ID" className={`${inputCls} pl-10`} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Email <span className="normal-case font-normal text-white/20">(optional)</span></label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                    <input type="email" value={newGuestEmail} onChange={e => setNewGuestEmail(e.target.value)}
                      placeholder="guest@email.com" className={`${inputCls} pl-10`} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>ID Type</label>
                  <select value={newGuestIdType} onChange={e => setNewGuestIdType(e.target.value)} className={selectCls}>
                    {ID_TYPES.map(t => <option key={t.value} value={t.value} className="bg-[#0D1B0E]">{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>ID Number *</label>
                  <div className="relative">
                    <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                    <input value={newGuestIdNumber} onChange={e => setNewGuestIdNumber(e.target.value)}
                      placeholder="Enter ID number" className={`${inputCls} pl-10`} />
                  </div>
                </div>
              </div>

              {/* ID Photos */}
              <div className="mb-4">
                <IdPhotoUpload
                  frontUrl={newGuestIdFrontUrl}
                  backUrl={newGuestIdBackUrl}
                  onFrontChange={setNewGuestIdFrontUrl}
                  onBackChange={setNewGuestIdBackUrl}
                />
              </div>

              {/* Travel details */}
              <p className="text-white/30 text-xs uppercase tracking-wider font-semibold mb-3">Travel Details <span className="normal-case font-normal">(optional)</span></p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className={labelCls}>Coming From</label>
                  <div className="relative">
                    <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                    <input value={comingFrom} onChange={e => setComingFrom(e.target.value)}
                      placeholder="City / Address" className={`${inputCls} pl-10`} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Purpose of Visit</label>
                  <select value={purpose} onChange={e => setPurpose(e.target.value)} className={selectCls}>
                    <option value="" className="bg-[#0D1B0E]">Select</option>
                    {["Leisure / Tourism", "Business", "Family Visit", "Medical", "Education", "Other"].map(p => (
                      <option key={p} value={p} className="bg-[#0D1B0E]">{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Vehicle No. <span className="normal-case font-normal text-white/20">(optional)</span></label>
                  <div className="relative">
                    <Car className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                    <input value={vehicleNo} onChange={e => setVehicleNo(e.target.value.toUpperCase())}
                      placeholder="CG04AB1234" className={`${inputCls} pl-10 uppercase`} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {!foundGuest && !guestNotFound && (
            <div className="text-center py-8 text-white/20 text-sm">
              Search by phone to find an existing guest or register a new one
            </div>
          )}

          <div className="flex gap-3 justify-between">
            <button onClick={() => setStep(1)} className="flex items-center gap-2 text-white/40 hover:text-white/70 text-sm font-semibold px-4 py-3 rounded-xl bg-white/5 hover:bg-white/8 transition-all">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!foundGuest && (!guestNotFound || !newGuestName || newGuestIdNumber.length < 4)}
              className="flex items-center gap-2 bg-blue-500 hover:bg-blue-400 disabled:opacity-40 text-white font-bold px-6 py-3 rounded-xl transition-all">
              Next: Payment <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Payment & Confirm ── */}
      {step === 3 && totals && (
        <div className="space-y-5">
          {/* Summary bar */}
          <div className="bg-white/3 border border-white/8 rounded-2xl p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-white/30 text-xs mb-0.5">Room</p>
              <p className="text-white/75 font-semibold">
                {ROOM_LABELS[selectedRoom!.roomType]} #{selectedRoom!.roomNumber}
              </p>
            </div>
            <div>
              <p className="text-white/30 text-xs mb-0.5">Dates</p>
              <p className="text-white/75 font-semibold">{checkIn} → {checkOut} ({nights}N)</p>
            </div>
            <div>
              <p className="text-white/30 text-xs mb-0.5">Guest</p>
              <p className="text-white/75 font-semibold">{selectedGuest?.name ?? newGuestName}</p>
            </div>
            <div>
              <p className="text-white/30 text-xs mb-0.5">Phone</p>
              <p className="text-white/75 font-semibold">+91 {guestPhone}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Payment */}
            <div className="bg-white/3 border border-white/8 rounded-2xl p-5 space-y-4">
              <h2 className="font-semibold text-white flex items-center gap-2">
                <Banknote className="w-4 h-4 text-blue-400" /> Payment Details
              </h2>

              <div>
                <label className={labelCls}>Booking Source</label>
                <div className="flex gap-2">
                  {(["WALK_IN", "PHONE", "OTHER"] as const).map(s => (
                    <button key={s} onClick={() => setSource(s)}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                        source === s ? "bg-blue-500/20 text-blue-300 border-blue-500/30" : "bg-white/3 text-white/35 border-white/8 hover:bg-white/6"
                      }`}>
                      {s === "WALK_IN" ? "Walk-in" : s === "PHONE" ? "Phone" : "Other"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={labelCls}>Payment Mode</label>
                <div className="flex gap-2">
                  {(["CASH", "ONLINE", "MIXED"] as const).map(m => (
                    <button key={m} onClick={() => setPaymentMode(m)}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                        paymentMode === m ? "bg-blue-500/20 text-blue-300 border-blue-500/30" : "bg-white/3 text-white/35 border-white/8 hover:bg-white/6"
                      }`}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {(paymentMode === "CASH" || paymentMode === "MIXED") && (
                <div>
                  <label className={labelCls}>Cash Amount Paid (₹)</label>
                  <input type="number" value={cashPaid} onChange={e => setCashPaid(e.target.value)}
                    placeholder="0" className={inputCls} />
                </div>
              )}
              {(paymentMode === "ONLINE" || paymentMode === "MIXED") && (
                <div>
                  <label className={labelCls}>Online Amount Paid (₹)</label>
                  <input type="number" value={onlinePaid} onChange={e => setOnlinePaid(e.target.value)}
                    placeholder="0" className={inputCls} />
                </div>
              )}
              <div>
                <label className={labelCls}>Refundable Deposit (₹) <span className="normal-case font-normal text-white/20">(optional)</span></label>
                <input type="number" value={deposit} onChange={e => setDeposit(e.target.value)}
                  placeholder="0" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Special Requests <span className="normal-case font-normal text-white/20">(optional)</span></label>
                <textarea rows={2} value={specialRequests} onChange={e => setSpecialRequests(e.target.value)}
                  placeholder="E.g. early check-in, extra pillow..." className={`${inputCls} resize-none`} />
              </div>
            </div>

            {/* Bill */}
            <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
              <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
                <Banknote className="w-4 h-4 text-amber-400" /> Bill Summary
              </h2>
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between text-white/50">
                  <span>Room ({nights}N × ₹{selectedRoom!.basePrice.toLocaleString("en-IN")})</span>
                  <span>₹{totals.roomRent.toLocaleString("en-IN")}</span>
                </div>
                {totals.cgst > 0 && <>
                  <div className="flex justify-between text-white/30 text-xs">
                    <span>CGST ({totals.cgstRate}%)</span>
                    <span>₹{totals.cgst.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between text-white/30 text-xs">
                    <span>SGST ({totals.sgstRate}%)</span>
                    <span>₹{totals.sgst.toLocaleString("en-IN")}</span>
                  </div>
                </>}
                {Number(deposit) > 0 && (
                  <div className="flex justify-between text-white/40 text-xs">
                    <span>Refundable Deposit</span>
                    <span>₹{Number(deposit).toLocaleString("en-IN")}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-white text-base border-t border-white/8 pt-2 mt-2">
                  <span>Total</span>
                  <span className="text-amber-400">₹{totals.totalAmount.toLocaleString("en-IN")}</span>
                </div>
                {totalPaid > 0 && (
                  <div className="flex justify-between text-green-400 text-sm">
                    <span>Amount Paid</span>
                    <span>-₹{totalPaid.toLocaleString("en-IN")}</span>
                  </div>
                )}
                {balanceDue > 0 && (
                  <div className="flex justify-between font-bold text-red-400 text-sm border-t border-white/8 pt-2">
                    <span>Balance Due</span>
                    <span>₹{balanceDue.toLocaleString("en-IN")}</span>
                  </div>
                )}
                {balanceDue === 0 && totalPaid > 0 && (
                  <div className="flex items-center gap-2 text-green-400 text-xs bg-green-500/8 border border-green-500/20 rounded-xl px-3 py-2">
                    <Check className="w-3.5 h-3.5" /> Fully paid
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-3 justify-between">
            <button onClick={() => setStep(2)} className="flex items-center gap-2 text-white/40 hover:text-white/70 text-sm font-semibold px-4 py-3 rounded-xl bg-white/5 hover:bg-white/8 transition-all">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <button onClick={handleSubmit} disabled={submitting}
              className="flex items-center gap-2 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-white font-bold px-8 py-3 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-green-500/20">
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
              {submitting ? "Creating Booking…" : "Confirm Booking"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
