"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, MonitorSmartphone } from "lucide-react";
import { getKioskToken, setKioskToken } from "@/lib/kiosk/client";

/**
 * Device pairing screen. An admin generates a 6-digit code in hotel-admin;
 * staff types it here once to bind this tablet. On success the device token is
 * stored locally and the tablet is ready to run the kiosk.
 */
export default function KioskPairPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "paired" | "error">("idle");
  const [error, setError] = useState("");
  const [alreadyPaired, setAlreadyPaired] = useState(false);

  useEffect(() => {
    setAlreadyPaired(!!getKioskToken());
  }, []);

  async function submit() {
    if (code.length !== 6) return;
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/kiosk/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Pairing failed. Try again.");
        setStatus("error");
        return;
      }
      setKioskToken(data.token);
      setStatus("paired");
      setTimeout(() => router.push("/kiosk"), 1500);
    } catch {
      setError("Network error. Check the connection and try again.");
      setStatus("error");
    }
  }

  return (
    <div className="min-h-screen bg-[#071209] flex items-center justify-center p-6 select-none">
      <div className="w-full max-w-md text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-amber-500/12 border border-amber-400/25 flex items-center justify-center">
          {status === "paired" ? (
            <CheckCircle2 className="w-8 h-8 text-green-400" />
          ) : (
            <MonitorSmartphone className="w-8 h-8 text-amber-400" />
          )}
        </div>

        {status === "paired" ? (
          <>
            <h1 className="text-2xl font-bold text-white mb-2">Device paired ✓</h1>
            <p className="text-white/50">Starting the kiosk…</p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-white mb-2">Pair this device</h1>
            <p className="text-white/50 mb-8 leading-relaxed">
              {alreadyPaired
                ? "This device is already paired. Enter a new code only to re-pair it."
                : "Enter the 6-digit code from the hotel admin panel (Kiosk Devices)."}
            </p>

            <input
              inputMode="numeric"
              pattern="\d*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="••••••"
              autoFocus
              className="w-full text-center text-4xl tracking-[0.5em] font-bold bg-white/5 border border-white/12 rounded-2xl py-5 text-white placeholder:text-white/20 focus:outline-none focus:border-amber-400/50 [color-scheme:dark]"
            />

            {error && <p className="text-red-400 text-sm mt-4">{error}</p>}

            <button
              onClick={submit}
              disabled={code.length !== 6 || status === "loading"}
              className="w-full mt-6 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold py-4 rounded-2xl transition-all text-lg"
            >
              {status === "loading" ? <Loader2 className="w-5 h-5 animate-spin" /> : "Pair Device"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
