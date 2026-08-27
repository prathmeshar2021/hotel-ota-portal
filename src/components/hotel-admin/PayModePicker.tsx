"use client";

/**
 * Cash / UPI / Mixed, wherever money changes hands.
 *
 * Mixed asks for both figures rather than assuming a split, because the till
 * has to know exactly how many notes came in. The two boxes stay tied to the
 * total: typing one sets the other, so they can never quietly disagree with the
 * amount being collected.
 */

export type PayMode = "CASH" | "ONLINE" | "MIXED";

export interface Split {
  mode: PayMode;
  cashAmount: number;
  onlineAmount: number;
}

/** The split for a given mode and total — the one place that maths lives. */
export function splitFor(mode: PayMode, total: number, cash: number): Split {
  const t = +Math.max(0, total).toFixed(2);
  if (mode === "CASH") return { mode, cashAmount: t, onlineAmount: 0 };
  if (mode === "ONLINE") return { mode, cashAmount: 0, onlineAmount: t };
  const c = +Math.min(Math.max(0, cash), t).toFixed(2);
  return { mode, cashAmount: c, onlineAmount: +(t - c).toFixed(2) };
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export default function PayModePicker({
  mode,
  total,
  cashAmount,
  onChange,
  label = "Paid by",
  allowMixed = true,
  compact = false,
}: {
  mode: PayMode;
  /** The full amount being taken or given back. */
  total: number;
  /** The cash side, when mode is MIXED. */
  cashAmount: number;
  onChange: (s: Split) => void;
  label?: string;
  allowMixed?: boolean;
  compact?: boolean;
}) {
  const options: { key: PayMode; text: string }[] = [
    { key: "CASH", text: "Cash" },
    { key: "ONLINE", text: "UPI / Card" },
    ...(allowMixed ? [{ key: "MIXED" as const, text: "Both" }] : []),
  ];

  const s = splitFor(mode, total, cashAmount);

  return (
    <div className={compact ? "" : "mb-3"}>
      {label && (
        <p className="text-[10px] text-white/35 uppercase tracking-wider font-semibold mb-1.5">{label}</p>
      )}
      <div className="flex gap-2">
        {options.map(o => (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(splitFor(o.key, total, o.key === "MIXED" ? Math.round(total / 2) : cashAmount))}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
              mode === o.key
                ? "bg-white/10 border-white/25 text-white"
                : "border-white/10 text-white/40 hover:text-white/70"
            }`}
          >
            {o.text}
          </button>
        ))}
      </div>

      {mode === "MIXED" && (
        <div className="mt-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[10px] text-green-400/60 uppercase tracking-wider font-semibold mb-1">
                Cash (₹)
              </label>
              <input
                type="number" min={0} max={total} value={s.cashAmount || ""}
                onChange={e => onChange(splitFor("MIXED", total, Number(e.target.value) || 0))}
                className="w-full bg-green-500/8 border border-green-500/25 rounded-xl px-3 py-2 text-green-200 font-semibold text-sm focus:outline-none focus:border-green-400/60 transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] text-blue-400/60 uppercase tracking-wider font-semibold mb-1">
                UPI / Card (₹)
              </label>
              <input
                type="number" min={0} max={total} value={s.onlineAmount || ""}
                onChange={e => onChange(splitFor("MIXED", total, +(total - (Number(e.target.value) || 0)).toFixed(2)))}
                className="w-full bg-blue-500/8 border border-blue-500/25 rounded-xl px-3 py-2 text-blue-200 font-semibold text-sm focus:outline-none focus:border-blue-400/60 transition-all"
              />
            </div>
          </div>
          <p className="text-[11px] text-white/30 mt-1.5">
            {inr(s.cashAmount)} cash + {inr(s.onlineAmount)} UPI = {inr(total)}
          </p>
        </div>
      )}
    </div>
  );
}
