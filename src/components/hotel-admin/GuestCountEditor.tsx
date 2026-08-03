"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Users, Loader2, Check, Pencil, X } from "lucide-react";

interface Props {
  bookingId: string;
  noOfPersons: number;
  /** Closed stays are read-only — nothing left to change. */
  editable: boolean;
}

/**
 * Inline guest-count editor. A phone booking is often taken before the number
 * is known, and parties change on arrival, so this stays adjustable without
 * reopening the whole booking.
 */
export default function GuestCountEditor({ bookingId, noOfPersons, editable }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(noOfPersons);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (value === noOfPersons) { setEditing(false); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/hotel-admin/bookings/${bookingId}/guests-count`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noOfPersons: value }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Could not update guests"); return; }
      // Over-capacity is allowed but flagged, so staff can grab a mattress.
      if (data.overCapacity) toast.warning(data.message);
      else toast.success(data.message);
      setEditing(false);
      router.refresh();
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setSaving(false);
    }
  }

  if (!editable) {
    return <span className="text-white/75 text-sm">{noOfPersons} guest{noOfPersons !== 1 ? "s" : ""}</span>;
  }

  if (!editing) {
    return (
      <button
        onClick={() => { setValue(noOfPersons); setEditing(true); }}
        className="group flex items-center gap-1.5 text-white/75 text-sm hover:text-white transition-colors"
      >
        {noOfPersons} guest{noOfPersons !== 1 ? "s" : ""}
        <Pencil className="w-3 h-3 text-white/25 group-hover:text-white/60 transition-colors" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5, 6].map(n => (
          <button key={n} onClick={() => setValue(n)} disabled={saving}
            className={`w-7 h-7 rounded-lg text-[11px] font-bold border transition-all disabled:opacity-50 ${
              value === n
                ? "bg-blue-500 text-white border-blue-400"
                : "bg-white/5 border-white/10 text-white/50 hover:text-white/80"
            }`}>
            {n}
          </button>
        ))}
      </div>
      <button onClick={save} disabled={saving}
        className="flex items-center gap-1 text-[11px] font-bold px-2 py-1.5 rounded-lg bg-green-500/15 border border-green-500/30 text-green-300 hover:bg-green-500/25 transition-all disabled:opacity-50">
        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
      </button>
      <button onClick={() => setEditing(false)} disabled={saving}
        className="text-white/30 hover:text-white/60 p-1 transition-colors disabled:opacity-50">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
