"use client";

/**
 * HeroZoomOverlay — zero-dependency cinematic intro.
 *
 * Sequence (total ≈ 6.5 s):
 *   0.0 s  Black screen fades in → star-field + glowing Earth appears
 *   1.2 s  Earth pulses, location crumb starts: "Earth"
 *   2.0 s  Zoom begins — Earth scales up and blurs off-screen
 *   2.8 s  India satellite image cross-fades in  → crumb: "India"
 *   3.6 s  Bhilai zoom cross-fades in            → crumb: "Bhilai, Chhattisgarh"
 *   4.6 s  Hotel hero image zooms in             → crumb: "The Urban Escape"
 *   5.8 s  Everything fades out, page revealed
 *
 * Plays once per browser session (sessionStorage). Skips if
 * prefers-reduced-motion is set.  Skip button top-right.
 */

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";

const SESSION_KEY = "hero-zoom-played";

const CRUMBS = [
  { at: 1200, label: "Earth" },
  { at: 2800, label: "India" },
  { at: 3600, label: "Bhilai, Chhattisgarh" },
  { at: 4600, label: "The Urban Escape" },
] as const;

// Phases: which "layer" is active
type Phase = "earth" | "india" | "bhilai" | "hotel" | "done";

// Free-to-use satellite tile URLs (OpenStreetMap / ESRI — no key, no billing)
const INDIA_TILE =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=68,8,97,37&bboxSR=4326&size=800,600&format=png&f=image";
const BHILAI_TILE =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=81.28,21.17,81.42,21.27&bboxSR=4326&size=800,600&format=png&f=image";

interface Props {
  /** The hotel hero image src — shown as the final frame before fade-out. */
  heroImage: string;
  onComplete: () => void;
}

