"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Sparkles,
  Loader2,
  Power,
  IndianRupee,
  Percent,
  Plus,
  CalendarRange,
  Tag,
} from "lucide-react";

export interface PromotionRow {
  id: string;
  name: string;
  keyword: string | null;
  description: string | null;
  discountType: "FLAT" | "PERCENT";
  discountValue: number;
  minAmount: number;
  maxDiscount: number | null;
  validFrom: string | null;
  validTo: string | null;
  isActive: boolean;
  couponCount: number;
  createdAt: string;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function PromotionsClient({
  initialPromotions,
}: {
  initialPromotions: PromotionRow[];
}) {
  const [promotions, setPromotions] = useState<PromotionRow[]>(initialPromotions);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [keyword, setKeyword] = useState("");
  const [description, setDescription] = useState("");
  const [discountType, setDiscountType] = useState<"FLAT" | "PERCENT">("FLAT");
  const [discountValue, setDiscountValue] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxDiscount, setMaxDiscount] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [saving, setSaving] = useState(false);

  function resetForm() {
    setName("");
    setKeyword("");
    setDescription("");
    setDiscountType("FLAT");
    setDiscountValue("");
    setMinAmount("");
    setMaxDiscount("");
    setValidFrom("");
    setValidTo("");
  }

  async function handleCreate() {
    if (!name.trim()) {
      toast.error("Scheme name is required");
      return;
    }
    const val = Number(discountValue);
    if (!Number.isFinite(val) || val <= 0) {
      toast.error("Enter a valid discount value");
      return;
    }
    if (discountType === "PERCENT" && val > 100) {
      toast.error("Percent discount cannot exceed 100");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          keyword: keyword || undefined,
          description: description || undefined,
          discountType,
          discountValue: val,
          minAmount: minAmount || undefined,
          maxDiscount: maxDiscount || undefined,
          validFrom: validFrom || undefined,
          validTo: validTo || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create");
      const created: PromotionRow = { ...data.promotion, couponCount: 0,
        validFrom: data.promotion.validFrom,
        validTo: data.promotion.validTo,
      };
      setPromotions((prev) => [created, ...prev]);
      resetForm();
      setShowForm(false);
      toast.success("Promotion scheme created!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(p: PromotionRow) {
    try {
      const res = await fetch(`/api/admin/promotions/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !p.isActive }),
      });
      if (!res.ok) throw new Error();
      setPromotions((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, isActive: !x.isActive } : x))
      );
    } catch {
      toast.error("Failed to update");
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-8 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-6 gap-3">
        <div>
          <p className="text-amber-400/70 text-xs font-bold tracking-[0.2em] uppercase mb-1">
            Owner Console
          </p>
          <h1 className="text-2xl lg:text-3xl font-bold text-white flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-fuchsia-400" /> Promotions
          </h1>
          <p className="text-white/40 text-sm mt-1">
            Seasonal campaigns. Link coupons to a scheme to track each promotion.
          </p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-amber-500/20 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" /> New Scheme
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 lg:p-6 mb-8">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
                Promotion / Scheme name *
              </label>
              <input
                type="text"
                placeholder="e.g. Summer Splash 2026"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/50"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
                Reference keyword (used in codes)
              </label>
              <input
                type="text"
                placeholder="e.g. SUMMER"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/50"
              />
            </div>
            <div className="flex gap-2 items-end">
              <button
                onClick={() => setDiscountType("FLAT")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                  discountType === "FLAT"
                    ? "bg-fuchsia-500/15 border-fuchsia-500/30 text-fuchsia-300"
                    : "bg-white/5 border-white/10 text-white/50"
                }`}
              >
                <IndianRupee className="w-4 h-4" /> Flat
              </button>
              <button
                onClick={() => setDiscountType("PERCENT")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                  discountType === "PERCENT"
                    ? "bg-fuchsia-500/15 border-fuchsia-500/30 text-fuchsia-300"
                    : "bg-white/5 border-white/10 text-white/50"
                }`}
              >
                <Percent className="w-4 h-4" /> Percent
              </button>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
                Discount value *
              </label>
              <input
                type="number"
                placeholder={discountType === "PERCENT" ? "e.g. 15" : "e.g. 500"}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/50"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
                Min booking amount
              </label>
              <input
                type="number"
                placeholder="0"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/50"
              />
            </div>
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
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/50"
                />
              </div>
            )}
            <div>
              <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
                Valid from
              </label>
              <input
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-400/50 [color-scheme:dark]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
                Valid to
              </label>
              <input
                type="date"
                value={validTo}
                onChange={(e) => setValidTo(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-400/50 [color-scheme:dark]"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
                Description / notes
              </label>
              <textarea
                rows={2}
                placeholder="Internal notes about this promotion"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/50 resize-none"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleCreate}
              disabled={saving}
              className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-black font-bold px-5 py-2.5 rounded-xl transition-all"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Create Scheme
            </button>
            <button
              onClick={() => {
                resetForm();
                setShowForm(false);
              }}
              className="px-5 py-2.5 rounded-xl text-white/50 hover:text-white hover:bg-white/5 text-sm font-semibold transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Promotions list */}
      <h2 className="text-white/60 text-sm font-semibold uppercase tracking-wider mb-3">
        Schemes ({promotions.length})
      </h2>
      <div className="space-y-3">
        {promotions.length === 0 && (
          <p className="text-white/30 text-sm py-8 text-center">
            No promotion schemes yet.
          </p>
        )}
        {promotions.map((p) => (
          <div
            key={p.id}
            className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 lg:p-5"
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-white font-bold">{p.name}</h3>
                  {p.keyword && (
                    <span className="text-[10px] font-bold text-fuchsia-300 bg-fuchsia-500/10 border border-fuchsia-500/20 px-1.5 py-0.5 rounded-full font-mono">
                      {p.keyword}
                    </span>
                  )}
                  {!p.isActive && (
                    <span className="text-[10px] font-bold text-white/40 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded-full">
                      INACTIVE
                    </span>
                  )}
                </div>
                {p.description && (
                  <p className="text-white/40 text-xs mt-1">{p.description}</p>
                )}
                <div className="flex items-center gap-3 flex-wrap mt-2 text-xs text-white/50">
                  <span className="flex items-center gap-1">
                    {p.discountType === "PERCENT" ? (
                      <Percent className="w-3.5 h-3.5 text-fuchsia-400" />
                    ) : (
                      <IndianRupee className="w-3.5 h-3.5 text-fuchsia-400" />
                    )}
                    {p.discountType === "PERCENT"
                      ? `${p.discountValue}% off`
                      : `₹${p.discountValue.toLocaleString("en-IN")} off`}
                    {p.maxDiscount ? ` (max ₹${p.maxDiscount})` : ""}
                  </span>
                  <span className="flex items-center gap-1">
                    <CalendarRange className="w-3.5 h-3.5 text-white/30" />
                    {fmtDate(p.validFrom)} → {fmtDate(p.validTo)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5 text-white/30" />
                    {p.couponCount} coupon{p.couponCount === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
              <button
                onClick={() => toggleActive(p)}
                title={p.isActive ? "Deactivate" : "Activate"}
                className={`p-2 rounded-lg transition-all shrink-0 ${
                  p.isActive
                    ? "text-emerald-400 hover:bg-emerald-500/10"
                    : "text-white/30 hover:bg-white/5"
                }`}
              >
                <Power className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
