"use client";

import {
  createContext, useContext, useCallback, useEffect, useRef, useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { Languages, X, Delete } from "lucide-react";
import { KIOSK_COPY, type Lang, type KioskCopyKey } from "@/lib/kiosk/copy";
import { kioskFetch } from "@/lib/kiosk/client";

/**
 * The locked kiosk shell. Provides:
 *  • language context (EN/हिंदी) + a floating toggle
 *  • inactivity auto-reset (returns to the attract screen so the next guest
 *    never sees the previous guest's data)
 *  • a hidden staff exit (5 corner taps → PIN → hotel-admin)
 *
 * Attract (/kiosk) and pairing (/kiosk/pair) are the idle/setup screens, so
 * the inactivity timer only runs on the wizard routes.
 */

const IDLE_WARN_MS = 75_000; // show "still there?" after this
const IDLE_RESET_MS = 15_000; // then reset after this much longer
const LANG_KEY = "kiosk_lang";

interface KioskCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: KioskCopyKey) => string;
}
const Ctx = createContext<KioskCtx | null>(null);

export function useKioskCopy(): KioskCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useKioskCopy must be used inside KioskShell");
  return ctx;
}

export default function KioskShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [lang, setLangState] = useState<Lang>("en");

  // Attract + pairing are steady states; the idle timer only guards wizards.
  const guarded = pathname !== "/kiosk" && pathname !== "/kiosk/pair";

  useEffect(() => {
    const saved = window.localStorage.getItem(LANG_KEY) as Lang | null;
    if (saved === "en" || saved === "hi") setLangState(saved);
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    window.localStorage.setItem(LANG_KEY, l);
  }, []);

  const t = useCallback((key: KioskCopyKey) => KIOSK_COPY[lang][key], [lang]);

  return (
    <Ctx.Provider value={{ lang, setLang, t }}>
      <div className="min-h-screen bg-[#071209] text-white select-none text-lg">
        {children}
      </div>
      <LangToggle lang={lang} setLang={setLang} />
      <StaffExit t={t} />
      {guarded && <IdleGuard t={t} onReset={() => router.replace("/kiosk")} />}
    </Ctx.Provider>
  );
}

// ── Language toggle (floating, bottom-left) ──────────────────────────────────
function LangToggle({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <button
      onClick={() => setLang(lang === "en" ? "hi" : "en")}
      className="fixed bottom-5 left-5 z-[70] flex items-center gap-2 bg-white/8 hover:bg-white/14 border border-white/15 rounded-full px-4 py-2.5 text-sm font-semibold backdrop-blur-md transition-colors"
      aria-label="Change language"
    >
      <Languages className="w-4 h-4 text-amber-400" />
      {lang === "en" ? "हिंदी" : "English"}
    </button>
  );
}

// ── Hidden staff exit: 5 corner taps → PIN ───────────────────────────────────
function StaffExit({ t }: { t: (k: KioskCopyKey) => string }) {
  const router = useRouter();
  const taps = useRef<number[]>([]);
  const [showPin, setShowPin] = useState(false);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  function onCornerTap() {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 3000), now];
    if (taps.current.length >= 5) {
      taps.current = [];
      setPin("");
      setErr("");
      setShowPin(true);
    }
  }

  async function submit() {
    setBusy(true);
    setErr("");
    try {
      const res = await kioskFetch("/api/kiosk/exit", {
        method: "POST",
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        router.push("/hotel-admin/dashboard");
        return;
      }
      setErr(t("wrongPin"));
      setPin("");
    } catch {
      setErr(t("wrongPin"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* invisible corner target */}
      <button
        onClick={onCornerTap}
        aria-hidden
        tabIndex={-1}
        className="fixed top-0 left-0 w-20 h-20 z-[75] opacity-0"
      />

      {showPin && (
        <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-full max-w-xs bg-[#0D1B0E] border border-white/12 rounded-3xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">{t("staffAccess")}</h2>
              <button onClick={() => setShowPin(false)} aria-label="Close" className="p-1.5 rounded-lg hover:bg-white/10">
                <X className="w-5 h-5 text-white/60" />
              </button>
            </div>
            <p className="text-white/45 text-sm mb-3">{t("enterPin")}</p>
            <div className="h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-2xl tracking-[0.4em] mb-2">
              {"•".repeat(pin.length) || <span className="text-white/20">••••</span>}
            </div>
            {err && <p className="text-red-400 text-sm mb-2 text-center">{err}</p>}
            <PinPad
              onDigit={(d) => setPin((p) => (p.length < 8 ? p + d : p))}
              onDelete={() => setPin((p) => p.slice(0, -1))}
              onSubmit={submit}
              disabled={busy || pin.length < 4}
            />
          </div>
        </div>
      )}
    </>
  );
}

function PinPad({
  onDigit, onDelete, onSubmit, disabled,
}: {
  onDigit: (d: string) => void;
  onDelete: () => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
        <button key={d} onClick={() => onDigit(d)}
          className="h-14 rounded-xl bg-white/5 hover:bg-white/12 text-xl font-bold transition-colors">
          {d}
        </button>
      ))}
      <button onClick={onDelete} className="h-14 rounded-xl bg-white/5 hover:bg-white/12 flex items-center justify-center transition-colors">
        <Delete className="w-5 h-5" />
      </button>
      <button onClick={() => onDigit("0")} className="h-14 rounded-xl bg-white/5 hover:bg-white/12 text-xl font-bold transition-colors">0</button>
      <button onClick={onSubmit} disabled={disabled}
        className="h-14 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-30 text-black font-bold transition-colors">
        →
      </button>
    </div>
  );
}

// ── Inactivity guard ─────────────────────────────────────────────────────────
function IdleGuard({ t, onReset }: { t: (k: KioskCopyKey) => string; onReset: () => void }) {
  const [warning, setWarning] = useState(false);
  const [countdown, setCountdown] = useState(Math.round(IDLE_RESET_MS / 1000));
  const lastActivity = useRef(Date.now());

  const bump = useCallback(() => {
    lastActivity.current = Date.now();
    setWarning(false);
  }, []);

  useEffect(() => {
    const events = ["pointerdown", "keydown", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));

    const tick = setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      if (idle >= IDLE_WARN_MS + IDLE_RESET_MS) {
        onReset();
      } else if (idle >= IDLE_WARN_MS) {
        setWarning(true);
        setCountdown(Math.ceil((IDLE_WARN_MS + IDLE_RESET_MS - idle) / 1000));
      }
    }, 1000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(tick);
    };
  }, [bump, onReset]);

  if (!warning) return null;

  return (
    <div className="fixed inset-0 z-[85] bg-black/85 backdrop-blur-sm flex items-center justify-center p-6" onClick={bump}>
      <div className="text-center">
        <p className="text-5xl font-bold text-amber-400 mb-4 tabular-nums">{countdown}</p>
        <h2 className="text-2xl font-bold mb-2">{t("stillThere")}</h2>
        <p className="text-white/50 mb-8">{t("stillThereSub")}</p>
        <button onClick={bump} className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-10 py-4 rounded-2xl text-lg">
          {t("yesContinue")}
        </button>
      </div>
    </div>
  );
}
