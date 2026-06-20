"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  ShoppingCart, Minus, Plus, Trash2, Users, ShieldCheck, Loader2,
  CreditCard, Banknote, ArrowRight, CheckCircle, ArrowLeft, SplitSquareHorizontal,
} from "lucide-react";
import Navbar from "@/components/customer/Navbar";
import { useCart } from "@/lib/cart/CartContext";
import { computeTotals, REFUNDABLE_DEPOSIT } from "@/lib/utils/booking-calc";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open(): void };
  }
}

type PayMode = "PAY_NOW" | "PAY_PARTIAL" | "PAY_AT_HOTEL";

function loadRazorpay(): Promise<void> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    document.head.appendChild(s);
  });
}

export default function CartPage() {
  const params = useParams<{ hotelSlug: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const { items, hotelId, checkIn, checkOut, totalRooms, addItem, setQty, setGuests, removeItem, clear } = useCart();

  // Live availability per category for the cart's dates (counts gate quantities
  // but are NOT shown to the guest — only "available / not available" states).
  interface AvailCat {
    type: string; slug: string; displayName: string; capacity: number;
    available: number; originalPricePerNight: number; pricePerNight: number;
    image: string | null; accentColor: string;
  }
  const [cats, setCats] = useState<AvailCat[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [allowPayAtHotel, setAllowPayAtHotel] = useState(true);
  const [allowPartialPay, setAllowPartialPay] = useState(false);
  const availOf = (type: string) => cats.find((c) => c.type === type)?.available;

  useEffect(() => {
    if (!hotelId || !checkIn || !checkOut) return;
    fetch(`/api/categories/availability?hotelId=${hotelId}&checkIn=${checkIn}&checkOut=${checkOut}`)
      .then((r) => r.json())
      .then((d) => {
        setCats(d.categories ?? []);
        if (d.paymentSettings) {
          setAllowPayAtHotel(d.paymentSettings.allowPayAtHotel ?? true);
          setAllowPartialPay(d.paymentSettings.allowPartialPay ?? false);
        }
      })
      .catch(() => {});
  }, [hotelId, checkIn, checkOut]);

  function bump(type: string, delta: number) {
    const cur = items.find((i) => i.categoryType === type)?.qty ?? 0;
    const next = cur + delta;
    const max = availOf(type);
    if (delta > 0 && max != null && next > max) {
      toast.error("No more rooms of this type are available for your dates.");
      return;
    }
    setQty(type, next);
  }

  function addCategory(c: AvailCat) {
    if (c.available <= 0) { toast.error("That room type isn't available for your dates."); return; }
    if (!hotelId || !checkIn || !checkOut) return;
    addItem(
      { hotelId, hotelSlug: params.hotelSlug, checkIn, checkOut },
      {
        categoryType: c.type, slug: c.slug, displayName: c.displayName,
        pricePerNight: c.pricePerNight, originalPricePerNight: c.originalPricePerNight,
        capacity: c.capacity, guestsPerRoom: Math.min(2, c.capacity), image: c.image, accentColor: c.accentColor,
      }
    );
    setShowAdd(false);
    toast.success(`${c.displayName} added`);
  }

  // Categories that can still be added (available beyond what's already in cart).
  const addable = cats.filter((c) => c.available > (items.find((i) => i.categoryType === c.type)?.qty ?? 0));

  const [guestName, setGuestName] = useState(session?.user?.name ?? "");
  const [guestPhone, setGuestPhone] = useState((session?.user as { phone?: string })?.phone ?? "");
  const [guestEmail, setGuestEmail] = useState(session?.user?.email ?? "");
  const [specialRequests, setSpecialRequests] = useState("");
  const [payMode, setPayMode] = useState<PayMode>("PAY_NOW");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  const nights =
    checkIn && checkOut
      ? Math.max(1, Math.ceil((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000))
      : 1;

  // Per-line + grand totals (server re-computes authoritatively).
  const lines = items.map((it) => {
    const universalPerRoom = Math.max(0, (it.originalPricePerNight - it.pricePerNight) * nights);
    const t = computeTotals({
      roomRentPerNight: it.originalPricePerNight,
      noOfNights: nights,
      couponDiscount: universalPerRoom,
      refundableDeposit: REFUNDABLE_DEPOSIT,
    });
    return { it, perRoom: t.totalAmount, lineTotal: t.totalAmount * it.qty, universalPerRoom };
  });
  const grandTotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const totalDeposit = totalRooms * REFUNDABLE_DEPOSIT;

  async function checkout() {
    if (!hotelId || !checkIn || !checkOut) { toast.error("Your cart is missing stay dates."); return; }
    if (items.length === 0) { toast.error("Your cart is empty."); return; }
    if (!guestName.trim()) { toast.error("Enter your full name"); return; }
    if (guestPhone.replace(/\D/g, "").length !== 10) { toast.error("Enter a valid 10-digit phone number"); return; }
    if (!agreed) { toast.error("Please accept the Terms, Privacy & Cancellation Policy."); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/bookings/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelId, checkInDate: checkIn, checkOutDate: checkOut,
          items: items.map((it) => ({ roomCategory: it.categoryType, qty: it.qty, noOfPersons: it.guestsPerRoom })),
          payMode,
          guestName, guestPhone: guestPhone.replace(/\D/g, ""),
          guestEmail: guestEmail || undefined,
          specialRequests: specialRequests || undefined,
        }),
      });
      let data: Record<string, unknown> = {};
      try { data = await res.json(); } catch { toast.error(`Server error (${res.status}).`); return; }
      if (!res.ok) { toast.error((data.error as string) ?? "Booking failed."); return; }

      if (payMode === "PAY_AT_HOTEL") {
        toast.success("Booking confirmed! See you at check-in.");
        clear();
        window.location.href = `/booking/confirmation/${data.bookingRef as string}`;
        return;
      }

      await loadRazorpay();
      const isPartial = payMode === "PAY_PARTIAL";
      const rzpAmount = isPartial ? totalDeposit : grandTotal;
      const rzpDesc = isPartial
        ? `Deposit · ${totalRooms} room${totalRooms !== 1 ? "s" : ""} · balance at hotel`
        : `${totalRooms} room${totalRooms !== 1 ? "s" : ""} · ${nights} night${nights !== 1 ? "s" : ""}`;

      const rzp = new window.Razorpay({
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: Math.round(rzpAmount * 100),
        currency: "INR",
        name: "The Urban Escape",
        description: rzpDesc,
        order_id: data.razorpayOrderId,
        prefill: { name: guestName, email: guestEmail, contact: guestPhone },
        theme: { color: "#F59E0B" },
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          const vRes = await fetch("/api/payments/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(response),
          });
          const vData = await vRes.json();
          if (vData.success) {
            clear();
            router.push(`/booking/confirmation/${vData.bookingRef}`);
          } else {
            toast.error("Payment verification failed. Contact support.");
          }
        },
        modal: { ondismiss: () => { toast.info("Payment cancelled."); setLoading(false); } },
      });
      rzp.open();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      if (payMode === "PAY_AT_HOTEL") setLoading(false);
    }
  }

  // ── Empty cart ──
  if (totalRooms === 0) {
    return (
      <div className="min-h-screen bg-[#071209]">
        <Navbar />
        <div className="max-w-2xl mx-auto px-4 py-24 text-center mt-16">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-5">
            <ShoppingCart className="w-7 h-7 text-white/30" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Your cart is empty</h1>
          <p className="text-white/40 text-sm mb-6">Add rooms from a hotel to book several at once.</p>
          <Link href={`/hotel/${params.hotelSlug}`} className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold px-5 py-2.5 rounded-xl transition-all">
            <ArrowLeft className="w-4 h-4" /> Browse rooms
          </Link>
        </div>
      </div>
    );
  }

  const inputCls = "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/40";

  return (
    <div className="min-h-screen bg-[#071209]">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 pb-28 pt-24">
        <div className="flex items-center gap-3 mb-6">
          <ShoppingCart className="w-6 h-6 text-amber-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Your Cart</h1>
            <p className="text-white/40 text-sm">
              {checkIn} → {checkOut} · {nights} night{nights !== 1 ? "s" : ""} · {totalRooms} room{totalRooms !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-5 gap-6">
          {/* Items + guest form */}
          <div className="lg:col-span-3 space-y-4">
            {lines.map(({ it, perRoom, universalPerRoom }) => (
              <div key={it.categoryType} className="flex gap-4 glass-card rounded-2xl p-4">
                <div className="relative w-20 h-20 rounded-xl overflow-hidden shrink-0 bg-white/5">
                  {it.image && <Image src={it.image} alt={it.displayName} fill className="object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-white text-sm">{it.displayName}</p>
                    <button onClick={() => removeItem(it.categoryType)} className="text-white/30 hover:text-red-400 p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-white/40 mt-0.5">
                    ₹{perRoom.toLocaleString("en-IN")}/room · incl. ₹{REFUNDABLE_DEPOSIT} deposit
                    {universalPerRoom > 0 && <span className="text-violet-300"> · discount applied</span>}
                  </p>

                  <div className="flex items-center gap-4 mt-3 flex-wrap">
                    {/* Qty stepper */}
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-white/40 uppercase tracking-wider">Rooms</span>
                      <div className="flex items-center bg-white/5 border border-white/10 rounded-lg">
                        <button onClick={() => bump(it.categoryType, -1)} className="px-2 py-1.5 text-white/60 hover:text-white">
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="px-2 text-sm font-semibold text-white w-6 text-center">{it.qty}</span>
                        <button onClick={() => bump(it.categoryType, 1)}
                          disabled={availOf(it.categoryType) != null && it.qty >= availOf(it.categoryType)!}
                          className="px-2 py-1.5 text-white/60 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed">
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {/* Guests per room */}
                    <div className="flex items-center gap-2">
                      <Users className="w-3.5 h-3.5 text-white/40" />
                      <select
                        value={it.guestsPerRoom}
                        onChange={(e) => setGuests(it.categoryType, Number(e.target.value))}
                        className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none"
                      >
                        {Array.from({ length: it.capacity }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n} className="bg-[#0D1B0E]">{n} guest{n > 1 ? "s" : ""}/room</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {availOf(it.categoryType) != null && it.qty >= availOf(it.categoryType)! && (
                    <p className="text-[11px] text-amber-300/80 mt-2">
                      That&apos;s all the {it.displayName.toLowerCase()}s available for your dates — try another room type below.
                    </p>
                  )}
                </div>
              </div>
            ))}

            {/* Add another room type (cross-category) */}
            <div>
              <button
                onClick={() => setShowAdd((v) => !v)}
                disabled={addable.length === 0}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-400/80 hover:text-amber-300 px-1 disabled:opacity-40"
              >
                <Plus className="w-4 h-4" /> {addable.length === 0 ? "No other room types available" : "Add another room type"}
              </button>
              {showAdd && addable.length > 0 && (
                <div className="mt-2 glass-card rounded-2xl p-2 space-y-1">
                  {addable.map((c) => (
                    <button
                      key={c.type}
                      onClick={() => addCategory(c)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-all text-left"
                    >
                      <div className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-white/5">
                        {c.image && <Image src={c.image} alt={c.displayName} fill className="object-cover" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white">{c.displayName}</p>
                        <p className="text-xs text-white/40">₹{c.pricePerNight.toLocaleString("en-IN")}/night · up to {c.capacity} guests</p>
                      </div>
                      <Plus className="w-4 h-4 text-amber-400" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Guest details */}
            <div className="glass-card rounded-2xl p-5 mt-2 space-y-3">
              <p className="font-semibold text-white text-sm mb-1">Guest Details</p>
              <input placeholder="Full name" value={guestName} onChange={(e) => setGuestName(e.target.value)} className={inputCls} />
              <div className="flex">
                <span className="flex items-center px-3 bg-white/5 border border-white/10 border-r-0 rounded-l-xl text-white/35 text-sm">+91</span>
                <input type="tel" placeholder="10-digit mobile" value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  className="flex-1 bg-white/5 border border-white/10 rounded-r-xl px-4 py-3 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/40" />
              </div>
              <input type="email" placeholder="Email (optional)" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} className={inputCls} />
              <textarea rows={2} placeholder="Special requests (optional)" value={specialRequests} onChange={(e) => setSpecialRequests(e.target.value)} className={`${inputCls} resize-none`} />
            </div>
          </div>

          {/* Summary + pay */}
          <div className="lg:col-span-2">
            <div className="sticky top-24 glass-card rounded-2xl p-5 space-y-4">
              <p className="font-semibold text-white text-sm">Order Summary</p>
              <div className="space-y-2 text-sm">
                {lines.map(({ it, lineTotal }) => (
                  <div key={it.categoryType} className="flex justify-between text-white/55">
                    <span>{it.qty} × {it.displayName}</span>
                    <span>₹{lineTotal.toLocaleString("en-IN")}</span>
                  </div>
                ))}
                <div className="flex justify-between text-green-400 text-xs pt-1">
                  <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Refundable deposit ({totalRooms} × ₹{REFUNDABLE_DEPOSIT})</span>
                  <span>₹{totalDeposit.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between font-bold text-white text-base pt-2 border-t border-white/10">
                  <span>Total</span>
                  <span className="text-amber-400">₹{grandTotal.toLocaleString("en-IN")}</span>
                </div>
              </div>

              {/* Pay mode */}
              <div className={`grid gap-2 ${(allowPartialPay && allowPayAtHotel) ? "grid-cols-3" : allowPartialPay || allowPayAtHotel ? "grid-cols-2" : "grid-cols-1"}`}>
                {([
                  { val: "PAY_NOW" as const, label: "Pay Full Now", Icon: CreditCard, show: true },
                  { val: "PAY_PARTIAL" as const, label: "Pay ₹200 Now", Icon: SplitSquareHorizontal, show: allowPartialPay },
                  { val: "PAY_AT_HOTEL" as const, label: "Pay at Hotel", Icon: Banknote, show: allowPayAtHotel },
                ] as const).filter((m) => m.show).map(({ val, label, Icon }) => (
                  <button key={val} onClick={() => setPayMode(val)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all ${payMode === val ? "border-amber-400/45 bg-amber-400/10" : "border-white/8 bg-white/3 hover:border-white/15"}`}>
                    <Icon className={`w-4 h-4 ${payMode === val ? "text-amber-400" : "text-white/35"}`} />
                    <span className={`text-xs font-bold ${payMode === val ? "text-white" : "text-white/55"}`}>{label}</span>
                  </button>
                ))}
              </div>

              {/* Terms */}
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 w-4 h-4 accent-amber-500" />
                <span className="text-[11px] text-white/45 leading-relaxed">
                  I agree to the{" "}
                  <a href="/terms" target="_blank" className="text-amber-400 underline">Terms</a>,{" "}
                  <a href="/privacy" target="_blank" className="text-amber-400 underline">Privacy</a> &amp;{" "}
                  <a href="/refund-policy" target="_blank" className="text-amber-400 underline">Cancellation Policy</a>.
                </span>
              </label>

              <button onClick={checkout} disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-black font-bold py-3.5 rounded-xl transition-all">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : payMode === "PAY_NOW" || payMode === "PAY_PARTIAL" ? <CheckCircle className="w-5 h-5" /> : <ArrowRight className="w-5 h-5" />}
                {loading
                  ? "Processing…"
                  : payMode === "PAY_NOW"
                  ? `Pay ₹${grandTotal.toLocaleString("en-IN")}`
                  : payMode === "PAY_PARTIAL"
                  ? `Pay ₹${totalDeposit.toLocaleString("en-IN")} Deposit & Reserve`
                  : "Reserve · Pay at Hotel"}
              </button>
              {payMode === "PAY_PARTIAL" && (
                <p className="text-center text-[11px] text-white/30 -mt-1">
                  ₹{totalDeposit.toLocaleString("en-IN")} deposit now · ₹{(grandTotal - totalDeposit).toLocaleString("en-IN")} balance at check-in
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
