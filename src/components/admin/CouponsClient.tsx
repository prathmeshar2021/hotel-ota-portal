"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  TicketPercent,
  Copy,
  Check,
  Loader2,
  Send,
  Power,
  Trash2,
  IndianRupee,
  Percent,
  Sparkles,
  Megaphone,
  Layers,
  Tag,
} from "lucide-react";

export interface CouponRow {
  id: string;
  code: string;
  kind: "INSTANT" | "SEASONAL";
  discountType: "FLAT" | "PERCENT";
  discountValue: number;
  minAmount: number;
  maxDiscount: number | null;
  maxUses: number | null;
  usedCount: number;
  label: string | null;
  isActive: boolean;
  isUniversal: boolean;
  stacksOnUniversal: boolean;
  expiryDate: string | null;
  createdAt: string;
  promotionName: string | null;
}

export interface PromotionOption {
  id: string;
  name: string;
}

const QUICK_FLAT = [100, 200, 300, 500];
const QUICK_PERCENT = [5, 10, 15, 25];
const QUICK_VALIDITY = [3, 7, 15, 30];

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function discountText(c: { discountType: string; discountValue: number }) {
  return c.discountType === "PERCENT"
    ? `${c.discountValue}% off`
    : `₹${c.discountValue.toLocaleString("en-IN")} off`;
}

