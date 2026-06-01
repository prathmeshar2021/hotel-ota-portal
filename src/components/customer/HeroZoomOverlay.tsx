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
const DURATION = 10000; // ms

// Bhilai / The Urban Escape target coordinates
const TARGET_LAT = 21.2145;
const TARGET_LNG = 81.3503;
const START_ALT = 38400; // km (dramatic orbital start)

const EARTH_SRC  = "/intro/earth.png";     // real full-disk Earth photo (DSCOVR EPIC)
const INDIA_SRC  = "/intro/india.jpg";     // ESRI — subcontinent
const REGION_SRC = "/intro/region.jpg";    // ESRI — central India
const BHILAI_SRC = "/intro/bhilai.jpg";    // ESRI — Bhilai city
const MALL_SRC   = "/intro/mall.jpg";      // ESRI — Surya Treasure Island Mall (drone fly-over)

interface Props {
  heroImage?: string | null;
}

// ── tiny math helpers ────────────────────────────────────────────────────────
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lin = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
// blended easing: a linear floor gives non-zero start velocity, so the camera
// begins moving immediately (no dead "staring at Earth" lead-in) yet still
// eases smoothly into the landing.
const easeFlight = (t: number) => 0.32 * t + 0.68 * easeInOutCubic(t);
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
  const mallRef   = useRef<HTMLDivElement>(null);
  const hotelRef  = useRef<HTMLDivElement>(null);
  const starsRef  = useRef<HTMLDivElement>(null);
  const crumbRef  = useRef<string>("");

  // HUD refs (updated imperatively each frame)
  const hudRef     = useRef<HTMLDivElement>(null);
  const altRef     = useRef<HTMLSpanElement>(null);
  const coordRef   = useRef<HTMLSpanElement>(null);
  const statusRef  = useRef<HTMLSpanElement>(null);
  const barRef     = useRef<HTMLDivElement>(null);
  const reticleRef = useRef<HTMLDivElement>(null);
  const flashRef   = useRef<HTMLDivElement>(null);
  const statusTxt  = useRef<string>("");

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

    const srcs = [EARTH_SRC, INDIA_SRC, REGION_SRC, BHILAI_SRC, MALL_SRC];
    if (heroImage) srcs.push(heroImage);

    let cancelled = false;

    // Each layer translates + scales (+ optional bank) through its whole life so
    // the camera is always *gliding*, not snapping between zoom levels — that
    // continuous drift is what sells "real drone movement" over a static zoom.
    function apply(
      el: HTMLDivElement | null, opacity: number, scale: number,
      tx = 0, ty = 0, rot = 0,
    ) {
      if (!el) return;
      el.style.opacity = opacity.toFixed(3);
      el.style.transform =
        `translate(${tx.toFixed(2)}%, ${ty.toFixed(2)}%) rotate(${rot.toFixed(3)}deg) scale(${scale.toFixed(4)})`;

      // Motion blur: ramp a blur from the frame-to-frame movement so fast pans
      // and crossfades streak like real camera motion, then snap sharp when
      // the shot settles. Pan (%) dominates; scale change adds a touch.
      const m = el as unknown as { __tx?: number; __ty?: number; __s?: number };
      const vel =
        Math.abs(tx - (m.__tx ?? tx)) +
        Math.abs(ty - (m.__ty ?? ty)) +
        Math.abs(scale - (m.__s ?? scale)) * 22;
      m.__tx = tx; m.__ty = ty; m.__s = scale;
      // only blur while visible enough to matter
      const blur = opacity > 0.05 ? Math.min(vel * 4.5, 7) : 0;
      el.style.filter = blur > 0.06 ? `blur(${blur.toFixed(2)}px)` : "";
    }

    function frame(now: number) {
      if (cancelled) return;
      if (!startRef.current) startRef.current = now;
      const raw = clamp((now - startRef.current) / DURATION);
      const p = easeFlight(raw);

      // stars fade out as we leave orbit
      if (starsRef.current) starsRef.current.style.opacity = (1 - lin(p, 0.12, 0.30)).toFixed(3);

      // glide helper: drift a layer from an offset back to centre across its
      // life so the target slides into frame (motion), then hands off centred.
      const drift = (a: number, b: number, fx: number, fy: number) =>
        [lerp(fx, 0, lin(p, a, b)), lerp(fy, 0, lin(p, a, b))] as const;

      // Earth: real disk we fly toward while drifting to the India side.
      if (earthRef.current) {
        const e = earthRef.current;
        const t = lin(p, 0.0, 0.22);
        const s = lerp(1.0, 2.9, t);
        e.style.opacity = fade(p, -1, 0, 0.14, 0.24).toFixed(3);
        e.style.transform = `translate(${lerp(0, -16, t).toFixed(2)}%, ${lerp(0, -6, t).toFixed(2)}%) scale(${s.toFixed(4)})`;
      }

      const [ix, iy] = drift(0.14, 0.42, 6, 3);
      apply(indiaRef.current,
        fade(p, 0.14, 0.24, 0.34, 0.42),
        lerp(0.85, 3.0, lin(p, 0.14, 0.42)), ix, iy);

      const [rx, ry] = drift(0.34, 0.56, -6, 4);
      apply(regionRef.current,
        fade(p, 0.34, 0.42, 0.48, 0.56),
        lerp(0.85, 3.0, lin(p, 0.34, 0.56)), rx, ry);

      const [bx, by] = drift(0.48, 0.72, 7, -4);
      apply(bhilaiRef.current,
        fade(p, 0.48, 0.56, 0.64, 0.72),
        lerp(0.88, 3.0, lin(p, 0.48, 0.72)), bx, by);

      // Mall: drone fly-over — a clear lateral sweep + gentle bank while
      // descending, rather than a straight zoom.
      // Zoom in only a little, then fly PAST the mall — it sweeps off to the
      // side so the resort reads as a separate place nearby, not inside it.
      const tm = lin(p, 0.62, 0.92);
      apply(mallRef.current,
        fade(p, 0.62, 0.71, 0.80, 0.87),
        lerp(1.12, 1.5, tm),
        lerp(6, -26, tm), lerp(4, 6, tm), lerp(1.4, -2.5, tm));

      // Hotel: the camera pans over to the neighbouring cottages — entering
      // from the side (opposite the mall's exit) and settling like a landing
      // drone, so it reads as arriving at a nearby place.
      const th = lin(p, 0.80, 1);
      apply(hotelRef.current,
        lin(p, 0.80, 0.93),
        lerp(1.18, 1.0, th), lerp(14, 0, th), lerp(-4, 0, th));

      // ── HUD telemetry ──────────────────────────────────────────────────
      if (altRef.current) {
        altRef.current.textContent = p > 0.9
          ? `${Math.max(0, Math.round(lerp(380, 0, lin(p, 0.9, 1)))).toLocaleString()} m`
          : `${Math.round(lerp(START_ALT, 0.38, p)).toLocaleString()} km`;
      }
      if (coordRef.current) {
        const lat = lerp(0, TARGET_LAT, p);
        const lng = lerp(0, TARGET_LNG, p);
        coordRef.current.textContent = `${lat.toFixed(4)}°N  ${lng.toFixed(4)}°E`;
      }
      const st =
        p < 0.16 ? "ACQUIRING SIGNAL" :
        p < 0.42 ? "ENTERING ATMOSPHERE" :
        p < 0.82 ? "DESCENDING" : "TARGET LOCKED";
      if (st !== statusTxt.current && statusRef.current) {
        statusTxt.current = st; statusRef.current.textContent = st;
      }
      if (barRef.current) barRef.current.style.width = `${(raw * 100).toFixed(1)}%`;
      if (reticleRef.current) {
        const lock = lin(p, 0.78, 0.94);
        reticleRef.current.style.transform =
          `translate(-50%,-50%) scale(${lerp(1, 0.8, lock).toFixed(3)})`;
        reticleRef.current.style.opacity = lin(p, 0.04, 0.16).toFixed(3);
      }
      if (flashRef.current) {
        const f = Math.max(0, 1 - Math.abs(p - 0.27) / 0.13); // atmosphere entry
        flashRef.current.style.opacity = (f * 0.55).toFixed(3);
      }
      if (hudRef.current) hudRef.current.style.opacity = (1 - lin(p, 0.85, 0.97)).toFixed(3);

      // breadcrumb (only setState when it changes)
      const c =
        p >= 0.84 ? "The Urban Escape" :
        p >= 0.64 ? "Surya Treasure Island" :
        p >= 0.46 ? "Bhilai, Chhattisgarh" :
        p >= 0.16 ? "India" :
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

      {/* ── Earth — real full-disk photo from space ───────────────────── */}
      <div
        ref={earthRef}
        className="absolute inset-0 flex items-center justify-center will-change-transform"
        style={{ opacity: 0 }}
      >
        <div className="relative w-[86vmin] h-[86vmin]">
          {/* soft blue atmospheric halo behind the disk */}
          <div className="absolute inset-0 rounded-full scale-[1.14]"
            style={{ background: "radial-gradient(circle, rgba(120,180,255,0.40) 0%, rgba(60,120,220,0.14) 55%, transparent 72%)", filter: "blur(10px)" }} />
          {/* planet — the photo's black margins are clipped away by the circle */}
          <div className="absolute inset-0 rounded-full overflow-hidden"
            style={{ boxShadow: "0 0 90px rgba(80,140,255,0.40), inset 0 0 70px rgba(0,4,30,0.55)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={EARTH_SRC} alt="" aria-hidden
              className="absolute inset-0 w-full h-full object-cover"
              style={{ transform: "scale(1.13)" }} />
          </div>
          {/* faint atmosphere rim light */}
          <div className="absolute inset-0 rounded-full pointer-events-none"
            style={{ boxShadow: "inset 0 0 24px rgba(150,200,255,0.35)" }} />
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

      {/* ── Surya Treasure Island Mall — real aerial fly-over ─────────── */}
      <div ref={mallRef} className="absolute inset-0 will-change-transform" style={{ opacity: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={MALL_SRC} alt="" aria-hidden
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: "52% 40%", filter: "saturate(1.12) contrast(1.05) brightness(1.02)" }} />
        {/* warm dusk grade + vignette to blend toward the cottages hero */}
        <div className="absolute inset-0"
          style={{ background: "linear-gradient(to bottom, rgba(8,6,2,0.30) 0%, transparent 42%, rgba(20,10,2,0.45) 100%)" }} />
        <div className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse at 50% 45%, transparent 50%, rgba(0,0,0,0.45) 100%)" }} />
        {/* landmark tag on the building */}
        <div className="absolute flex items-center justify-center" style={{ top: "44%", left: "52%", transform: "translate(-50%,-50%)" }}>
          <div className="w-6 h-6 rounded-full bg-cyan-300/55 animate-ping" />
          <div className="absolute w-2.5 h-2.5 rounded-full bg-cyan-200" />
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

      {/* ── Atmosphere-entry warm flash ───────────────────────────────── */}
      <div ref={flashRef} className="absolute inset-0 pointer-events-none mix-blend-screen"
        style={{ opacity: 0, background: "radial-gradient(ellipse at 50% 58%, transparent 42%, rgba(255,150,60,0.6) 88%, rgba(255,110,40,0.0) 100%)" }} />

      {/* ── Tech HUD overlay ──────────────────────────────────────────── */}
      <div ref={hudRef} className="absolute inset-0 pointer-events-none select-none"
        style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
        {/* cinematic letterbox */}
        <div className="absolute top-0 inset-x-0 h-24 bg-gradient-to-b from-black/55 to-transparent" />
        <div className="absolute bottom-0 inset-x-0 h-36 bg-gradient-to-t from-black/65 to-transparent" />
        {/* vignette */}
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 52%, rgba(0,0,0,0.55) 100%)" }} />
        {/* scanlines */}
        <div className="absolute inset-0 opacity-[0.05]"
          style={{ backgroundImage: "repeating-linear-gradient(0deg, #fff 0px, #fff 1px, transparent 1px, transparent 3px)" }} />
        {/* radar scan sweep */}
        <div className="absolute inset-x-0 h-px bg-cyan-300/40 animate-hud-scan"
          style={{ boxShadow: "0 0 14px rgba(103,232,249,0.7)" }} />

        {/* corner frame brackets */}
        <div className="absolute top-4 left-4 w-7 h-7 border-t border-l border-cyan-300/40" />
        <div className="absolute top-4 right-4 w-7 h-7 border-t border-r border-cyan-300/40" />
        <div className="absolute bottom-4 left-4 w-7 h-7 border-b border-l border-cyan-300/40" />
        <div className="absolute bottom-4 right-4 w-7 h-7 border-b border-r border-cyan-300/40" />

        {/* centre target reticle */}
        <div ref={reticleRef} className="absolute left-1/2 top-1/2 w-[32vmin] h-[32vmin]"
          style={{ transform: "translate(-50%,-50%)", opacity: 0 }}>
          <div className="absolute inset-0 rounded-full border border-cyan-300/25 animate-hud-spin" />
          <div className="absolute inset-[14%] rounded-full border border-dashed border-cyan-300/20 animate-hud-spin-rev" />
          {/* crosshair ticks */}
          <div className="absolute left-1/2 top-0 -translate-x-1/2 w-px h-4 bg-cyan-300/60" />
          <div className="absolute left-1/2 bottom-0 -translate-x-1/2 w-px h-4 bg-cyan-300/60" />
          <div className="absolute top-1/2 left-0 -translate-y-1/2 h-px w-4 bg-cyan-300/60" />
          <div className="absolute top-1/2 right-0 -translate-y-1/2 h-px w-4 bg-cyan-300/60" />
          {/* inner lock box */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[30%] h-[30%]">
            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-amber-400/80" />
            <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-amber-400/80" />
            <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-amber-400/80" />
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-amber-400/80" />
          </div>
          {/* centre dot */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-amber-400"
            style={{ boxShadow: "0 0 10px rgba(251,191,36,0.95)" }} />
        </div>

        {/* top-left telemetry */}
        <div className="absolute top-8 left-8 text-[11px] leading-relaxed text-cyan-200/80 animate-hud-flicker">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="tracking-[0.22em] text-cyan-100/90">STAYINDIA · ORBITAL UPLINK</span>
          </div>
          <div className="tracking-wider">ALT&nbsp;&nbsp;<span ref={altRef} className="text-cyan-100" /></div>
          <div className="tracking-wider">POS&nbsp;&nbsp;<span ref={coordRef} className="text-cyan-100" /></div>
        </div>

        {/* bottom-left status + descent bar */}
        <div className="absolute bottom-10 left-8 w-60 text-[11px] text-cyan-200/80">
          <div className="flex items-center justify-between mb-1.5 tracking-[0.2em]">
            <span ref={statusRef} className="text-amber-300/90" />
            <span className="text-cyan-300/60">DESCENT</span>
          </div>
          <div className="h-[3px] w-full bg-white/10 rounded-full overflow-hidden">
            <div ref={barRef} className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-amber-300"
              style={{ width: "0%", boxShadow: "0 0 10px rgba(103,232,249,0.6)" }} />
          </div>
        </div>
      </div>

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
