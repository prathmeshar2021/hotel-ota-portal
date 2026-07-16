"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2 } from "lucide-react";
import { getKioskToken } from "@/lib/kiosk/client";

/**
 * Kiosk entry. Phase 1 placeholder: verifies the device is paired (else routes
 * to /kiosk/pair). The self-check-in and walk-in wizards land here in later
 * phases.
 */
export default function KioskHome() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getKioskToken()) {
      router.replace("/kiosk/pair");
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#071209] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#071209] flex items-center justify-center p-6 text-center select-none">
      <div className="max-w-md">
        <CheckCircle2 className="w-14 h-14 text-green-400 mx-auto mb-6" />
        <h1 className="text-3xl font-bold text-white mb-3">Kiosk ready</h1>
        <p className="text-white/50 leading-relaxed">
          This device is paired and authorized. The self check-in and walk-in
          booking flows will appear here in the next build.
        </p>
      </div>
    </div>
  );
}
