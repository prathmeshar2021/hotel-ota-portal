import { ScrollText, AlertTriangle, Check } from "lucide-react";
import { houseRules } from "@/lib/constants/house-rules";

/**
 * Rules a guest should read before registering. The age rule for couples leads
 * and is called out separately — it's the one that actually turns people away
 * at the desk, so burying it in a list would be doing the guest no favours.
 */
export default function HouseRules({
  checkInTime,
  checkOutTime,
  depositAmount,
}: {
  checkInTime: string;
  checkOutTime: string;
  depositAmount: number;
}) {
  const rules = houseRules({ checkInTime, checkOutTime, depositAmount });
  const headline = rules.filter(r => r.emphasis);
  const rest = rules.filter(r => !r.emphasis);

  return (
    <div className="bg-white/3 border border-white/8 rounded-3xl p-6 mb-5">
      <div className="flex items-center gap-3 mb-4">
        <span className="w-7 h-7 rounded-full bg-white/8 border border-white/10 flex items-center justify-center shrink-0">
          <ScrollText className="w-3.5 h-3.5 text-white/50" />
        </span>
        <h2 className="font-semibold text-white text-base">Rules &amp; Regulations</h2>
      </div>

      {headline.map(r => (
        <div
          key={r.title}
          className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-3 mb-3"
        >
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-200 text-sm font-bold">{r.title}</p>
            <p className="text-amber-200/60 text-xs mt-0.5 leading-relaxed">{r.detail}</p>
          </div>
        </div>
      ))}

      <ul className="space-y-2.5">
        {rest.map(r => (
          <li key={r.title} className="flex items-start gap-2.5">
            <Check className="w-3.5 h-3.5 text-white/30 shrink-0 mt-1" />
            <div>
              <p className="text-white/75 text-sm font-medium">{r.title}</p>
              <p className="text-white/35 text-xs mt-0.5 leading-relaxed">{r.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
