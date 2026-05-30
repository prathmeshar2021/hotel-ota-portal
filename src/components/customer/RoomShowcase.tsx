"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Users, Check, ChevronLeft, ChevronRight } from "lucide-react";

export type ShowcaseRoom = {
  type: string;
  label: string;
  tagline: string;
  description: string;
  price: number;
  capacity: number;
  imageSrc: string | null;
  bgGradient: string;
  accentColor: string;
  accentBg: string;
  ledColor: string;
  features: string[];
  hotelSlug: string;
};

const ease = [0.21, 0.47, 0.32, 0.98] as const;

export default function RoomShowcase({ rooms }: { rooms: ShowcaseRoom[] }) {
  const [active, setActive] = useState(0);
  const [direction, setDirection] = useState(1);
  const room = rooms[active];

  function go(next: number) {
    setDirection(next > active ? 1 : -1);
    setActive(next);
  }

  function prev() { go((active - 1 + rooms.length) % rooms.length); }
  function next() { go((active + 1) % rooms.length); }

  return (
    <section id="rooms" className="relative min-h-screen overflow-hidden flex flex-col">

      {/* ── Crossfading background ─────────────────────────────── */}
      <AnimatePresence mode="sync">
        <motion.div key={`bg-${active}`} className="absolute inset-0 -z-10"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: "easeInOut" }}>
          {/* Solid bg gradient */}
          <div className="absolute inset-0" style={{ background: room.bgGradient }} />
          {/* Photo overlay */}
          {room.imageSrc && (
            <div className="absolute inset-0 opacity-[0.35]">
              <Image src={room.imageSrc} alt={room.label} fill className="object-cover" priority />
            </div>
          )}
          {/* Depth gradient */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/65 via-black/25 to-black/85" />
        </motion.div>
      </AnimatePresence>

      {/* ── LED strip top ──────────────────────────────────────── */}
      <AnimatePresence mode="sync">
        <motion.div key={`led-${active}`}
          className="absolute top-0 left-0 right-0 h-0.5 z-10"
          initial={{ scaleX: 0, opacity: 0 }} animate={{ scaleX: 1, opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease }}
          style={{ background: `linear-gradient(to right, transparent, ${room.ledColor}, transparent)` }}
        />
      </AnimatePresence>

      {/* ── Section label ─────────────────────────────────────── */}
      <div className="relative z-10 pt-24 text-center mb-2">
        <p className="text-white/30 text-[10px] tracking-[0.35em] uppercase font-semibold">Accommodations</p>
      </div>

      {/* ── Main content ──────────────────────────────────────── */}
      <div className="relative z-10 flex-1 flex items-center px-6 md:px-14 lg:px-20 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20 items-center w-full py-10">

          {/* LEFT — room info */}
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div key={`info-${active}`}
              custom={direction}
              variants={{
                enter: (d: number) => ({ opacity: 0, x: d * 60, y: 20 }),
                center: { opacity: 1, x: 0, y: 0 },
                exit: (d: number) => ({ opacity: 0, x: d * -40, y: -10 }),
              }}
              initial="enter" animate="center" exit="exit"
              transition={{ duration: 0.55, ease }}
              className="text-white"
            >
              {/* Tagline */}
              <p className="text-xs font-bold tracking-[0.25em] uppercase mb-3" style={{ color: room.accentColor }}>
                {room.tagline}
              </p>

              {/* Title */}
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.05] mb-4">
                {room.label}
              </h2>

              {/* Description */}
              <p className="text-white/55 text-sm sm:text-base leading-relaxed mb-7 max-w-md">
                {room.description}
              </p>

              {/* Feature pills */}
              <div className="flex flex-wrap gap-2 mb-8">
                {room.features.map((f) => (
                  <span key={f}
                    className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-full"
                    style={{ color: room.accentColor, background: room.accentBg, border: `1px solid ${room.accentColor}35` }}>
                    <Check className="w-3 h-3 shrink-0" /> {f}
                  </span>
                ))}
              </div>

              {/* Price + CTA */}
              <div className="flex items-center gap-6 flex-wrap">
                <div>
                  <p className="text-white/35 text-[10px] uppercase tracking-widest mb-0.5">Starting from</p>
                  <p className="text-3xl font-bold">
                    ₹{room.price.toLocaleString("en-IN")}
                    <span className="text-sm font-normal text-white/35 ml-1">/night</span>
                  </p>
                  <p className="text-white/35 text-xs flex items-center gap-1 mt-0.5">
                    <Users className="w-3 h-3" /> Up to {room.capacity} guest{room.capacity > 1 ? "s" : ""}
                  </p>
                </div>

                <Link href={`/hotel/${room.hotelSlug}`}
                  className="flex items-center gap-2 font-bold px-7 py-3.5 rounded-xl text-sm transition-all hover:scale-105 active:scale-95"
                  style={{
                    background: room.accentColor,
                    color: "#000",
                    boxShadow: `0 8px 30px ${room.accentColor}45`,
                  }}>
                  Book This Room <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* RIGHT — image card */}
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div key={`card-${active}`}
              custom={direction}
              variants={{
                enter: (d: number) => ({ opacity: 0, x: d * 80, scale: 0.92 }),
                center: { opacity: 1, x: 0, scale: 1 },
                exit: (d: number) => ({ opacity: 0, x: d * -50, scale: 0.95 }),
              }}
              initial="enter" animate="center" exit="exit"
              transition={{ duration: 0.55, delay: 0.05, ease }}
              className="hidden lg:block relative"
            >
              {/* Main image card */}
              <div className="relative h-[440px] rounded-[28px] overflow-hidden border border-white/10 shadow-2xl">
                {room.imageSrc ? (
                  <Image src={room.imageSrc} alt={room.label} fill className="object-cover" />
                ) : (
                  <div className="absolute inset-0" style={{ background: room.bgGradient }} />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

                {/* LED top strip on card */}
                <div className="absolute top-0 left-0 right-0 h-0.5"
                  style={{ background: `linear-gradient(to right, transparent, ${room.ledColor}, transparent)` }} />
                {/* LED bottom strip on card */}
                <div className="absolute bottom-0 left-0 right-0 h-0.5"
                  style={{ background: `linear-gradient(to right, transparent, ${room.ledColor}70, transparent)` }} />

                {/* Room counter */}
                <div className="absolute top-4 right-4 bg-black/40 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-1.5">
                  <span className="text-white/50 text-xs font-mono">{active + 1} / {rooms.length}</span>
                </div>

                {/* Bottom label */}
                <div className="absolute bottom-5 left-5">
                  <p className="text-white/40 text-xs uppercase tracking-wider">Room type</p>
                  <p className="text-white font-bold text-lg">{room.label}</p>
                </div>
              </div>

              {/* Floating price bubble */}
              <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="absolute -bottom-5 -left-6 bg-white/10 backdrop-blur-lg border border-white/15 rounded-2xl px-5 py-4 shadow-2xl"
              >
                <p className="text-white/40 text-[10px] uppercase tracking-wider mb-0.5">Best Price</p>
                <p className="text-white font-bold text-xl">
                  ₹{room.price.toLocaleString("en-IN")}
                  <span className="text-xs font-normal text-white/35">/night</span>
                </p>
              </motion.div>

              {/* Ambient glow behind card */}
              <div className="absolute inset-0 -z-10 rounded-[28px] blur-3xl opacity-20 scale-90"
                style={{ background: room.bgGradient }} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* ── Bottom selector tabs ───────────────────────────────── */}
      <div className="relative z-10 flex justify-center pb-8 pt-2">
        <div className="flex items-center gap-2 bg-black/35 backdrop-blur-xl border border-white/10 rounded-2xl p-1.5">
          {rooms.map((r, i) => (
            <button key={r.type} onClick={() => go(i)}
              className="relative px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors outline-none"
              style={{ color: active === i ? r.accentColor : "rgba(255,255,255,0.4)" }}>
              {active === i && (
                <motion.div layoutId="tab-pill"
                  className="absolute inset-0 rounded-xl border"
                  style={{ background: `${r.accentColor}12`, borderColor: `${r.accentColor}30` }}
                  transition={{ type: "spring", stiffness: 350, damping: 30 }}
                />
              )}
              <span className="relative z-10">{r.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Prev / Next arrows ────────────────────────────────── */}
      <button onClick={prev}
        className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 backdrop-blur-sm text-white flex items-center justify-center transition-all hover:scale-110">
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button onClick={next}
        className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 backdrop-blur-sm text-white flex items-center justify-center transition-all hover:scale-110">
        <ChevronRight className="w-5 h-5" />
      </button>

      {/* ── Progress dots ─────────────────────────────────────── */}
      <div className="absolute bottom-20 right-6 z-20 flex flex-col gap-1.5">
        {rooms.map((_, i) => (
          <button key={i} onClick={() => go(i)}
            className="w-1.5 rounded-full transition-all duration-300"
            style={{
              height: active === i ? "24px" : "6px",
              background: active === i ? room.accentColor : "rgba(255,255,255,0.2)",
            }}
          />
        ))}
      </div>
    </section>
  );
}
