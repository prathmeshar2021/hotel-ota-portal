"use client";

/**
 * Slim sticky booking bar — mobile only. Slides up once the visitor scrolls
 * past the hero (where the booking widget lives), keeping the funnel one tap
 * away. Spans left-4 → right-24 so the chat/WhatsApp buttons keep their
 * bottom-right corner.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

export default function MobileBookBar({ minPrice }: { minPrice: number }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setShow(window.scrollY > window.innerHeight * 0.7);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      className={`md:hidden fixed bottom-4 left-4 right-24 z-[55] transition-all duration-300 ${
        show ? "translate-y-0 opacity-100" : "translate-y-24 opacity-0 pointer-events-none"
      }`}
    >
      <div className="flex items-center justify-between gap-3 bg-[#0D1B0E]/95 backdrop-blur-md border border-white/12 rounded-2xl pl-4 pr-2 py-2 shadow-2xl shadow-black/50">
        <div className="leading-tight min-w-0">
          <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Rooms from</p>
          <p className="text-amber-400 font-bold text-base whitespace-nowrap">
            ₹{minPrice.toLocaleString("en-IN")}
            <span className="text-white/35 text-xs font-medium"> /night</span>
          </p>
        </div>
        <Link
          href="/hotel/the-urban-escape-bhilai"
          className="flex items-center gap-1.5 bg-amber-500 active:bg-amber-400 text-black font-bold text-sm px-4 py-2.5 rounded-xl shrink-0"
        >
          Book Now <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
