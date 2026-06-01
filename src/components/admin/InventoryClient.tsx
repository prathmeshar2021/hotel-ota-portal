"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarRange, Loader2, Trash2, BedDouble } from "lucide-react";

export interface InvCategory {
  roomType: string;
  displayName: string;
  group: string;
  defaultUnits: number;
}

export interface InvOverride {
  id: string;
  roomType: string;
  date: string; // YYYY-MM-DD
  units: number;
  note: string | null;
}

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function InventoryClient({
  categories,
  overrides,
}: {
  categories: InvCategory[];
  overrides: InvOverride[];
}) {
  const router = useRouter();

  const [roomType, setRoomType] = useState(categories[0]?.roomType ?? "");
  const [units, setUnits] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const nameByType = Object.fromEntries(categories.map((c) => [c.roomType, c.displayName]));
  const defByType = Object.fromEntries(categories.map((c) => [c.roomType, c.defaultUnits]));
  const selectedDefault = defByType[roomType];

  async function save() {
    if (!roomType) return toast.error("Select a category");
    if (units === "" || Number(units) < 0 || !Number.isInteger(Number(units)))
      return toast.error("Enter valid units (whole number)");
    if (!fromDate) return toast.error("Select a start date");
    const effTo = toDate || fromDate;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomType,
          units: Number(units),
          fromDate,
          toDate: effTo,
          note: note || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(`Inventory set for ${data.count} day${data.count === 1 ? "" : "s"}`);
      setUnits("");
      setFromDate("");
      setToDate("");
      setNote("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(o: InvOverride) {
    if (!confirm(`Reset ${nameByType[o.roomType]} on ${fmtDate(o.date)} to default?`)) return;
    try {
      const res = await fetch(`/api/admin/inventory?id=${o.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Reverted to default");
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
          <CalendarRange className="w-6 h-6 text-cyan-400" /> Inventory
        </h1>
        <p className="text-white/40 text-sm mt-1">
          Limit sellable rooms per category for specific dates (e.g. maintenance,
          owner blocks). Leave a date unset to use the default count.
        </p>
      </div>

      {/* Default capacities */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6">
        {categories.map((c) => (
          <div
            key={c.roomType}
            className="rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5"
          >
            <p className="text-white/70 text-xs font-semibold truncate">{c.displayName}</p>
            <p className="text-white/40 text-[11px] flex items-center gap-1 mt-0.5">
              <BedDouble className="w-3 h-3" /> {c.defaultUnits} default
            </p>
          </div>
        ))}
      </div>

      {/* Set form */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 mb-8">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
              Category
            </label>
            <select
              value={roomType}
              onChange={(e) => setRoomType(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-400/50"
            >
              {categories.map((c) => (
                <option key={c.roomType} value={c.roomType} className="bg-[#0d0a04]">
                  {c.displayName} (default {c.defaultUnits})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
              Available units {selectedDefault != null && `(0–${selectedDefault}+)`}
            </label>
            <input
              type="number"
              min={0}
              placeholder="e.g. 2"
              value={units}
              onChange={(e) => setUnits(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/50"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
              From date
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-400/50 [color-scheme:dark]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
              To date (optional — single day if blank)
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-400/50 [color-scheme:dark]"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
              Note (optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Renovation, owner block"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/50"
            />
          </div>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="w-full mt-4 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-black font-bold py-3 rounded-xl transition-all"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarRange className="w-4 h-4" />}
          Set Inventory
        </button>
      </div>

      {/* Existing overrides */}
      <h2 className="text-white/60 text-sm font-semibold uppercase tracking-wider mb-3">
        Upcoming Adjustments ({overrides.length})
      </h2>
      <div className="space-y-2">
        {overrides.length === 0 && (
          <p className="text-white/30 text-sm py-8 text-center">
            No inventory adjustments. All categories at default capacity.
          </p>
        )}
        {overrides.map((o) => (
          <div
            key={o.id}
            className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-white font-semibold text-sm">
                  {nameByType[o.roomType] ?? o.roomType}
                </span>
                <span
                  className={`text-sm font-bold ${
                    o.units === 0 ? "text-red-400" : "text-cyan-300"
                  }`}
                >
                  {o.units} unit{o.units === 1 ? "" : "s"}
                </span>
                <span className="text-white/30 text-xs">
                  (default {defByType[o.roomType]})
                </span>
                {o.note && (
                  <span className="text-[10px] font-bold text-white/50 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded-full">
                    {o.note}
                  </span>
                )}
              </div>
              <p className="text-white/40 text-xs mt-0.5">{fmtDate(o.date)}</p>
            </div>
            <button
              onClick={() => remove(o)}
              title="Reset to default"
              className="text-white/30 hover:text-red-400 p-2 rounded-lg hover:bg-red-500/8 transition-all"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
