"use client";

/**
 * HeroZoomOverlay — cinematic, photorealistic "fly into Earth" intro.
 *
 * One continuous requestAnimationFrame clock drives a single `progress`
 * value (0→1, eased). Every layer shares that clock — each one keeps
 * scaling up while the next fades in *during* the motion, so the result
 * reads as one uninterrupted dolly from orbit down to the resort, never a
 * sequence of discrete image swaps.
 *
 * Flight path (real imagery, all centred on Bhilai so the camera
 * converges on the resort):
 *   Blue-Marble globe (real satellite texture)  →
 *   ESRI India subcontinent  →  ESRI central-India  →
 *   ESRI Bhilai city  →  the resort hero photo (locks as the page bg)
 *
 * • Real images served locally from /public/intro (instant, consistent)
 * • Plays once per browser session (sessionStorage)
 * • Skips on prefers-reduced-motion · Skip button top-right
 */

import { forwardRef, useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";

const SESSION_KEY = "hero-zoom-played";
const DURATION = 13000; // ms

const EARTH_SRC  = "/intro/earth_map.jpg"; // equirectangular Blue Marble
const INDIA_SRC  = "/intro/india.jpg";     // ESRI — subcontinent
const REGION_SRC = "/intro/region.jpg";    // ESRI — central India
const BHILAI_SRC = "/intro/bhilai.jpg";    // ESRI — Bhilai city

interface Props {
  heroImage?: string | null;
}

// ── tiny math helpers ────────────────────────────────────────────────────────
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lin = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
// fade in over [inA,inB], hold, fade out over [outA,outB]
const fade = (p: number, inA: number, inB: number, outA: number, outB: number) =>
  Math.min(lin(p, inA, inB), 1 - lin(p, outA, outB));

export default function HeroZoomOverlay({ heroImage }: Props) {
  const [crumb, setCrumb]               = useState<string>("");
  const [mounted, setMounted]           = useState(false);
  const [shouldRender, setShouldRender] = useState(true);
  const [out, setOut]                   = useState(false);

  const doneRef   = useRef(false);
  const rafRef    = useRef<number | null>(null);
  const starRafRef= useRef<number | null>(null);
  const startRef  = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // layer element refs (styled imperatively each frame — no per-frame rerenders)
  const earthRef  = useRef<HTMLDivElement>(null);
  const indiaRef  = useRef<HTMLDivElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const bhilaiRef = useRef<HTMLDivElement>(null);
  const hotelRef  = useRef<HTMLDivElement>(null);
  const starsRef  = useRef<HTMLDivElement>(null);
  const crumbRef  = useRef<string>("");

  function finish() {
    if (doneRef.current) return;
    doneRef.current = true;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setOut(true);
    setTimeout(() => setShouldRender(false), 1100);
    try { sessionStorage.setItem(SESSION_KEY, "1"); } catch { /**/ }
  }

  // ── star-field canvas (its own light loop) ──────────────────────────────────
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

    const stars = Array.from({ length: 320 }, () => ({
      x: Math.random(), y: Math.random(),
      r: Math.random() * 1.5 + 0.2,
      base: Math.random() * 0.6 + 0.3,
      phase: Math.random() * Math.PI * 2,
    }));

    let tick = 0;
    function draw() {
      if (!canvas || !ctx) return;
      const bg = ctx.createRadialGradient(
        canvas.width * 0.5, canvas.height * 0.48, 0,
        canvas.width * 0.5, canvas.height * 0.48, canvas.width * 0.9,
      );
      bg.addColorStop(0, "#0a0a1a");
      bg.addColorStop(1, "#000003");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (const s of stars) {
        const alpha = s.base * (0.5 + 0.5 * Math.sin(s.phase + tick * 0.015));
        ctx.beginPath();
        ctx.arc(s.x * canvas.width, s.y * canvas.height, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
        ctx.fill();
      }
      tick++;
      starRafRef.current = requestAnimationFrame(draw);
    }
    draw();
    return () => {
      window.removeEventListener("resize", resize);
      if (starRafRef.current) cancelAnimationFrame(starRafRef.current);
    };
  }, []);

  // ── main continuous-zoom loop ───────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (
      sessionStorage.getItem(SESSION_KEY) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setShouldRender(false);
      return;
    }

    const preload = (src: string) =>
      new Promise<void>(res => {
        const img = new window.Image();
        img.onload = () => res();
        img.onerror = () => res();
        img.src = src;
      });

    const srcs = [EARTH_SRC, INDIA_SRC, REGION_SRC, BHILAI_SRC];
    if (heroImage) srcs.push(heroImage);

    let cancelled = false;

    function apply(el: HTMLDivElement | null, opacity: number, scale: number) {
      if (!el) return;
      el.style.opacity = opacity.toFixed(3);
      el.style.transform = `scale(${scale.toFixed(4)})`;
    }

    function frame(now: number) {
      if (cancelled) return;
      if (!startRef.current) startRef.current = now;
      const raw = clamp((now - startRef.current) / DURATION);
      const p = easeInOutCubic(raw);

      // stars fade out as we leave orbit
      if (starsRef.current) starsRef.current.style.opacity = (1 - lin(p, 0.16, 0.34)).toFixed(3);

      // each layer: keeps scaling up through its life; crossfades mid-motion
      apply(earthRef.current,
        fade(p, -1, 0, 0.22, 0.34),
        lerp(1.0, 3.4, lin(p, 0.0, 0.34)));
      apply(indiaRef.current,
        fade(p, 0.20, 0.32, 0.46, 0.56),
        lerp(0.82, 3.0, lin(p, 0.20, 0.56)));
      apply(regionRef.current,
        fade(p, 0.46, 0.56, 0.66, 0.76),
        lerp(0.82, 3.0, lin(p, 0.46, 0.76)));
      apply(bhilaiRef.current,
        fade(p, 0.66, 0.76, 0.86, 0.94),
        lerp(0.85, 3.2, lin(p, 0.66, 0.94)));
      apply(hotelRef.current,
        lin(p, 0.86, 0.97),
        lerp(1.22, 1.0, lin(p, 0.86, 1.0)));

      // breadcrumb (only setState when it changes)
      const c =
        p >= 0.88 ? "The Urban Escape" :
        p >= 0.60 ? "Bhilai, Chhattisgarh" :
        p >= 0.30 ? "India" :
        p >= 0.02 ? "Earth" : "";
      if (c !== crumbRef.current) { crumbRef.current = c; setCrumb(c); }

      if (raw >= 1) { finish(); return; }
      rafRef.current = requestAnimationFrame(frame);
    }

    Promise.all(srcs.map(preload)).then(() => {
      if (cancelled) return;
      setMounted(true);
      startRef.current = 0;
      rafRef.current = requestAnimationFrame(frame);
    });

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroImage]);

  if (!shouldRender) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] overflow-hidden bg-black"
      style={{
        opacity: out ? 0 : mounted ? 1 : 0,
        transition: out ? "opacity 1s ease-in-out" : "opacity 0.6s ease-out",
        pointerEvents: out ? "none" : "auto",
      }}
    >
      {/* ── Deep-space star-field ─────────────────────────────────────── */}
      <div ref={starsRef} className="absolute inset-0">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      </div>

      {/* ── Earth globe (real Blue-Marble texture on a shaded sphere) ──── */}
      <div
        ref={earthRef}
        className="absolute inset-0 flex items-center justify-center will-change-transform"
        style={{ opacity: 0 }}
      >
        <div className="relative w-[78vmin] h-[78vmin]">
          {/* atmospheric glow halo */}
          <div className="absolute inset-0 rounded-full scale-[1.28]"
            style={{ background: "radial-gradient(circle, rgba(96,165,250,0.28) 0%, rgba(59,130,246,0.10) 45%, transparent 70%)" }} />
          {/* globe body */}
          <div className="absolute inset-0 rounded-full overflow-hidden"
            style={{ boxShadow: "0 0 120px rgba(59,130,246,0.30), inset 0 0 60px rgba(0,0,0,0.4)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={EARTH_SRC} alt="" aria-hidden
              className="absolute inset-0 w-full h-full object-cover"
              style={{ objectPosition: "71% 40%" }} />
            {/* limb darkening — turns the flat map into a sphere */}
            <div className="absolute inset-0 rounded-full"
              style={{ background: "radial-gradient(circle at 50% 50%, transparent 52%, rgba(0,0,0,0.35) 74%, rgba(0,0,0,0.85) 100%)" }} />
            {/* day-side highlight */}
            <div className="absolute inset-0 rounded-full"
              style={{ background: "radial-gradient(circle at 36% 30%, rgba(255,255,255,0.30) 0%, transparent 42%)" }} />
            {/* night-side shadow */}
            <div className="absolute inset-0 rounded-full"
              style={{ background: "radial-gradient(circle at 78% 76%, rgba(0,0,10,0.55) 0%, transparent 50%)" }} />
          </div>
          {/* thin atmosphere rim */}
          <div className="absolute inset-0 rounded-full"
            style={{ boxShadow: "inset 0 0 30px rgba(147,197,253,0.45)" }} />
          {/* resort target pulse over India */}
          <div className="absolute" style={{ top: "47%", left: "52%" }}>
            <div className="w-3 h-3 rounded-full bg-amber-400/80 animate-ping" />
            <div className="absolute inset-0 m-auto w-1.5 h-1.5 rounded-full bg-amber-300" />
          </div>
        </div>
      </div>

      {/* ── ESRI India subcontinent ───────────────────────────────────── */}
      <ImageLayer ref={indiaRef} src={INDIA_SRC} pos="53% 49%"
        grad="linear-gradient(to bottom, rgba(0,0,0,0.40) 0%, transparent 45%, rgba(0,0,0,0.45) 100%)" />

      {/* ── ESRI central-India ────────────────────────────────────────── */}
      <ImageLayer ref={regionRef} src={REGION_SRC} pos="48% 54%"
        grad="linear-gradient(to bottom, rgba(0,0,0,0.30) 0%, transparent 50%, rgba(0,0,0,0.40) 100%)" />

      {/* ── ESRI Bhilai city ──────────────────────────────────────────── */}
      <div ref={bhilaiRef} className="absolute inset-0 will-change-transform" style={{ opacity: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={BHILAI_SRC} alt="" aria-hidden
          className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: "50% 54%" }} />
        <div className="absolute inset-0"
          style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, transparent 50%, rgba(0,0,0,0.45) 100%)" }} />
        {/* resort pin */}
        <div className="absolute flex items-center justify-center" style={{ top: "54%", left: "50%", transform: "translate(-50%,-50%)" }}>
          <div className="w-5 h-5 rounded-full bg-amber-400/80 animate-ping" />
          <div className="absolute w-3 h-3 rounded-full bg-amber-300" />
        </div>
      </div>

      {/* ── Resort hero photo (locks in as the page background) ────────── */}
      {heroImage && (
        <div ref={hotelRef} className="absolute inset-0 will-change-transform" style={{ opacity: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={heroImage} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0"
            style={{ background: "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.20) 50%, rgba(0,0,0,0.48) 100%)" }} />
        </div>
      )}

      {/* ── Breadcrumb ────────────────────────────────────────────────── */}
      {crumb && (
        <div key={crumb} className="absolute bottom-12 left-1/2 -translate-x-1/2 animate-fade-in-up">
          <div className="flex items-center gap-2.5 text-sm font-medium px-5 py-2.5 rounded-full border border-white/20 shadow-2xl"
            style={{ backdropFilter: "blur(12px)", background: "rgba(0,0,0,0.4)" }}>
            <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            {crumb === "The Urban Escape" ? (
              <span className="text-amber-300 font-semibold tracking-wide">{crumb}, Bhilai</span>
            ) : (
              <span className="text-white/85">{crumb}</span>
            )}
          </div>
        </div>
      )}

      {/* ── Skip ──────────────────────────────────────────────────────── */}
      <button
        onClick={finish}
        className="absolute top-5 right-5 text-white/45 hover:text-white/80 text-xs font-semibold border border-white/15 hover:border-white/35 px-4 py-1.5 rounded-full transition-all"
        style={{ backdropFilter: "blur(8px)", background: "rgba(0,0,0,0.25)" }}
      >
        Skip ›
      </button>
    </div>
  );
}

// ── reusable flat satellite layer ────────────────────────────────────────────
const ImageLayer = forwardRef<
  HTMLDivElement,
  { src: string; pos: string; grad: string }
>(function ImageLayer({ src, pos, grad }, ref) {
  return (
    <div ref={ref} className="absolute inset-0 will-change-transform" style={{ opacity: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" aria-hidden
        className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: pos }} />
      <div className="absolute inset-0" style={{ background: grad }} />
    </div>
  );
});
