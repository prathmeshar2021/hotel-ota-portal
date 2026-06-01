"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Tag, Loader2, CalendarRange, Check, Trash2, IndianRupee } from "lucide-react";

export interface CategoryPricing {
  roomType: string;
  displayName: string;
  group: string;
  roomCount: number;
  basePrice: number;
}

export interface RateOverride {
  roomType: string;
  fromDate: string;
  toDate: string;
  price: number;
  label: string | null;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function PricingClient({
  categories,
  overrides,
}: {
  categories: CategoryPricing[];
  overrides: RateOverride[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"bulk" | "dates">("bulk");

  // bulk base-price edits
  const [prices, setPrices] = useState<Record<string, string>>(
    Object.fromEntries(categories.map((c) => [c.roomType, String(c.basePrice)]))
  );
  const [savingType, setSavingType] = useState<string | null>(null);

  // date override form
  const [ovType, setOvType] = useState(categories[0]?.roomType ?? "");
  const [ovPrice, setOvPrice] = useState("");
  const [ovFrom, setOvFrom] = useState("");
  const [ovTo, setOvTo] = useState("");
  const [ovLabel, setOvLabel] = useState("");
  const [savingOv, setSavingOv] = useState(false);

  const nameByType = Object.fromEntries(
    categories.map((c) => [c.roomType, c.displayName])
  );

  async function saveBulk(roomType: string) {
    const price = Number(prices[roomType]);
    if (!Number.isFinite(price) || price <= 0) {
      toast.error("Enter a valid price");
      return;
    }
    setSavingType(roomType);
    try {
      const res = await fetch("/api/admin/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "bulk", roomType, price }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      toast.success(`${nameByType[roomType]} base price updated`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSavingType(null);
    }
  }

  async function saveOverride() {
    const price = Number(ovPrice);
    if (!ovType) return toast.error("Select a category");
    if (!Number.isFinite(price) || price <= 0) return toast.error("Enter a valid price");
    if (!ovFrom || !ovTo) return toast.error("Select both dates");
    setSavingOv(true);
    try {
      const res = await fetch("/api/admin/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "dates",
          roomType: ovType,
          price,
          fromDate: ovFrom,
          toDate: ovTo,
          label: ovLabel || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      toast.success("Date-wise price added");
      setOvPrice("");
      setOvFrom("");
      setOvTo("");
      setOvLabel("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSavingOv(false);
    }
  }

  async function deleteOverride(o: RateOverride) {
    if (!confirm(`Remove ${nameByType[o.roomType]} override (${fmtDate(o.fromDate)}–${fmtDate(o.toDate)})?`))
      return;
    try {
      const qs = new URLSearchParams({
        roomType: o.roomType,
        fromDate: o.fromDate,
        toDate: o.toDate,
        price: String(o.price),
      });
      const res = await fetch(`/api/admin/pricing?${qs}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Override removed");
      router.refresh();
    } catch {
      toast.error("Failed to remove");
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <p className="text-amber-400/70 text-xs font-bold tracking-[0.2em] uppercase mb-1">
          Owner Console
        </p>
        <h1 className="text-2xl lg:text-3xl font-bold text-white flex items-center gap-2">
          <Tag className="w-6 h-6 text-amber-400" /> Room Pricing
        </h1>
        <p className="text-white/40 text-sm mt-1">
          Update base prices in bulk, or set special date-wise rates.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab("bulk")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
            tab === "bulk"
              ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
              : "bg-white/5 border-white/10 text-white/50 hover:text-white"
          }`}
        >
          <IndianRupee className="w-4 h-4" /> Base Prices
        </button>
        <button
          onClick={() => setTab("dates")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
            tab === "dates"
              ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
              : "bg-white/5 border-white/10 text-white/50 hover:text-white"
          }`}
        >
          <CalendarRange className="w-4 h-4" /> Date-wise
        </button>
      </div>

      {tab === "bulk" && (
        <div className="space-y-2">
          {categories.map((c) => (
            <div
              key={c.roomType}
              className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm">{c.displayName}</p>
                <p className="text-white/35 text-xs">
                  {c.group} · {c.roomCount} room{c.roomCount === 1 ? "" : "s"}
                </p>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">
                  ₹
                </span>
                <input
                  type="number"
                  value={prices[c.roomType] ?? ""}
                  onChange={(e) =>
                    setPrices((p) => ({ ...p, [c.roomType]: e.target.value }))
                  }
                  className="w-32 bg-white/5 border border-white/10 rounded-xl pl-7 pr-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400/50"
                />
              </div>
              <button
                onClick={() => saveBulk(c.roomType)}
                disabled={savingType === c.roomType}
                className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-black font-bold text-sm px-4 py-2 rounded-xl transition-all"
              >
                {savingType === c.roomType ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                Save
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === "dates" && (
        <div>
          {/* Override form */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 mb-8">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
                  Category
                </label>
                <select
                  value={ovType}
                  onChange={(e) => setOvType(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-400/50"
                >
                  {categories.map((c) => (
                    <option key={c.roomType} value={c.roomType} className="bg-[#0d0a04]">
                      {c.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
                  Price / night
                </label>
                <input
                  type="number"
                  placeholder="e.g. 3500"
                  value={ovPrice}
                  onChange={(e) => setOvPrice(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/50"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
                  From
                </label>
                <input
                  type="date"
                  value={ovFrom}
                  onChange={(e) => setOvFrom(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-400/50 [color-scheme:dark]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
                  To
                </label>
                <input
                  type="date"
                  value={ovTo}
                  onChange={(e) => setOvTo(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-400/50 [color-scheme:dark]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
                  Label (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. New Year Peak"
                  value={ovLabel}
                  onChange={(e) => setOvLabel(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/50"
                />
              </div>
            </div>
            <button
              onClick={saveOverride}
              disabled={savingOv}
              className="w-full mt-4 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-black font-bold py-3 rounded-xl transition-all"
            >
              {savingOv ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarRange className="w-4 h-4" />}
              Add Date-wise Price
            </button>
          </div>

          {/* Existing overrides */}
          <h2 className="text-white/60 text-sm font-semibold uppercase tracking-wider mb-3">
            Upcoming Overrides ({overrides.length})
          </h2>
          <div className="space-y-2">
            {overrides.length === 0 && (
              <p className="text-white/30 text-sm py-8 text-center">
                No date-wise prices set.
              </p>
            )}
            {overrides.map((o, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-semibold text-sm">
                      {nameByType[o.roomType] ?? o.roomType}
                    </span>
                    <span className="text-amber-300 font-bold text-sm">
                      ₹{o.price.toLocaleString("en-IN")}
                    </span>
                    {o.label && (
                      <span className="text-[10px] font-bold text-white/50 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded-full">
                        {o.label}
                      </span>
                    )}
                  </div>
                  <p className="text-white/40 text-xs mt-0.5">
                    {fmtDate(o.fromDate)} → {fmtDate(o.toDate)}
                  </p>
                </div>
                <button
                  onClick={() => deleteOverride(o)}
                  title="Remove"
                  className="text-white/30 hover:text-red-400 p-2 rounded-lg hover:bg-red-500/8 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
