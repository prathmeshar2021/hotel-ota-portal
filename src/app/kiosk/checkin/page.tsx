"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, KeyRound } from "lucide-react";
import { useKioskCopy } from "@/lib/kiosk/KioskShell";

/**
 * Self check-in wizard — placeholder. The step-by-step flow (find booking →
 * verify → confirm → guest details → companions → ID capture → trip info →
 * done) lands here in Phase 4, backed by the already-live kiosk APIs.
 */
export default function KioskCheckinPlaceholder() {
  const router = useRouter();
  const { t } = useKioskCopy();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6">
      <div className="w-20 h-20 rounded-3xl bg-amber-500/12 border border-amber-400/25 flex items-center justify-center mb-6">
        <KeyRound className="w-10 h-10 text-amber-400" />
      </div>
      <h1 className="text-3xl font-bold mb-3">{t("haveBooking")}</h1>
      <p className="text-white/50 text-lg mb-10 max-w-md">
        The self check-in steps are being set up. For now, {t("askAtDesk").toLowerCase()}
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
