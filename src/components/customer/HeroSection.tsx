"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ChevronDown, MapPin, Star } from "lucide-react";

const ease = [0.21, 0.47, 0.32, 0.98] as const;

// Pre-defined firefly positions (deterministic = no hydration mismatch)
const FIREFLIES = [
  { left: 7,  delay: 0.0,  duration: 4.8, size: 3 },
  { left: 14, delay: 1.3,  duration: 5.6, size: 2 },
  { left: 22, delay: 0.6,  duration: 4.2, size: 4 },
  { left: 31, delay: 2.1,  duration: 6.1, size: 2 },
  { left: 38, delay: 0.9,  duration: 5.0, size: 3 },
  { left: 46, delay: 3.2,  duration: 4.5, size: 2 },
  { left: 53, delay: 1.7,  duration: 5.8, size: 3 },
  { left: 61, delay: 0.3,  duration: 4.9, size: 2 },
  { left: 67, delay: 2.5,  duration: 5.3, size: 4 },
  { left: 74, delay: 1.1,  duration: 4.6, size: 2 },
  { left: 82, delay: 3.8,  duration: 6.0, size: 3 },
  { left: 89, delay: 0.8,  duration: 5.1, size: 2 },
  { left: 18, delay: 4.2,  duration: 4.7, size: 3 },
  { left: 43, delay: 2.9,  duration: 5.5, size: 2 },
  { left: 71, delay: 1.5,  duration: 4.3, size: 4 },
  { left: 56, delay: 3.5,  duration: 5.9, size: 2 },
  { left: 29, delay: 0.4,  duration: 6.2, size: 3 },
  { left: 85, delay: 2.3,  duration: 4.4, size: 2 },
  { left: 5,  delay: 3.1,  duration: 5.7, size: 3 },
  { left: 95, delay: 1.9,  duration: 4.8, size: 2 },
] as const;

