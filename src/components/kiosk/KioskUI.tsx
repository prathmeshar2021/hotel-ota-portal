"use client";

import { ArrowLeft, ArrowRight, Delete, Loader2 } from "lucide-react";

/**
 * Shared kiosk wizard UI: a step frame (progress dots + big Back/Next) and
 * on-screen keypads. Everything is sized for touch — large fonts, ≥64px hit
 * targets — since the tablet has no physical keyboard.
 */

export function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`h-2 rounded-full transition-all ${
            i === current ? "w-8 bg-amber-400" : i < current ? "w-2 bg-amber-400/50" : "w-2 bg-white/15"
          }`}
        />
      ))}
    </div>
  );
}

export function KioskStep({
  title, subtitle, children,
  onBack, onNext, nextLabel = "Next", nextDisabled = false, busy = false,
  totalSteps, currentStep, backLabel = "Back",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  busy?: boolean;
  totalSteps: number;
  currentStep: number;
  backLabel?: string;
}) {
  return (
    <div className="min-h-screen flex flex-col px-6 py-8 pb-28 max-w-2xl mx-auto w-full">
      <ProgressDots total={totalSteps} current={currentStep} />

      <div className="flex-1 flex flex-col">
        <h1 className="text-3xl sm:text-4xl font-bold mb-2 text-center">{title}</h1>
        {subtitle && <p className="text-white/50 text-lg mb-8 text-center">{subtitle}</p>}
        <div className="flex-1">{children}</div>
      </div>

      {/* Nav */}
      <div className="flex items-center gap-3 mt-8">
        {onBack && (
          <button
            onClick={onBack}
            disabled={busy}
            className="flex items-center justify-center gap-2 bg-white/8 hover:bg-white/14 border border-white/15 rounded-2xl px-6 h-16 text-lg font-semibold disabled:opacity-40"
          >
            <ArrowLeft className="w-5 h-5" /> {backLabel}
          </button>
        )}
        {onNext && (
          <button
            onClick={onNext}
            disabled={nextDisabled || busy}
            className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-black rounded-2xl h-16 text-lg font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? <Loader2 className="w-6 h-6 animate-spin" /> : <>{nextLabel} <ArrowRight className="w-5 h-5" /></>}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Numeric keypad ───────────────────────────────────────────────────────────
export function NumericKeypad({
  onDigit, onDelete,
}: { onDigit: (d: string) => void; onDelete: () => void }) {
  return (
    <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto w-full">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
        <KeypadKey key={d} onClick={() => onDigit(d)}>{d}</KeypadKey>
      ))}
      <span />
      <KeypadKey onClick={() => onDigit("0")}>0</KeypadKey>
      <KeypadKey onClick={onDelete}><Delete className="w-6 h-6 mx-auto" /></KeypadKey>
    </div>
  );
}

// ── Alphanumeric keyboard (booking-ref entry) ────────────────────────────────
const KEYBOARD_ROWS = [
  "1234567890".split(""),
  "QWERTYUIOP".split(""),
  "ASDFGHJKL".split(""),
  "ZXCVBNM-".split(""),
];

export function AlphaKeyboard({
  onKey, onDelete,
}: { onKey: (k: string) => void; onDelete: () => void }) {
  return (
    <div className="space-y-2 max-w-xl mx-auto w-full">
      {KEYBOARD_ROWS.map((row, i) => (
        <div key={i} className="flex justify-center gap-1.5">
          {row.map((k) => (
            <button
              key={k}
              onClick={() => onKey(k)}
              className="flex-1 max-w-[3.5rem] h-14 rounded-xl bg-white/8 hover:bg-white/16 active:bg-amber-500 active:text-black text-lg font-bold transition-colors"
            >
              {k}
            </button>
          ))}
          {i === KEYBOARD_ROWS.length - 1 && (
            <button
              onClick={onDelete}
              className="flex-1 max-w-[4.5rem] h-14 rounded-xl bg-white/8 hover:bg-white/16 flex items-center justify-center transition-colors"
            >
              <Delete className="w-5 h-5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function KeypadKey({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-16 rounded-2xl bg-white/8 hover:bg-white/16 active:bg-amber-500 active:text-black text-2xl font-bold transition-colors"
    >
      {children}
    </button>
  );
}

// ── Big display field (shows typed value) ────────────────────────────────────
export function DisplayField({ value, placeholder }: { value: string; placeholder?: string }) {
  return (
    <div className="h-16 rounded-2xl bg-white/5 border border-white/12 flex items-center justify-center text-2xl font-bold tracking-wide mb-6 px-4">
      {value || <span className="text-white/25">{placeholder}</span>}
    </div>
  );
}
