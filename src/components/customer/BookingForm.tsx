"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2, Tag, CheckCircle, XCircle, User, Phone, Mail, Users, MessageSquare,
  CreditCard, Banknote, ArrowRight, Wifi, Calendar,
} from "lucide-react";
import { computeTotals } from "@/lib/utils/booking-calc";
import { signIn } from "next-auth/react";

interface BookingFormProps {
  hotel: { id: string; name: string };
  room: { id: string; roomTypeLabel: string; basePrice: number; capacity: number };
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  totals: { roomRent: number; cgst: number; sgst: number; cgstRate: number; sgstRate: number; totalAmount: number };
  accentColor?: string;
}

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open(): void };
  }
}

const inputCls =
  "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/40 focus:bg-white/8 transition-all";

const dateCls =
  "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-amber-400/40 focus:bg-white/8 transition-all [color-scheme:dark]";

const labelCls = "block text-xs font-semibold text-white/45 uppercase tracking-wider mb-2";

function FieldIcon({ icon }: { icon: React.ReactNode }) {
  return <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25">{icon}</span>;
}

type PayMode = "PAY_NOW" | "PAY_AT_HOTEL";

export default function BookingForm({
  hotel, room, checkIn, checkOut, guests, totals, accentColor = "#F59E0B",
}: BookingFormProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // ── Dates (editable in form) ───────────────────────────────────────────────
  const today = new Date().toISOString().split("T")[0];
  const [localCheckIn, setLocalCheckIn] = useState(checkIn);
  const [localCheckOut, setLocalCheckOut] = useState(checkOut);

  // Derive nights + totals from current date selection
  const localNights = (() => {
    if (!localCheckIn || !localCheckOut) return 0;
    const n = Math.ceil(
      (new Date(localCheckOut).getTime() - new Date(localCheckIn).getTime()) / 86400000
    );
    return n > 0 ? n : 0;
  })();

  // ── Live availability check ────────────────────────────────────────────────
  type AvailStatus = "idle" | "checking" | "available" | "unavailable";
  const [availStatus, setAvailStatus] = useState<AvailStatus>("idle");
  const [availReason, setAvailReason] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!localCheckIn || !localCheckOut || localNights < 1) {
      setAvailStatus("idle"); return;
    }
    setAvailStatus("checking");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/rooms/${room.id}/availability?checkIn=${localCheckIn}&checkOut=${localCheckOut}`
        );
        const data = await res.json();
        setAvailStatus(data.available ? "available" : "unavailable");
        setAvailReason(data.reason ?? "");
      } catch {
        setAvailStatus("idle");
      }
    }, 600); // 600 ms debounce
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localCheckIn, localCheckOut]);

  // Guest details
  const [guestName, setGuestName] = useState(session?.user?.name ?? "");
  const [guestPhone, setGuestPhone] = useState((session?.user as { phone?: string })?.phone ?? "");
  const [guestEmail, setGuestEmail] = useState(session?.user?.email ?? "");
  const [specialRequests, setSpecialRequests] = useState("");
  const [noOfPersons, setNoOfPersons] = useState(guests);

  // Coupon
  const [couponCode, setCouponCode] = useState("");
  const [couponApplied, setCouponApplied] = useState(false);
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponMessage, setCouponMessage] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);

  // Payment mode
  const [payMode, setPayMode] = useState<PayMode>("PAY_NOW");

  // Recompute totals dynamically from selected dates
  const liveTotals = localNights > 0
    ? computeTotals({ roomRentPerNight: room.basePrice, noOfNights: localNights, couponDiscount: couponApplied ? couponDiscount : 0 })
    : totals;

  const totalAfterCoupon = liveTotals.totalAmount;

  const maxGuests = Math.min(room.capacity, 5);

  // When check-in changes, clear check-out if it's before the new check-in
  function handleCheckInChange(val: string) {
    setLocalCheckIn(val);
    if (localCheckOut && localCheckOut <= val) setLocalCheckOut("");
    // Reset coupon — discount depends on nights × basePrice
    setCouponApplied(false); setCouponDiscount(0); setCouponMessage(""); setCouponCode("");
  }

  function handleCheckOutChange(val: string) {
    setLocalCheckOut(val);
    setCouponApplied(false); setCouponDiscount(0); setCouponMessage(""); setCouponCode("");
  }

  async function validateCoupon() {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: couponCode, hotelId: hotel.id, amount: liveTotals.roomRent }),
      });
      const data = await res.json();
      if (data.valid) {
        setCouponApplied(true); setCouponDiscount(data.discount); setCouponMessage(data.message);
        toast.success(data.message);
      } else {
        setCouponApplied(false); setCouponDiscount(0); setCouponMessage(data.message);
        toast.error(data.message);
      }
    } finally { setCouponLoading(false); }
  }

  async function handleBooking() {
    if (!localCheckIn || !localCheckOut) {
      toast.error("Please select your check-in and check-out dates."); return;
    }
    if (localNights < 1) {
      toast.error("Check-out must be after check-in."); return;
    }
    if (availStatus === "unavailable") {
      toast.error(availReason || "Room is not available for these dates."); return;
    }
    if (!guestPhone || guestPhone.replace(/\D/g, "").length < 10) {
      toast.error("Enter a valid 10-digit phone number"); return;
    }
    if (!guestName.trim()) { toast.error("Enter your full name"); return; }

    setLoading(true);
    try {
      const payload = {
        hotelId: hotel.id, roomId: room.id,
        checkInDate: localCheckIn, checkOutDate: localCheckOut,
        noOfPersons,
        couponCode: couponApplied ? couponCode : undefined,
        specialRequests: specialRequests || undefined,
        guestName, guestPhone: guestPhone.replace(/\D/g, ""),
        guestEmail: guestEmail || undefined,
        payMode,
      };

      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      // Guard against HTML error pages (500s that aren't JSON)
      let data: Record<string, unknown> = {};
      try {
        data = await res.json();
      } catch {
        toast.error(`Server error (${res.status}). Check console for details.`);
        return;
      }
      if (!res.ok) { toast.error((data.error as string) ?? "Booking failed. Please try again."); return; }

      // ── Pay at Hotel: booking already confirmed, go straight to confirmation ──
      if (payMode === "PAY_AT_HOTEL") {
        toast.success("Booking confirmed! See you at check-in.");
        window.location.href = `/booking/confirmation/${data.bookingRef as string}`;
        return;
      }

      // ── Pay Now: launch Razorpay ──────────────────────────────────────────────
      await loadRazorpay();

      const rzp = new window.Razorpay({
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: Math.round(totalAfterCoupon * 100),
        currency: "INR",
        name: "The Urban Escape",
        description: `${room.roomTypeLabel} · ${localNights} night${localNights > 1 ? "s" : ""}`,
        order_id: data.razorpayOrderId,
        prefill: { name: guestName, email: guestEmail, contact: guestPhone },
        theme: { color: accentColor },
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          const vRes = await fetch("/api/payments/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...response, bookingId: data.bookingId }),
          });
          const vData = await vRes.json();
          if (vData.success) {
            router.push(`/booking/confirmation/${vData.bookingRef}`);
          } else {
            toast.error("Payment verification failed. Contact support.");
          }
        },
        modal: { ondismiss: () => { toast.info("Payment cancelled."); setLoading(false); } },
      });
      rzp.open();
    } catch (err) {
      console.error("[BookingForm] handleBooking error:", err);
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      toast.error(msg);
    } finally {
      if (payMode === "PAY_AT_HOTEL") setLoading(false);
    }
  }

  const PAY_MODES: { value: PayMode; label: string; sub: string; icon: React.ReactNode; badge?: string }[] = [
    {
      value: "PAY_NOW",
      label: "Pay Now",
      sub: "UPI · Cards · Net Banking · Wallets",
      icon: <CreditCard className="w-5 h-5" />,
      badge: "Instant confirmation",
    },
    {
      value: "PAY_AT_HOTEL",
      label: "Pay at Hotel",
      sub: "Cash or UPI at check-in",
      icon: <Banknote className="w-5 h-5" />,
    },
  ];

  return (
    <div className="space-y-5">

      {/* ── Section 1: Dates ───────────────────────── */}
      <div className="glass-card glass-shimmer glass-top-highlight rounded-3xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <span className="w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center shrink-0 text-black"
            style={{ background: accentColor }}>1</span>
          <h2 className="font-semibold text-white text-base">Select Dates</h2>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Check-in */}
          <div>
            <label className={labelCls}>Check-in *</label>
            <div className="relative">
              <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none" />
              <input
                type="date"
                value={localCheckIn}
                min={today}
                onChange={(e) => handleCheckInChange(e.target.value)}
                className={`${dateCls} pl-10`}
                required
              />
            </div>
          </div>

          {/* Check-out */}
          <div>
            <label className={labelCls}>Check-out *</label>
            <div className="relative">
              <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none" />
              <input
                type="date"
                value={localCheckOut}
                min={localCheckIn || today}
                onChange={(e) => handleCheckOutChange(e.target.value)}
                className={`${dateCls} pl-10`}
                required
              />
            </div>
          </div>
        </div>

        {/* Duration + price summary */}
        {localNights > 0 ? (
          <p className="mt-3 text-xs font-semibold text-center py-2 rounded-xl"
            style={{ background: `${accentColor}12`, color: accentColor }}>
            {localNights} night{localNights > 1 ? "s" : ""} ·{" "}
            ₹{liveTotals.roomRent.toLocaleString("en-IN")} room rent
            {liveTotals.cgst > 0 && ` + ₹${(liveTotals.cgst + liveTotals.sgst).toLocaleString("en-IN")} GST`}
            {" "}= <strong>₹{liveTotals.totalAmount.toLocaleString("en-IN")}</strong>
          </p>
        ) : (
          <p className="mt-3 text-xs text-white/30 text-center py-2 rounded-xl bg-white/3 border border-white/6">
            Select check-in and check-out dates to see the total
          </p>
        )}

        {/* Live availability badge */}
        {availStatus === "checking" && (
          <div className="mt-2 flex items-center justify-center gap-2 text-xs text-white/40 py-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Checking availability…
          </div>
        )}
        {availStatus === "available" && (
          <div className="mt-2 flex items-center justify-center gap-2 text-xs font-semibold text-green-400 bg-green-500/8 border border-green-500/20 py-2 rounded-xl">
            <CheckCircle className="w-3.5 h-3.5" />
            Room is available for your dates!
          </div>
        )}
        {availStatus === "unavailable" && (
          <div className="mt-2 flex items-center justify-center gap-2 text-xs font-semibold text-red-400 bg-red-500/8 border border-red-500/20 py-2 rounded-xl">
            <XCircle className="w-3.5 h-3.5" />
            {availReason || "Room not available for these dates"}
          </div>
        )}
      </div>

      {/* ── Section 2: Guest Details ───────────────── */}
      <div className="glass-card glass-shimmer glass-top-highlight rounded-3xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <span className="w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center shrink-0 text-black"
              style={{ background: accentColor }}>2</span>
            <h2 className="font-semibold text-white text-base">Guest Details</h2>
          </div>
          {/* Sign-in hint for guests */}
          {!session?.user && (
            <button
              type="button"
              onClick={() => signIn("google")}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-white/40 hover:text-white/70 border border-white/10 hover:border-white/20 bg-white/3 hover:bg-white/6 px-3 py-1.5 rounded-xl transition-all"
            >
              <svg viewBox="0 0 24 24" className="w-3 h-3 shrink-0" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Sign in to pre-fill
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Name */}
          <div>
            <label className={labelCls}>Full Name *</label>
            <div className="relative">
              <FieldIcon icon={<User className="w-4 h-4" />} />
              <input placeholder="As on government ID" value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                className={`${inputCls} pl-10`} required />
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className={labelCls}>Mobile Number *</label>
            <div className="flex">
              <span className="flex items-center gap-1.5 px-3 bg-white/5 border border-white/10 border-r-0 rounded-l-xl text-white/35 text-sm shrink-0">
                <Phone className="w-3.5 h-3.5" /> +91
              </span>
              <input type="tel" placeholder="10-digit number" value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                className="flex-1 bg-white/5 border border-white/10 rounded-r-xl px-4 py-3 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/40 focus:bg-white/8 transition-all" />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className={labelCls}>Email <span className="text-white/20 normal-case font-normal tracking-normal">(optional)</span></label>
            <div className="relative">
              <FieldIcon icon={<Mail className="w-4 h-4" />} />
              <input type="email" placeholder="For booking receipt" value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                className={`${inputCls} pl-10`} />
            </div>
          </div>

          {/* Guests */}
          <div>
            <label className={labelCls}>Number of Guests</label>
            <div className="relative">
              <FieldIcon icon={<Users className="w-4 h-4" />} />
              <select value={noOfPersons} onChange={(e) => setNoOfPersons(Number(e.target.value))}
                className={`${inputCls} pl-10 appearance-none cursor-pointer`}>
                {Array.from({ length: maxGuests }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n} className="bg-[#0D1B0E] text-white">
                    {n} Guest{n > 1 ? "s" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Special requests */}
          <div className="sm:col-span-2">
            <label className={labelCls}>Special Requests <span className="text-white/20 normal-case font-normal tracking-normal">(optional)</span></label>
            <div className="relative">
              <MessageSquare className="absolute left-3.5 top-3.5 w-4 h-4 text-white/25" />
              <textarea rows={2} placeholder="E.g. early check-in, extra pillows, anniversary decoration..."
                value={specialRequests} onChange={(e) => setSpecialRequests(e.target.value)}
                className={`${inputCls} pl-10 resize-none`} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 3: Coupon ──────────────────────── */}
      <div className="glass-card glass-shimmer glass-top-highlight rounded-3xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <span className="w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center shrink-0 text-black"
            style={{ background: accentColor }}>3</span>
          <h2 className="font-semibold text-white text-base">Coupon / Discount</h2>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Tag className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
            <input placeholder="Enter coupon code" value={couponCode}
              onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponApplied(false); setCouponDiscount(0); }}
              className={`${inputCls} pl-10 uppercase tracking-widest`} />
          </div>
          <button onClick={validateCoupon} disabled={couponLoading || !couponCode || localNights === 0}
            className="px-5 bg-white/8 hover:bg-white/12 border border-white/10 text-white/70 hover:text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-40 shrink-0">
            {couponLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
          </button>
        </div>

        {localNights === 0 && (
          <p className="text-xs mt-2 text-white/25 italic">Select dates first to apply a coupon</p>
        )}

        {couponMessage && (
          <p className={`text-xs mt-2 flex items-center gap-1.5 ${couponApplied ? "text-green-400" : "text-red-400"}`}>
            {couponApplied && <CheckCircle className="w-3.5 h-3.5" />}
            {couponMessage}
          </p>
        )}

        {couponApplied && (
          <div className="mt-3 bg-green-500/8 border border-green-500/20 rounded-xl p-4">
            <div className="flex justify-between text-green-400 text-sm">
              <span>Coupon discount</span>
              <span>-₹{couponDiscount.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex justify-between font-bold text-green-300 text-base mt-1.5">
              <span>Amount to pay</span>
              <span>₹{totalAfterCoupon.toLocaleString("en-IN")}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Section 4: Payment Mode ────────────────── */}
      <div className="glass-card glass-shimmer glass-top-highlight rounded-3xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <span className="w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center shrink-0 text-black"
            style={{ background: accentColor }}>4</span>
          <h2 className="font-semibold text-white text-base">Payment</h2>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {PAY_MODES.map((m) => {
            const selected = payMode === m.value;
            return (
              <button key={m.value} type="button" onClick={() => setPayMode(m.value)}
                className={`relative flex flex-col items-center gap-2.5 p-4 rounded-2xl border text-center transition-all duration-250 ${
                  selected
                    ? "border-amber-400/45 bg-gradient-to-b from-amber-400/10 to-amber-400/4 shadow-lg shadow-amber-500/12 [box-shadow:0_8px_28px_rgba(245,158,11,0.12),inset_0_1px_0_rgba(245,158,11,0.20)]"
                    : "border-white/8 bg-gradient-to-b from-white/[0.06] to-white/[0.02] hover:from-white/[0.09] hover:to-white/[0.04] hover:border-white/15"
                }`}
              >
                {selected && (
                  <span className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full bg-amber-400 flex items-center justify-center">
                    <CheckCircle className="w-3 h-3 text-black" />
                  </span>
                )}
                <span className={selected ? "text-amber-400" : "text-white/35"}>
                  {m.icon}
                </span>
                <div>
                  <p className={`text-sm font-bold ${selected ? "text-white" : "text-white/55"}`}>
                    {m.label}
                  </p>
                  <p className={`text-[11px] mt-0.5 leading-snug ${selected ? "text-white/45" : "text-white/25"}`}>
                    {m.sub}
                  </p>
                </div>
                {m.badge && (
                  <span className="text-[10px] font-semibold text-green-400 bg-green-500/12 border border-green-500/20 px-2 py-0.5 rounded-full">
                    {m.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-4 glass-card rounded-xl px-4 py-3 text-xs leading-relaxed text-white/40">
          {payMode === "PAY_NOW" ? (
            <span className="flex items-start gap-2">
              <Wifi className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
              Secured by Razorpay. Pay using UPI, debit/credit card, net banking, or wallet.
              Your booking is confirmed immediately after payment.
            </span>
          ) : (
            <span className="flex items-start gap-2">
              <Banknote className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              Your room is reserved right now at no upfront cost. Bring{" "}
              {localNights > 0 ? (
                <span className="text-white/60 font-semibold mx-1">
                  ₹{totalAfterCoupon.toLocaleString("en-IN")}
                </span>
              ) : " the full amount "}
              {" "}in cash or pay via UPI when you arrive at the hotel.
            </span>
          )}
        </div>
      </div>

      {/* ── CTA ───────────────────────────────────── */}
      <div>
        <button
          onClick={handleBooking}
          disabled={loading || localNights === 0 || availStatus === "checking" || availStatus === "unavailable"}
          className="w-full flex items-center justify-center gap-2 font-bold py-4 rounded-2xl text-base transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 shadow-xl text-black"
          style={{ background: availStatus === "unavailable" ? "#6b7280" : accentColor, boxShadow: `0 12px 40px ${accentColor}35` }}>
          {loading ? (
            <><Loader2 className="w-5 h-5 animate-spin" />
              {payMode === "PAY_AT_HOTEL" ? "Confirming…" : "Processing payment…"}
            </>
          ) : availStatus === "checking" ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Checking availability…</>
          ) : availStatus === "unavailable" ? (
            "Room not available for these dates"
          ) : localNights === 0 ? (
            "Select dates above to continue"
          ) : payMode === "PAY_NOW" ? (
            `Pay ₹${totalAfterCoupon.toLocaleString("en-IN")} & Confirm`
          ) : (
            <><ArrowRight className="w-5 h-5" /> Reserve Room · Pay at Hotel</>
          )}
        </button>

        {localNights > 0 && (
          <p className="text-center text-xs text-white/20 mt-3">
            {payMode === "PAY_NOW"
              ? "Secured by Razorpay · UPI, Cards, Net Banking, Wallets accepted"
              : `₹${totalAfterCoupon.toLocaleString("en-IN")} payable in cash or UPI at check-in`}
          </p>
        )}
      </div>
    </div>
  );
}

function loadRazorpay(): Promise<void> {
  return new Promise((resolve) => {
    if (window.Razorpay) { resolve(); return; }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
}