export default function HeroZoomOverlay({ heroImage, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>("earth");
  const [crumb, setCrumb] = useState("");
  const [fadeOut, setFadeOut] = useState(false);
  const [visible, setVisible] = useState(true);
  const doneRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);

  function finish() {
    if (doneRef.current) return;
    doneRef.current = true;
    if (animRef.current) cancelAnimationFrame(animRef.current);
    setFadeOut(true);
    setTimeout(() => {
      setVisible(false);
      onComplete();
    }, 900);
    try { sessionStorage.setItem(SESSION_KEY, "1"); } catch { /* */ }
  }

  // ── Star-field canvas ─────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    const STARS = Array.from({ length: 220 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.4 + 0.2,
      o: Math.random() * 0.7 + 0.3,
      twinkle: Math.random() * Math.PI * 2,
    }));

    let frame = 0;
    function draw() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // deep-space gradient
      const bg = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 0,
        canvas.width / 2, canvas.height / 2, canvas.width * 0.8,
      );
      bg.addColorStop(0, "#0a0a1a");
      bg.addColorStop(1, "#000005");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // stars
      for (const s of STARS) {
        const alpha = s.o * (0.6 + 0.4 * Math.sin(s.twinkle + frame * 0.018));
        ctx.beginPath();
        ctx.arc(s.x * canvas.width, s.y * canvas.height, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fill();
      }

      frame++;
      animRef.current = requestAnimationFrame(draw);
    }
    draw();

    return () => {
      window.removeEventListener("resize", resize);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  // ── Animation timeline ────────────────────────────────────────────────────
  useEffect(() => {
    // Skip check
    if (
      typeof window === "undefined" ||
      sessionStorage.getItem(SESSION_KEY) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setVisible(false);
      onComplete();
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    const t = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

    // Crumb reveals
    for (const { at, label } of CRUMBS) t(at, () => setCrumb(label));

    // Phase transitions
    t(2000, () => setPhase("india"));
    t(3200, () => setPhase("bhilai"));
    t(4200, () => setPhase("hotel"));
    t(5800, finish);

    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] overflow-hidden transition-opacity duration-[900ms] ${
        fadeOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      {/* Star-field */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* ── Earth layer ───────────────────────────────────────────── */}
      <div
        className={`absolute inset-0 flex items-center justify-center transition-all duration-700 ${
          phase === "earth" ? "opacity-100 scale-100" : "opacity-0 scale-[3]"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.4,0,0.2,1)" }}
      >
        {/* Globe */}
        <div className="relative w-64 h-64 md:w-80 md:h-80">
          {/* Outer glow */}
          <div className="absolute inset-0 rounded-full bg-blue-500/20 blur-3xl scale-125" />
          {/* Atmosphere ring */}
          <div className="absolute inset-0 rounded-full border-2 border-blue-400/20 blur-sm scale-110" />
          {/* Globe body */}
          <div
            className="absolute inset-0 rounded-full overflow-hidden shadow-[0_0_60px_rgba(59,130,246,0.4),0_0_120px_rgba(34,197,94,0.15)]"
            style={{
              background: `
                radial-gradient(circle at 35% 30%, rgba(34,197,94,0.6) 0%, transparent 45%),
                radial-gradient(circle at 70% 60%, rgba(34,197,94,0.4) 0%, transparent 40%),
                radial-gradient(circle at 50% 50%, #0c4a6e 0%, #1e3a5f 40%, #0f172a 100%)
              `,
            }}
          >
            {/* Continent shapes — stylised patches */}
            <div className="absolute top-[28%] left-[22%] w-[18%] h-[14%] bg-green-600/70 rounded-full blur-[3px] rotate-12" />
            <div className="absolute top-[22%] left-[30%] w-[12%] h-[8%] bg-green-700/60 rounded-full blur-[2px]" />
            <div className="absolute top-[38%] left-[42%] w-[22%] h-[18%] bg-green-600/65 rounded-full blur-[4px] -rotate-6" />
            <div className="absolute top-[48%] left-[18%] w-[28%] h-[22%] bg-green-700/55 rounded-full blur-[5px] rotate-3" />
            <div className="absolute top-[20%] right-[15%] w-[16%] h-[28%] bg-green-500/50 rounded-full blur-[4px]" />
            {/* Cloud streaks */}
            <div className="absolute top-[15%] left-0 right-0 h-[6%] bg-white/15 blur-md rounded-full" />
            <div className="absolute top-[55%] left-[10%] right-[30%] h-[4%] bg-white/10 blur-md rounded-full" />
            {/* Specular highlight */}
            <div className="absolute top-[8%] left-[18%] w-[25%] h-[25%] bg-white/10 rounded-full blur-xl" />
          </div>
          {/* India highlight — faint pulse */}
          <div className="absolute top-[38%] left-[46%] w-3 h-3 bg-amber-400/70 rounded-full blur-sm animate-ping" />
        </div>
      </div>

      {/* ── India satellite layer ─────────────────────────────────── */}
      <div
        className={`absolute inset-0 transition-all duration-700 ${
          phase === "india" ? "opacity-100 scale-100" : phase === "earth" ? "opacity-0 scale-50" : "opacity-0 scale-[2.5]"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.4,0,0.2,1)" }}
      >
        {/* ESRI satellite image of India — no API key needed */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={INDIA_TILE}
          alt="India satellite view"
          className="absolute inset-0 w-full h-full object-cover"
          loading="eager"
          crossOrigin="anonymous"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />
        {/* Bhilai dot */}
        <div className="absolute top-[42%] left-[57%] flex items-center justify-center">
          <div className="w-3 h-3 bg-amber-400 rounded-full animate-ping opacity-75" />
          <div className="absolute w-2 h-2 bg-amber-300 rounded-full" />
        </div>
      </div>

      {/* ── Bhilai satellite layer ────────────────────────────────── */}
      <div
        className={`absolute inset-0 transition-all duration-700 ${
          phase === "bhilai" ? "opacity-100 scale-100" : phase === "india" ? "opacity-0 scale-50" : "opacity-0 scale-[2]"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.4,0,0.2,1)" }}
      >
        {/* ESRI satellite — Bhilai bounding box */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={BHILAI_TILE}
          alt="Bhilai satellite view"
          className="absolute inset-0 w-full h-full object-cover"
          loading="eager"
          crossOrigin="anonymous"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/50" />
        {/* Resort pin */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1">
          <div className="w-4 h-4 bg-amber-400 rounded-full animate-ping opacity-75" />
          <div className="absolute w-3 h-3 bg-amber-300 rounded-full" />
        </div>
      </div>

      {/* ── Hotel hero image layer ────────────────────────────────── */}
      <div
        className={`absolute inset-0 transition-all duration-1000 ${
          phase === "hotel" ? "opacity-100 scale-100" : "opacity-0 scale-[1.15]"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.4,0,0.2,1)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={heroImage}
          alt="The Urban Escape"
          className="absolute inset-0 w-full h-full object-cover"
          loading="eager"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/50" />
      </div>

      {/* ── Location breadcrumb ───────────────────────────────────── */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3">
        <div
          key={crumb}
          className="flex items-center gap-2 text-white/90 text-sm font-medium backdrop-blur-md bg-black/35 border border-white/15 px-5 py-2.5 rounded-full shadow-xl animate-fade-in-up"
        >
          <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          {crumb === "The Urban Escape" ? (
            <span className="text-amber-300 font-semibold tracking-wide">{crumb}</span>
          ) : (
            <span>{crumb}</span>
          )}
        </div>
      </div>

      {/* ── Skip button ───────────────────────────────────────────── */}
      <button
        onClick={finish}
        className="absolute top-5 right-5 text-white/40 hover:text-white/80 text-xs font-semibold border border-white/15 hover:border-white/35 px-4 py-1.5 rounded-full backdrop-blur-sm bg-black/20 hover:bg-black/40 transition-all"
      >
        Skip ›
      </button>
    </div>
  );
}