// Word-by-word animated heading
function AnimatedHeading({ text, accent }: { text: string; accent: string }) {
  const words = text.split(" ");
  return (
    <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-white leading-[1.0] tracking-tight">
      {words.map((word, wi) => (
        <span key={wi} className="overflow-hidden inline-block mr-[0.25em] last:mr-0">
          <motion.span
            className="inline-block"
            style={{ color: word === accent ? "#F59E0B" : "white" }}
            initial={{ y: "110%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 + wi * 0.12, duration: 0.75, ease }}>
            {word}
          </motion.span>
        </span>
      ))}
    </h1>
  );
}

type Props = {
  heroImage: string | null;
  galleryImages: string[];
  avgRating: number | null;
  reviewCount: number;
};

export default function HeroSection({ heroImage, galleryImages, avgRating, reviewCount }: Props) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });

  // Parallax transforms
  const bgY = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);
  const contentY = useTransform(scrollYProgress, [0, 1], ["0%", "20%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  // Rotating photo strip (uses gallery images as floating thumbnails)
  const floatingImages = galleryImages.slice(0, 3);

  // Entrance for floating cards
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  return (
    <section ref={ref} className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">

      {/* ── Parallax background ─────────────────────────── */}
      <motion.div className="absolute inset-0 -z-10" style={{ y: bgY }}>
        <div className="absolute inset-0 bg-[#071209]" />
        {heroImage ? (
          <Image src={heroImage} alt="The Urban Escape" fill className="object-cover opacity-40" priority />
        ) : (
          /* Atmospheric gradient when no photo */
          <div className="absolute inset-0">
            <div className="absolute inset-0 bg-gradient-to-br from-[#071209] via-[#102016] to-[#071209]" />
            {/* Warm glow spots mimicking LED lighting */}
            <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] rounded-full bg-amber-900/15 blur-[100px]" />
            <div className="absolute bottom-1/3 right-1/4 w-[400px] h-[400px] rounded-full bg-blue-900/10 blur-[80px]" />
            <div className="absolute bottom-1/4 left-1/4 w-[300px] h-[300px] rounded-full bg-green-900/8 blur-[60px]" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/20 to-black/80" />
      </motion.div>

      {/* ── Firefly particles ───────────────────────────── */}
      <div className="absolute inset-0 -z-9 pointer-events-none overflow-hidden">
        {FIREFLIES.map((f, i) => (
          <span
            key={i}
            className="absolute bottom-[10%] rounded-full"
            style={{
              left: `${f.left}%`,
              width: f.size,
              height: f.size,
              background: i % 3 === 0 ? "#F59E0B" : i % 3 === 1 ? "#4ADE80" : "#60A5FA",
              boxShadow: `0 0 ${f.size * 3}px ${f.size * 2}px ${i % 3 === 0 ? "#F59E0B55" : i % 3 === 1 ? "#4ADE8055" : "#60A5FA55"}`,
              animation: `firefly-rise ${f.duration}s ease-in-out ${f.delay}s infinite`,
            }}
          />
        ))}
      </div>

      {/* ── Breathing ambient blobs ──────────────────────── */}
      <div className="absolute inset-0 pointer-events-none -z-10">
        <div className="blob-breathe absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-amber-900/15 blur-[90px]" />
        <div className="blob-breathe-slow absolute bottom-1/3 right-1/4 w-[400px] h-[400px] rounded-full bg-blue-900/12 blur-[80px]" style={{ animationDelay: "3s" }} />
        <div className="blob-breathe absolute bottom-1/4 left-1/3 w-[300px] h-[300px] rounded-full bg-green-900/10 blur-[70px]" style={{ animationDelay: "1.5s" }} />
      </div>

      {/* ── Top LED strip ───────────────────────────────── */}
      <motion.div className="absolute top-0 left-0 right-0 h-px z-20"
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={{ delay: 1.4, duration: 1.2, ease }}>
        <div className="h-full bg-gradient-to-r from-transparent via-amber-400/80 to-transparent" />
      </motion.div>

      {/* ── Floating room preview cards (desktop) ───────── */}
      {mounted && floatingImages.length > 0 && (
        <div className="absolute right-8 top-1/2 -translate-y-1/2 hidden xl:flex flex-col gap-3 z-10">
          {floatingImages.map((src, i) => (
            <motion.div key={i}
              initial={{ opacity: 0, x: 80, scale: 0.85 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{ delay: 1.0 + i * 0.15, duration: 0.7, ease }}
              whileHover={{ scale: 1.05, x: -4 }}
              className="relative w-32 h-24 rounded-2xl overflow-hidden border border-white/10 shadow-2xl cursor-pointer"
            >
              <Image src={src} alt={`Preview ${i + 1}`} fill className="object-cover" />
              <div className="absolute inset-0 bg-black/20" />
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Pine wood texture accent (left) ─────────────── */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-transparent via-amber-500/30 to-transparent hidden lg:block" />

      {/* ── Main content ────────────────────────────────── */}
      <motion.div className="relative z-10 text-center px-5 max-w-4xl mx-auto" style={{ y: contentY, opacity }}>

        {/* Location badge — links to Google Maps */}
        <motion.a
          href="https://maps.app.goo.gl/tm4cHuKkTpe39ymd6"
          target="_blank"
          rel="noopener noreferrer"
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.6, ease }}
          className="inline-flex items-center gap-2 bg-amber-500/12 border border-amber-400/25 text-amber-300 text-xs font-bold px-4 py-2 rounded-full mb-7 tracking-[0.15em] uppercase hover:bg-amber-500/20 hover:border-amber-400/40 transition-all cursor-pointer"
        >
          <MapPin className="w-3.5 h-3.5" />
          Bhilai, Chhattisgarh
        </motion.a>

        {/* Animated heading */}
        <div className="mb-4">
          <AnimatedHeading text="The Urban Escape" accent="Escape" />
        </div>

        {/* Byline */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.85, duration: 0.8 }}
          className="text-white/40 text-xs tracking-[0.4em] uppercase mb-6 font-light"
        >
          By Saubhagya Mangalam
        </motion.p>

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0, duration: 0.7, ease }}
          className="text-white/60 text-base sm:text-lg leading-relaxed max-w-xl mx-auto mb-10"
        >
          Handcrafted cottages where pine wood meets LED luxury —
          amber warmth, electric blue moods, lush green surroundings.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.15, duration: 0.7, ease }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <Link href="/hotel/the-urban-escape-bhilai"
            className="shimmer-btn group inline-flex items-center justify-center gap-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold px-9 py-4 rounded-2xl transition-all duration-200 hover:scale-105 shadow-2xl shadow-amber-500/30 text-base"
          >
            Book Your Stay
            <motion.span animate={{ x: [0, 4, 0] }} transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}>
              <ArrowRight className="w-5 h-5" />
            </motion.span>
          </Link>
          <a href="#rooms"
            className="inline-flex items-center justify-center gap-2 border border-white/20 hover:border-amber-400/40 bg-white/5 hover:bg-amber-400/5 text-white/70 hover:text-white px-9 py-4 rounded-2xl transition-all duration-200 backdrop-blur-sm text-base"
          >
            Explore Rooms <ChevronDown className="w-5 h-5" />
          </a>
        </motion.div>

        {/* Rating strip */}
        {avgRating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.4, duration: 0.6 }}
            className="mt-10 flex items-center justify-center gap-3"
          >
            <div className="flex">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className={`w-4 h-4 ${i <= Math.round(avgRating) ? "fill-amber-400 text-amber-400" : "fill-white/10 text-white/15"}`} />
              ))}
            </div>
            <span className="text-white/40 text-sm">
              <span className="text-white/70 font-semibold">{avgRating.toFixed(1)}</span> · {reviewCount} guest reviews
            </span>
          </motion.div>
        )}
      </motion.div>

      {/* ── Scroll indicator ────────────────────────────── */}
      <motion.div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.8 }}>
        <motion.div animate={{ y: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}>
          <ChevronDown className="w-6 h-6 text-white/30" />
        </motion.div>
      </motion.div>

      {/* ── Bottom fade into next section ───────────────── */}
      <div className="absolute bottom-0 left-0 right-0 h-28 bg-gradient-to-t from-[#0D1B0E] to-transparent pointer-events-none" />
    </section>
  );
}
