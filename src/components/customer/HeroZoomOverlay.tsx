"use client";

/**
 * HeroZoomOverlay — cinematic zero-dependency intro animation.
 *
 * Timeline (total ≈ 14 s):
 *   0.0 s  Dark sky fades in → star-field + glowing Earth globe
 *   1.2 s  "Earth" breadcrumb appears
 *   4.0 s  Earth zooms off → India satellite image zooms in   (1.2 s crossfade)
 *   5.0 s  "India" breadcrumb
 *   7.5 s  India zooms off → Bhilai close-up zooms in         (1.2 s crossfade)
 *   8.5 s  "Bhilai, Chhattisgarh" breadcrumb
 *  11.5 s  Bhilai zooms off → hotel hero image zooms in       (1.2 s crossfade)
 *  12.0 s  "The Urban Escape" breadcrumb (amber)
 *  14.5 s  Entire overlay fades out (1 s) → page visible
 *
 * • Satellite tiles from ESRI public service — no API key, no billing
 * • Images preloaded before animation starts (no mid-animation blank frames)
 * • Plays once per browser session (sessionStorage)
 * • Skips if prefers-reduced-motion
 * • Skip button top-right
 */

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";

const SESSION_KEY = "hero-zoom-played";

// ESRI World Imagery — public, no key required
// bbox = minLon,minLat,maxLon,maxLat (WGS-84)
const INDIA_SRC =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export" +
  "?bbox=68,8,97,37&bboxSR=4326&size=900,700&format=jpg&f=image";

// Tight crop around Bhilai / The Urban Escape area
const BHILAI_SRC =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export" +
  "?bbox=81.30,21.17,81.46,21.27&bboxSR=4326&size=900,700&format=jpg&f=image";

type Phase = "earth" | "india" | "bhilai" | "hotel" | "out";

interface Props {
  heroImage?: string | null;
}