export default function CouponsClient({
  initialCoupons,
  promotions,
  initialUniversal = null,
}: {
  initialCoupons: CouponRow[];
  promotions: PromotionOption[];
  initialUniversal?: CouponRow | null;
}) {
  const [coupons, setCoupons] = useState<CouponRow[]>(initialCoupons);

  // form state
  const [discountType, setDiscountType] = useState<"FLAT" | "PERCENT">("FLAT");
  const [amount, setAmount] = useState<number>(200);
  const [customAmount, setCustomAmount] = useState("");
  const [validityDays, setValidityDays] = useState<number>(3);
  const [customValidity, setCustomValidity] = useState("");
  const [keyword, setKeyword] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxDiscount, setMaxDiscount] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [promotionId, setPromotionId] = useState("");
  // true = coupon stacks on top of the universal discount (default); false = base price only
  const [stacksOnUniversal, setStacksOnUniversal] = useState(true);
  const [generating, setGenerating] = useState(false);

  // ── Universal / marketing discount config ──
  const [universal, setUniversal] = useState<CouponRow | null>(initialUniversal);
  const [uType, setUType] = useState<"FLAT" | "PERCENT">(initialUniversal?.discountType ?? "FLAT");
  const [uValue, setUValue] = useState<string>(initialUniversal ? String(initialUniversal.discountValue) : "200");
  const [uLabel, setULabel] = useState<string>(initialUniversal?.label ?? "Marketing Discount");
  const [savingUniversal, setSavingUniversal] = useState(false);

  async function saveUniversal() {
    const val = Number(uValue);
    if (!Number.isFinite(val) || val <= 0) {
      toast.error("Enter a valid discount value");
      return;
    }
    if (uType === "PERCENT" && val > 100) {
      toast.error("Percent discount cannot exceed 100");
      return;
    }
    setSavingUniversal(true);
    try {
      const res = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isUniversal: true,
          discountType: uType,
          discountValue: val,
          label: uLabel || "Marketing Discount",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      // Retire the old universal in the list, add the new one
      setCoupons((prev) =>
        [data.coupon, ...prev.map((c) => (c.isUniversal ? { ...c, isActive: false } : c))]
      );
      setUniversal(data.coupon);
      toast.success("Marketing discount is now live for all guests!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingUniversal(false);
    }
  }

  async function disableUniversal() {
    if (!universal) return;
    if (!confirm("Turn off the hotel-wide marketing discount?")) return;
    try {
      const res = await fetch(`/api/admin/coupons/${universal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      });
      if (!res.ok) throw new Error();
      setCoupons((prev) => prev.map((c) => (c.id === universal.id ? { ...c, isActive: false } : c)));
      setUniversal(null);
      toast.success("Marketing discount turned off");
    } catch {
      toast.error("Failed to turn off");
    }
  }

  // last generated
  const [generated, setGenerated] = useState<CouponRow | null>(null);
  const [copied, setCopied] = useState(false);
  const [phone, setPhone] = useState("");
  const [guestName, setGuestName] = useState("");
  const [sending, setSending] = useState(false);

  const effAmount = customAmount ? Number(customAmount) : amount;
  const effValidity = customValidity ? Number(customValidity) : validityDays;

  async function handleGenerate() {
    if (!Number.isFinite(effAmount) || effAmount <= 0) {
      toast.error("Enter a valid discount amount");
      return;
    }
    if (discountType === "PERCENT" && effAmount > 100) {
      toast.error("Percent discount cannot exceed 100");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discountType,
          discountValue: effAmount,
          validityDays: effValidity,
          keyword: keyword || undefined,
          minAmount: minAmount || undefined,
          maxDiscount: maxDiscount || undefined,
          maxUses: maxUses || undefined,
          promotionId: promotionId || undefined,
          stacksOnUniversal,
          kind: promotionId ? "SEASONAL" : "INSTANT",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate");
      setGenerated(data.coupon);
      setCoupons((prev) => [data.coupon, ...prev]);
      setCopied(false);
      setPhone("");
      setGuestName("");
      toast.success("Coupon generated!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setGenerating(false);
    }
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Code copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy");
    }
  }

  async function sendWhatsApp() {
    if (!generated) return;
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length < 10) {
      toast.error("Enter a valid phone number");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/admin/coupons/${generated.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleaned, guestName: guestName || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");
      toast.success("Coupon sent on WhatsApp!");
      setPhone("");
      setGuestName("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  async function toggleActive(c: CouponRow) {
    try {
      const res = await fetch(`/api/admin/coupons/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !c.isActive }),
      });
      if (!res.ok) throw new Error();
      setCoupons((prev) =>
        prev.map((x) => (x.id === c.id ? { ...x, isActive: !x.isActive } : x))
      );
    } catch {
      toast.error("Failed to update");
    }
  }

  async function deleteCoupon(c: CouponRow) {
    if (!confirm(`Delete coupon ${c.code}? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/coupons/${c.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to delete");
      setCoupons((prev) => prev.filter((x) => x.id !== c.id));
      toast.success("Coupon deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  const quickAmounts = discountType === "PERCENT" ? QUICK_PERCENT : QUICK_FLAT;
  const regularCoupons = coupons.filter((c) => !c.isUniversal);

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <p className="text-amber-400/70 text-xs font-bold tracking-[0.2em] uppercase mb-1">
          Owner Console
        </p>
        <h1 className="text-2xl lg:text-3xl font-bold text-white flex items-center gap-2">
          <TicketPercent className="w-6 h-6 text-pink-400" /> Coupons
        </h1>
        <p className="text-white/40 text-sm mt-1">
          Generate instant discount codes and share them on WhatsApp.
        </p>
      </div>

      {/* ── Marketing (universal) discount card ── */}
      <div className="rounded-2xl border border-violet-500/25 bg-violet-500/[0.06] p-5 lg:p-6 mb-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center shrink-0">
            <Megaphone className="w-4.5 h-4.5 text-violet-300" />
          </div>
          <div className="flex-1">
            <h2 className="text-white font-bold text-base">Marketing Discount</h2>
            <p className="text-white/45 text-xs mt-0.5 leading-relaxed">
              A hotel-wide discount auto-applied to every guest. Prices show the original
              struck-through with the lower price — so no one&apos;s coupon box ever feels empty.
            </p>
          </div>
        </div>

        {universal && (
          <div className="flex items-center gap-2 flex-wrap mb-4 rounded-xl bg-violet-500/10 border border-violet-500/20 px-3 py-2">
            <span className="text-violet-200 text-sm font-bold">
              {universal.discountType === "PERCENT"
                ? `${universal.discountValue}% off`
                : `₹${universal.discountValue.toLocaleString("en-IN")} off`}
            </span>
            <span className="text-violet-300/60 text-xs">· code</span>
            <span className="font-mono font-bold text-violet-200 text-xs">{universal.code}</span>
            <span className="ml-auto flex items-center gap-1 text-[10px] font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> LIVE
            </span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex gap-2">
            <button
              onClick={() => setUType("FLAT")}
              className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                uType === "FLAT"
                  ? "bg-violet-500/20 border-violet-500/40 text-violet-200"
                  : "bg-white/5 border-white/10 text-white/50 hover:text-white"
              }`}
            >
              <IndianRupee className="w-4 h-4" /> Flat
            </button>
            <button
              onClick={() => setUType("PERCENT")}
              className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                uType === "PERCENT"
                  ? "bg-violet-500/20 border-violet-500/40 text-violet-200"
                  : "bg-white/5 border-white/10 text-white/50 hover:text-white"
              }`}
            >
              <Percent className="w-4 h-4" /> Percent
            </button>
          </div>
          <input
            type="number"
            placeholder={uType === "PERCENT" ? "e.g. 10" : "e.g. 200"}
            value={uValue}
            onChange={(e) => setUValue(e.target.value)}
            className="w-full sm:w-32 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-violet-400/50"
          />
          <input
            type="text"
            placeholder="Label (e.g. Summer Sale)"
            value={uLabel}
            onChange={(e) => setULabel(e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-violet-400/50"
          />
        </div>

        <div className="flex gap-2 mt-3">
          <button
            onClick={saveUniversal}
            disabled={savingUniversal}
            className="flex items-center justify-center gap-2 bg-violet-500 hover:bg-violet-400 disabled:opacity-60 text-white font-bold px-5 py-2.5 rounded-xl transition-all"
          >
            {savingUniversal ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />}
            {universal ? "Update Discount" : "Go Live"}
          </button>
          {universal && (
            <button
              onClick={disableUniversal}
              className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white font-semibold px-4 py-2.5 rounded-xl transition-all"
            >
              <Power className="w-4 h-4" /> Turn Off
            </button>
          )}
        </div>
      </div>

      {/* Generator card */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 lg:p-6 mb-8">
        {/* Discount type toggle */}
        <div className="flex gap-2 mb-5">
          <button
            onClick={() => {
              setDiscountType("FLAT");
              setAmount(200);
              setCustomAmount("");
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
              discountType === "FLAT"
                ? "bg-pink-500/15 border-pink-500/30 text-pink-300"
                : "bg-white/5 border-white/10 text-white/50 hover:text-white"
            }`}
          >
            <IndianRupee className="w-4 h-4" /> Flat Amount
          </button>
          <button
            onClick={() => {
              setDiscountType("PERCENT");
              setAmount(10);
              setCustomAmount("");
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
              discountType === "PERCENT"
                ? "bg-pink-500/15 border-pink-500/30 text-pink-300"
                : "bg-white/5 border-white/10 text-white/50 hover:text-white"
            }`}
          >
            <Percent className="w-4 h-4" /> Percentage
          </button>
        </div>

        {/* Quick amounts */}
        <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">
          Discount {discountType === "PERCENT" ? "Percentage" : "Amount"}
        </label>
        <div className="flex flex-wrap gap-2 mb-3">
          {quickAmounts.map((a) => (
            <button
              key={a}
              onClick={() => {
                setAmount(a);
                setCustomAmount("");
              }}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${
                !customAmount && amount === a
                  ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                  : "bg-white/5 border-white/10 text-white/60 hover:text-white"
              }`}
            >
              {discountType === "PERCENT" ? `${a}%` : `₹${a}`}
            </button>
          ))}
          <input
            type="number"
            placeholder="Custom"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            className="w-28 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/50"
          />
        </div>

        {/* Validity */}
        <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-2 mt-4">
          Validity (days) · default 3
        </label>
        <div className="flex flex-wrap gap-2 mb-3">
          {QUICK_VALIDITY.map((d) => (
            <button
              key={d}
              onClick={() => {
                setValidityDays(d);
                setCustomValidity("");
              }}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${
                !customValidity && validityDays === d
                  ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                  : "bg-white/5 border-white/10 text-white/60 hover:text-white"
              }`}
            >
              {d}d
            </button>
          ))}
          <input
            type="number"
            placeholder="Custom"
            value={customValidity}
            onChange={(e) => setCustomValidity(e.target.value)}
            className="w-28 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/50"
          />
        </div>

        {/* Optional advanced */}
        <div className="grid sm:grid-cols-2 gap-3 mt-4">
          <div>
            <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
              Keyword in code (optional)
            </label>
            <input
              type="text"
              placeholder="e.g. WELCOME"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/50"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
              Link to promotion (optional)
            </label>
            <select
              value={promotionId}
              onChange={(e) => setPromotionId(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400/50"
            >
              <option value="" className="bg-[#0d0a04]">None (instant)</option>
              {promotions.map((p) => (
                <option key={p.id} value={p.id} className="bg-[#0d0a04]">
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
              Min booking amount (optional)
            </label>
            <input
              type="number"
              placeholder="0"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/50"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {discountType === "PERCENT" && (
              <div>
                <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
                  Max discount cap
                </label>
                <input
                  type="number"
                  placeholder="No cap"
                  value={maxDiscount}
                  onChange={(e) => setMaxDiscount(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/50"
                />
              </div>
            )}
            <div className={discountType === "PERCENT" ? "" : "col-span-2"}>
              <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
                Max uses
              </label>
              <input
                type="number"
                placeholder="Unlimited"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/50"
              />
            </div>
          </div>
        </div>

        {/* Stacking with the marketing discount */}
        <div className="mt-5">
          <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-2">
            Applies on
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setStacksOnUniversal(true)}
              className={`flex flex-col items-start gap-1 px-3.5 py-3 rounded-xl border text-left transition-all ${
                stacksOnUniversal
                  ? "bg-violet-500/15 border-violet-500/40"
                  : "bg-white/5 border-white/10 hover:border-white/20"
              }`}
            >
              <span className={`flex items-center gap-1.5 text-sm font-bold ${stacksOnUniversal ? "text-violet-200" : "text-white/60"}`}>
                <Layers className="w-3.5 h-3.5" /> Discounted price
              </span>
              <span className="text-[11px] text-white/40 leading-snug">
                Stacks on top of the marketing discount (default)
              </span>
            </button>
            <button
              type="button"
              onClick={() => setStacksOnUniversal(false)}
              className={`flex flex-col items-start gap-1 px-3.5 py-3 rounded-xl border text-left transition-all ${
                !stacksOnUniversal
                  ? "bg-amber-500/15 border-amber-500/40"
                  : "bg-white/5 border-white/10 hover:border-white/20"
              }`}
            >
              <span className={`flex items-center gap-1.5 text-sm font-bold ${!stacksOnUniversal ? "text-amber-300" : "text-white/60"}`}>
                <Tag className="w-3.5 h-3.5" /> Base price
              </span>
              <span className="text-[11px] text-white/40 leading-snug">
                Replaces the marketing discount for this coupon
              </span>
            </button>
          </div>
          {universal && (
            <p className="text-[11px] text-white/35 mt-2 leading-relaxed">
              {stacksOnUniversal ? (
                <>
                  Total saving = <span className="text-violet-300 font-semibold">marketing discount + this coupon</span>.
                  {discountType === "FLAT" && (
                    <> A ₹{effAmount || 0} coupon on top of the current ₹
                    {universal.discountType === "FLAT" ? universal.discountValue : `${universal.discountValue}%`} marketing
                    discount.</>
                  )}
                </>
              ) : (
                <>Guest gets <span className="text-amber-300 font-semibold">only this coupon</span> off the original price.</>
              )}
            </p>
          )}
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating}
          className="w-full mt-5 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-black font-bold py-3 rounded-xl transition-all shadow-lg shadow-amber-500/20"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Generate Coupon
        </button>
      </div>

      {/* Generated result */}
      {generated && (
        <div className="rounded-2xl border border-pink-500/30 bg-pink-500/[0.06] p-5 lg:p-6 mb-8">
          <p className="text-pink-300/80 text-xs font-bold uppercase tracking-wider mb-3">
            Generated Coupon
          </p>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <span className="text-2xl lg:text-3xl font-black text-white tracking-wider font-mono">
                  {generated.code}
                </span>
                <button
                  onClick={() => copyCode(generated.code)}
                  className="flex items-center gap-1.5 bg-white/10 hover:bg-white/15 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-all"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="text-white/50 text-sm mt-1.5">
                {discountText(generated)} · expires {fmtDate(generated.expiryDate)}
              </p>
            </div>
          </div>

          {/* WhatsApp send */}
          <div className="border-t border-white/10 pt-4">
            <p className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-2">
              Send to guest on WhatsApp (optional)
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="Guest name (optional)"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/50"
              />
              <input
                type="tel"
                placeholder="WhatsApp number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/50"
              />
              <button
                onClick={sendWhatsApp}
                disabled={sending}
                className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-black font-bold px-5 py-2.5 rounded-xl transition-all whitespace-nowrap"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Coupon list (universal/marketing discount shown separately above) */}
      <h2 className="text-white/60 text-sm font-semibold uppercase tracking-wider mb-3">
        All Coupons ({regularCoupons.length})
      </h2>
      <div className="space-y-2">
        {regularCoupons.length === 0 && (
          <p className="text-white/30 text-sm py-8 text-center">No coupons yet.</p>
        )}
        {regularCoupons.map((c) => {
          const expired = c.expiryDate && new Date(c.expiryDate) < new Date();
          return (
            <div
              key={c.id}
              className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-white text-sm">{c.code}</span>
                  {c.kind === "SEASONAL" && (
                    <span className="text-[10px] font-bold text-fuchsia-300 bg-fuchsia-500/10 border border-fuchsia-500/20 px-1.5 py-0.5 rounded-full">
                      {c.promotionName ?? "SEASONAL"}
                    </span>
                  )}
                  {!c.isActive && (
                    <span className="text-[10px] font-bold text-white/40 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded-full">
                      INACTIVE
                    </span>
                  )}
                  {expired && c.isActive && (
                    <span className="text-[10px] font-bold text-red-300 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded-full">
                      EXPIRED
                    </span>
                  )}
                </div>
                <p className="text-white/40 text-xs mt-0.5">
                  {discountText(c)} · {c.usedCount}
                  {c.maxUses ? `/${c.maxUses}` : ""} used · exp {fmtDate(c.expiryDate)}
                </p>
              </div>
              <button
                onClick={() => copyCode(c.code)}
                title="Copy code"
                className="text-white/30 hover:text-white p-2 rounded-lg hover:bg-white/5 transition-all"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button
                onClick={() => toggleActive(c)}
                title={c.isActive ? "Deactivate" : "Activate"}
                className={`p-2 rounded-lg transition-all ${
                  c.isActive
                    ? "text-emerald-400 hover:bg-emerald-500/10"
                    : "text-white/30 hover:bg-white/5"
                }`}
              >
                <Power className="w-4 h-4" />
              </button>
              {c.usedCount === 0 && (
                <button
                  onClick={() => deleteCoupon(c)}
                  title="Delete"
                  className="text-white/30 hover:text-red-400 p-2 rounded-lg hover:bg-red-500/8 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
