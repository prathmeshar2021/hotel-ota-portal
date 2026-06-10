import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="min-h-screen bg-[#071209] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-7 h-7 text-amber-400 animate-spin" />
        <p className="text-white/35 text-sm">Loading…</p>
      </div>
    </div>
  );
}