export default function HeroZoomOverlay({ heroImage }: Props) {
  const [phase, setPhase]       = useState<Phase>("earth");
  const [crumb, setCrumb]       = useState<string>("");
  const [mounted, setMounted]   = useState(false);   // fade-in the overlay itself
  const [shouldRender, setShouldRender] = useState(true);
  const doneRef                 = useRef(false);
  const timersRef               = useRef<ReturnType<typeof setTimeout>[]>([]);
  const canvasRef               = useRef<HTMLCanvasElement>(null);
  const rafRef                  = useRef<number | null>(null);

  // ── helpers ────────────────────────────────────────────────────────────────
  function schedule(ms: number, fn: () => void) {
    timersRef.current.push(setTimeout(fn, ms));
  }

  function finish() {
    if (doneRef.current) return;
    doneRef.current = true;
    timersRef.current.forEach(clearTimeout);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setPhase("out");
    setTimeout(() => setShouldRender(false), 1100);
    try { sessionStorage.setItem(SESSION_KEY, "1"); } catch { /**/ }
  }

  // ── star-field canvas ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resize() {
      if (!canvas) return;
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    const stars = Array.from({ length: 280 }, () => ({
      x: Math.random(), y: Math.random(),
      r: Math.random() * 1.6 + 0.2,
      base: Math.random() * 0.65 + 0.25,
      phase: Math.random() * Math.PI * 2,
    }));

    let tick = 0;
    function draw() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // deep-space gradient
      const bg = ctx.createRadialGradient(
        canvas.width * 0.5, canvas.height * 0.5, 0,
        canvas.width * 0.5, canvas.height * 0.5, canvas.width,
      );
      bg.addColorStop(0, "#080818");
      bg.addColorStop(1, "#000004");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (const s of stars) {
        const alpha = s.base * (0.55 + 0.45 * Math.sin(s.phase + tick * 0.016));
        ctx.beginPath();
        ctx.arc(s.x * canvas.width, s.y * canvas.height, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
        ctx.fill();
      }
      tick++;
      rafRef.current = requestAnimationFrame(draw);
    }
    draw();
    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ── main timeline ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Skip checks
    if (
      sessionStorage.getItem(SESSION_KEY) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setShouldRender(false);
      return;
    }

    // Preload satellite images so they're ready when the phase hits
    const preload = (src: string) =>
      new Promise<void>(res => {
        const img = new window.Image();
        img.onload = () => res();
        img.onerror = () => res(); // graceful — show blank if it fails
        img.src = src;
      });

    Promise.all([preload(INDIA_SRC), preload(BHILAI_SRC)]).then(() => {
      // Trigger overlay fade-in after preload
      setTimeout(() => setMounted(true), 50);

      // ── Timeline ──
      schedule(1200,  () => setCrumb("Earth"));

      schedule(4000,  () => setPhase("india"));
      schedule(5000,  () => setCrumb("India"));

      schedule(7500,  () => setPhase("bhilai"));
      schedule(8500,  () => setCrumb("Bhilai, Chhattisgarh"));

      schedule(11500, () => setPhase("hotel"));
      schedule(12000, () => setCrumb("The Urban Escape"));

      schedule(14500, finish);
    });

    return () => {
      timersRef.current.forEach(clearTimeout);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!shouldRender) return null;

  const isOut = phase === "out";

  return (
    <div
      className="fixed inset-0 z-[9999] overflow-hidden"
      style={{
        opacity: isOut ? 0 : mounted ? 1 : 0,
        transition: isOut ? "opacity 1s ease-in-out" : "opacity 0.8s ease-out",
        pointerEvents: isOut ? "none" : "auto",
      }}
    >
      {/* ── Star-field ─────────────────────────────────────────────── */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* ── Earth Globe ────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          opacity:    phase === "earth" ? 1 : 0,
          transform:  phase === "earth" ? "scale(1)" : "scale(4)",
          transition: "opacity 1.2s ease-in-out, transform 1.2s ease-in-out",
        }}
      >
        <div className="relative w-72 h-72 md:w-96 md:h-96">
          {/* Outer atmospheric glow */}
          <div className="absolute inset-0 rounded-full scale-[1.35]"
            style={{ background: "radial-gradient(circle, rgba(59,130,246,0.18) 0%, transparent 70%)" }} />
          {/* Thin atmosphere ring */}
          <div className="absolute inset-[-4px] rounded-full border border-blue-400/20" />
          {/* Globe body */}
          <div
            className="absolute inset-0 rounded-full overflow-hidden"
            style={{
              boxShadow: "0 0 80px rgba(59,130,246,0.35), 0 0 160px rgba(34,197,94,0.12), inset -20px -20px 60px rgba(0,0,0,0.5)",
              background: `
                radial-gradient(circle at 32% 28%, rgba(34,197,94,0.55) 0%, transparent 42%),
                radial-gradient(circle at 68% 62%, rgba(34,197,94,0.38) 0%, transparent 38%),
                radial-gradient(circle at 50% 50%, #0d4f80 0%, #1a3a60 45%, #0a1520 100%)
              `,
            }}
          >
            {/* Continents — stylised blobs */}
            <div className="absolute rounded-full blur-[3px] bg-green-600/65" style={{ top:"24%", left:"18%", width:"20%", height:"15%", transform:"rotate(15deg)" }} />
            <div className="absolute rounded-full blur-[2px] bg-green-700/55" style={{ top:"18%", left:"30%", width:"13%", height:"9%" }} />
            <div className="absolute rounded-full blur-[4px] bg-green-600/60" style={{ top:"36%", left:"40%", width:"24%", height:"20%", transform:"rotate(-8deg)" }} />
            <div className="absolute rounded-full blur-[5px] bg-green-700/50" style={{ top:"46%", left:"15%", width:"30%", height:"24%", transform:"rotate(4deg)" }} />
            <div className="absolute rounded-full blur-[4px] bg-green-500/45" style={{ top:"18%", right:"12%", width:"18%", height:"30%" }} />
            <div className="absolute rounded-full blur-[3px] bg-green-600/40" style={{ bottom:"20%", left:"38%", width:"16%", height:"14%" }} />
            {/* Cloud bands */}
            <div className="absolute left-0 right-0 bg-white/12 blur-lg" style={{ top:"14%", height:"7%", borderRadius:"50%" }} />
            <div className="absolute bg-white/8 blur-lg" style={{ top:"52%", left:"8%", right:"28%", height:"5%", borderRadius:"50%" }} />
            {/* Specular shine */}
            <div className="absolute rounded-full blur-2xl bg-white/10" style={{ top:"6%", left:"15%", width:"28%", height:"28%" }} />
          </div>
          {/* India pulse dot */}
          <div className="absolute" style={{ top:"43%", left:"53%" }}>
            <div className="w-3 h-3 rounded-full bg-amber-400/80 animate-ping" />
            <div className="absolute inset-0 m-auto w-2 h-2 rounded-full bg-amber-300" />
          </div>
        </div>
      </div>

      {/* ── India satellite ─────────────────────────────────────────── */}
      <div
        className="absolute inset-0"
        style={{
          opacity:   phase === "india" ? 1 : 0,
          transform: phase === "india" ? "scale(1)" : phase === "earth" ? "scale(0.45)" : "scale(2.8)",
          transition:"opacity 1.2s ease-in-out, transform 1.2s ease-in-out",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={INDIA_SRC} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ background:"linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 40%, rgba(0,0,0,0.55) 100%)" }} />
        {/* Bhilai dot */}
        <div className="absolute flex items-center justify-center" style={{ top:"41%", left:"59%" }}>
          <div className="w-4 h-4 rounded-full bg-amber-400/75 animate-ping" />
          <div className="absolute w-2.5 h-2.5 rounded-full bg-amber-300" />
        </div>
      </div>

      {/* ── Bhilai satellite ─────────────────────────────────────────── */}
      <div
        className="absolute inset-0"
        style={{
          opacity:   phase === "bhilai" ? 1 : 0,
          transform: phase === "bhilai" ? "scale(1)" : phase === "india" ? "scale(0.45)" : "scale(2.5)",
          transition:"opacity 1.2s ease-in-out, transform 1.2s ease-in-out",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={BHILAI_SRC} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ background:"linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, transparent 40%, rgba(0,0,0,0.5) 100%)" }} />
        {/* Resort pin */}
        <div className="absolute flex flex-col items-center gap-1.5" style={{ top:"50%", left:"48%", transform:"translate(-50%,-50%)" }}>
          <div className="w-5 h-5 rounded-full bg-amber-400/80 animate-ping" />
          <div className="absolute w-3.5 h-3.5 rounded-full bg-amber-300 top-[3px]" />
        </div>
      </div>

      {/* ── Hotel hero image ─────────────────────────────────────────── */}
      {heroImage && (
        <div
          className="absolute inset-0"
          style={{
            opacity:   phase === "hotel" ? 1 : 0,
            transform: phase === "hotel" ? "scale(1)" : "scale(1.18)",
            transition:"opacity 1.2s ease-in-out, transform 1.4s ease-in-out",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={heroImage} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0" style={{ background:"linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.22) 50%, rgba(0,0,0,0.48) 100%)" }} />
        </div>
      )}

      {/* ── Breadcrumb ───────────────────────────────────────────────── */}
      {crumb && (
        <div
          key={crumb}
          className="absolute bottom-12 left-1/2 -translate-x-1/2 animate-fade-in-up"
        >
          <div className="flex items-center gap-2.5 text-sm font-medium px-5 py-2.5 rounded-full border border-white/20 shadow-2xl"
            style={{ backdropFilter:"blur(12px)", background:"rgba(0,0,0,0.4)" }}
          >
            <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            {crumb === "The Urban Escape" ? (
              <span className="text-amber-300 font-semibold tracking-wide">{crumb}, Bhilai</span>
            ) : (
              <span className="text-white/85">{crumb}</span>
            )}
          </div>
        </div>
      )}

      {/* ── Skip ─────────────────────────────────────────────────────── */}
      <button
        onClick={finish}
        className="absolute top-5 right-5 text-white/45 hover:text-white/80 text-xs font-semibold border border-white/15 hover:border-white/35 px-4 py-1.5 rounded-full transition-all"
        style={{ backdropFilter:"blur(8px)", background:"rgba(0,0,0,0.25)" }}
      >
        Skip ›
      </button>
    </div>
  );
}
