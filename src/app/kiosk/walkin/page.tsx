"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarPlus } from "lucide-react";
import { useKioskCopy } from "@/lib/kiosk/KioskShell";

/**
 * Walk-in booking wizard — placeholder. The step flow (pick room → guests →
 * details → ID → summary → pay at desk) lands here in Phase 5, backed by the
 * already-live /api/kiosk/walkin endpoints.
 */
export default function KioskWalkinPlaceholder() {
  const router = useRouter();
  const { t } = useKioskCopy();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6">
      <div className="w-20 h-20 rounded-3xl bg-amber-500/12 border border-amber-400/25 flex items-center justify-center mb-6">
        <CalendarPlus className="w-10 h-10 text-amber-400" />
      </div>
      <h1 className="text-3xl font-bold mb-3">{t("newBooking")}</h1>
      <p className="text-white/50 text-lg mb-10 max-w-md">
        The walk-in booking steps are being set up. For now, {t("askAtDesk").toLowerCase()}
      </p>
      <button
        onClick={() => router.replace("/kiosk")}
        className="flex items-center gap-2 bg-white/8 hover:bg-white/14 border border-white/15 px-8 py-4 rounded-2xl text-lg font-semibold"
      >
        <ArrowLeft className="w-5 h-5" /> {t("back")}
      </button>
    </div>
  );
}
