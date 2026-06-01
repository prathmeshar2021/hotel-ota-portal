"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Image from "next/image";
import {
  Search, User, Phone, Mail, CreditCard, ChevronRight, ChevronLeft,
  Check, Loader2, BedDouble, Calendar, Users, Banknote, Car,
  MapPin, X, ArrowRight, UserPlus, UserCheck, Tag, ShieldCheck, XCircle,
} from "lucide-react";
import { computeTotals, REFUNDABLE_DEPOSIT } from "@/lib/utils/booking-calc";
import IdPhotoUpload from "@/components/hotel-admin/IdPhotoUpload";
import { getCategoryMeta } from "@/lib/utils/room-categories";

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

  // Step 2 — guest search
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<GuestResult[]>([]);
  const [selectedGuest, setSelectedGuest] = useState<GuestResult | null>(null);
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // New guest form
  const [newGuestName, setNewGuestName] = useState("");
  const [newGuestPhone, setNewGuestPhone] = useState("");
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
  const [specialRequests, setSpecialRequests] = useState("");
  // Coupon
  const [couponCode, setCouponCode] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<{
    couponId: string; discount: number; message: string;
  } | null>(null);
  const [couponError, setCouponError] = useState("");

  // ── Computed ──
  const nights = checkIn && checkOut
    ? Math.max(0, Math.ceil((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000))
    : 0;

  const totals = selectedRoom && nights > 0
    ? computeTotals({
        roomRentPerNight: selectedRoom.basePrice,
        noOfNights: nights,
        couponDiscount: appliedCoupon?.discount ?? 0,
        refundableDeposit: REFUNDABLE_DEPOSIT,
      })
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

  // ── Guest search (debounced) ──
  async function runSearch(q: string) {
    const query = q.trim();
    if (query.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/hotel-admin/guests?q=${encodeURIComponent(query)}`);
      if (res.ok) setSearchResults(await res.json());
    } finally { setSearching(false); }
  }

  function handleSearchChange(val: string) {
    setSearchQuery(val);
    setSelectedGuest(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => runSearch(val), 400);
  }

  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);

  function selectGuest(g: GuestResult) {
    setSelectedGuest(g);
    setSearchResults([]);
    setSearchQuery("");
    setShowRegisterForm(false);
  }

  // Called while typing — only clears previous search results, NOT the phone input
  function clearGuestResults() {
    setSearchResults([]);
    setSelectedGuest(null);
    setNewGuestName("");
    setNewGuestEmail("");
    setNewGuestPhone("");
    setNewGuestIdNumber("");
    setNewGuestIdFrontUrl("");
    setNewGuestIdBackUrl("");
  }

  // Full reset of Step 2
  function clearGuest() {
    clearGuestResults();
    setSearchQuery("");
    setShowRegisterForm(false);
  }

  // ── Coupon handler ──
  async function applyCouponCode() {
    const code = couponCode.trim().toUpperCase();
    if (!code) { setCouponError("Enter a coupon code"); return; }
    if (!selectedRoom || !nights) { setCouponError("Select room and dates first"); return; }
    setCouponLoading(true);
    setCouponError("");
    setAppliedCoupon(null);
    try {
      const roomRent = selectedRoom.basePrice * nights;
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, hotelId, amount: roomRent }),
      });
      const data = await res.json();
      if (!data.valid) { setCouponError(data.message ?? "Invalid coupon"); return; }
      setAppliedCoupon({ couponId: data.couponId, discount: data.discount, message: data.message });
    } catch {
      setCouponError("Failed to validate coupon");
    } finally {
      setCouponLoading(false);
    }
  }

  function removeCoupon() {
    setAppliedCoupon(null);
    setCouponCode("");
    setCouponError("");
  }

  // ── Step 2 handlers ──
  // ── Submit ──
  async function handleSubmit() {
    const guestName = selectedGuest?.name ?? newGuestName;
    const phone = (selectedGuest?.phone ?? newGuestPhone).replace(/\D/g, "");

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
          refundableDeposit: REFUNDABLE_DEPOSIT,
          couponCode: appliedCoupon ? couponCode.trim().toUpperCase() : undefined,
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
                const catMeta = getCategoryMeta(room.roomType);
                const accent = catMeta.accentColor;
                const img = room.images?.[0] ?? null;
                const isSelected = selectedRoom?.id === room.id;
                return (
                  <button key={room.id} onClick={() => setSelectedRoom(isSelected ? null : room)}
                    className={`w-full text-left flex gap-4 rounded-2xl p-4 border transition-all ${
                      isSelected ? "border-blue-500/50 bg-blue-500/8" : "border-white/8 bg-white/3 hover:border-white/20 hover:bg-white/5"
                    }`}>
                    {img && (
                      <div className="relative w-24 h-20 rounded-xl overflow-hidden shrink-0">
                        <Image src={img} alt={room.roomNumber} fill className="object-cover" />
                      </div>
                    )}
                    {!img && (
                      <div className="w-24 h-20 rounded-xl shrink-0 flex items-center justify-center text-2xl font-bold"
                        style={{ background: `${accent}20`, color: accent }}>
                        {room.roomNumber}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-bold" style={{ color: accent }}>
                          {catMeta.displayName}
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

          {/* Selected guest card — shown once a guest is chosen from search */}
          {selectedGuest && (
            <div className="bg-green-500/8 border border-green-500/25 rounded-2xl p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-green-500/20 border border-green-500/25 flex items-center justify-center shrink-0">
                    <UserCheck className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-white">{selectedGuest.name}</p>
                      <span className="text-[10px] font-semibold text-green-400 bg-green-500/15 border border-green-500/20 px-2 py-0.5 rounded-full">
                        {selectedGuest._count.bookings > 0
                          ? `${selectedGuest._count.bookings} past booking${selectedGuest._count.bookings !== 1 ? "s" : ""}`
                          : "New guest"}
                      </span>
                    </div>
                    <p className="text-white/50 text-sm">+91 {selectedGuest.phone}</p>
                    {selectedGuest.email && <p className="text-white/35 text-xs">{selectedGuest.email}</p>}
                    {selectedGuest.idNumber && (
                      <p className="text-white/30 text-xs">{selectedGuest.idType} · {selectedGuest.idNumber}</p>
                    )}
                  </div>
                </div>
                <button onClick={clearGuest}
                  className="flex items-center gap-1.5 text-xs text-white/35 hover:text-white/70 border border-white/10 hover:border-white/25 bg-white/3 hover:bg-white/8 px-3 py-2 rounded-xl transition-all shrink-0">
                  <X className="w-3.5 h-3.5" /> Change
                </button>
              </div>
            </div>
          )}

          {/* Search + Register panel — hidden once a guest is selected */}
          {!selectedGuest && (
            <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
              {/* Header row */}
              <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                <h2 className="font-semibold text-white flex items-center gap-2">
                  {showRegisterForm
                    ? <><UserPlus className="w-4 h-4 text-amber-400" /> Register New Guest</>
                    : <><Search className="w-4 h-4 text-blue-400" /> Find Guest</>}
                </h2>
                {!showRegisterForm ? (
                  <button
                    onClick={() => { setShowRegisterForm(true); setSearchResults([]); setSearchQuery(""); }}
                    className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 bg-amber-500/10 hover:bg-amber-500/18 border border-amber-500/25 px-3 py-2 rounded-xl transition-all shrink-0">
                    <UserPlus className="w-3.5 h-3.5" /> Register New Guest
                  </button>
                ) : (
                  <button
                    onClick={() => setShowRegisterForm(false)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-white/40 hover:text-white/70 bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2 rounded-xl transition-all shrink-0">
                    <Search className="w-3.5 h-3.5" /> Search Instead
                  </button>
                )}
              </div>

              {/* ── Search mode ── */}
              {!showRegisterForm && (
                <div>
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none" />
                    {searching && (
                      <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 animate-spin" />
                    )}
                    <input
                      type="text"
                      placeholder="Search by name, phone, email or ID number…"
                      value={searchQuery}
                      onChange={e => handleSearchChange(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && runSearch(searchQuery)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-10 py-3 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-blue-400/40 transition-all"
                    />
                  </div>
                  <p className="text-white/25 text-xs mt-2">Type at least 2 characters — searches name, phone, email and ID</p>

                  {/* Results */}
                  {searchResults.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {searchResults.map(g => (
                        <button key={g.id} onClick={() => selectGuest(g)}
                          className="w-full flex items-center gap-3 p-3.5 bg-white/3 hover:bg-blue-500/8 border border-white/8 hover:border-blue-500/30 rounded-xl transition-all text-left group">
                          <div className="w-9 h-9 rounded-full bg-white/8 border border-white/10 flex items-center justify-center shrink-0 text-sm font-bold text-white/40 group-hover:bg-blue-500/15 group-hover:text-blue-300 transition-all">
                            {g.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-white/85 text-sm">{g.name}</p>
                              {g._count.bookings > 0 && (
                                <span className="text-[10px] text-blue-400/70 bg-blue-500/8 border border-blue-500/15 px-1.5 py-0.5 rounded-full">
                                  {g._count.bookings} booking{g._count.bookings !== 1 ? "s" : ""}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                              {g.phone && <span className="text-white/35 text-xs flex items-center gap-1"><Phone className="w-3 h-3" />+91 {g.phone}</span>}
                              {g.email && <span className="text-white/30 text-xs truncate max-w-[160px]">{g.email}</span>}
                              {g.idNumber && <span className="text-white/25 text-xs font-mono">{g.idType} {g.idNumber}</span>}
                            </div>
                          </div>
                          <span className="text-blue-400/50 group-hover:text-blue-400 text-xs font-semibold shrink-0 transition-colors">Select →</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
                    <div className="mt-3 text-center py-5 border border-dashed border-white/10 rounded-xl">
                      <p className="text-white/30 text-sm">No guest found for &ldquo;{searchQuery}&rdquo;</p>
                      <button
                        onClick={() => { setShowRegisterForm(true); setSearchResults([]); }}
                        className="mt-2 text-xs text-amber-400 hover:text-amber-300 transition-colors font-semibold">
                        + Register as new guest
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── Register New Guest form ── */}
              {showRegisterForm && (
                <div className="space-y-4">

                  {/* Phone — first field */}
                  <div>
                    <label className={labelCls}>Phone Number *</label>
                    <div className="relative">
                      <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                      <input
                        type="tel"
                        value={newGuestPhone}
                        onChange={e => setNewGuestPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                        placeholder="10-digit mobile number"
                        className={`${inputCls} pl-10`}
                        maxLength={10}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                  <IdPhotoUpload
                    frontUrl={newGuestIdFrontUrl}
                    backUrl={newGuestIdBackUrl}
                    onFrontChange={setNewGuestIdFrontUrl}
                    onBackChange={setNewGuestIdBackUrl}
                  />

                  <div>
                    <p className="text-white/30 text-xs uppercase tracking-wider font-semibold mb-3">
                      Travel Details <span className="normal-case font-normal">(optional)</span>
                    </p>
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
                </div>
              )}
            </div>
          )}

          {/* Navigation — always visible */}
          <div className="flex gap-3 justify-between">
            <button onClick={() => setStep(1)}
              className="flex items-center gap-2 text-white/40 hover:text-white/70 text-sm font-semibold px-4 py-3 rounded-xl bg-white/5 hover:bg-white/8 transition-all">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!selectedGuest && (!showRegisterForm || !newGuestName || newGuestPhone.replace(/\D/g, "").length !== 10)}
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
                {getCategoryMeta(selectedRoom!.roomType).displayName} #{selectedRoom!.roomNumber}
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
              <p className="text-white/75 font-semibold">+91 {selectedGuest?.phone ?? newGuestPhone}</p>
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
              {/* Fixed deposit — not editable */}
              <div className="flex items-center justify-between bg-green-500/5 border border-green-500/15 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2 text-green-400/80 text-sm font-semibold">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  Refundable Security Deposit
                </div>
                <span className="font-bold text-green-400">₹{REFUNDABLE_DEPOSIT}</span>
              </div>

              {/* Coupon code */}
              <div>
                <label className={labelCls}>Coupon Code <span className="normal-case font-normal text-white/20">(optional)</span></label>
                {appliedCoupon ? (
                  <div className="flex items-center gap-3 bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-3">
                    <Tag className="w-4 h-4 text-amber-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-amber-300">{couponCode.toUpperCase()}</p>
                      <p className="text-xs text-amber-400/70">{appliedCoupon.message}</p>
                    </div>
                    <button onClick={removeCoupon} className="text-white/30 hover:text-white/60 transition-colors shrink-0">
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={couponCode}
                        onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponError(""); }}
                        placeholder="Enter coupon code"
                        className={`${inputCls} flex-1 uppercase`}
                        onKeyDown={e => e.key === "Enter" && applyCouponCode()}
                      />
                      <button
                        onClick={applyCouponCode}
                        disabled={couponLoading || !couponCode.trim()}
                        className="flex items-center gap-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/25 text-amber-400 hover:text-amber-300 font-semibold px-4 py-3 rounded-xl text-sm transition-all disabled:opacity-50 shrink-0"
                      >
                        {couponLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Tag className="w-4 h-4" />}
                        Apply
                      </button>
                    </div>
                    {couponError && (
                      <p className="text-xs text-red-400/80">{couponError}</p>
                    )}
                  </div>
                )}
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
                {appliedCoupon && (
                  <div className="flex justify-between text-amber-400 text-xs">
                    <span className="flex items-center gap-1"><Tag className="w-3 h-3" /> Coupon ({couponCode.toUpperCase()})</span>
                    <span>−₹{appliedCoupon.discount.toLocaleString("en-IN")}</span>
                  </div>
                )}
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
                <div className="flex justify-between text-green-400/70 text-xs">
                  <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Refundable Deposit</span>
                  <span>₹{REFUNDABLE_DEPOSIT}</span>
                </div>
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
