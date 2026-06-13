"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Users, BedDouble, ArrowRight, ChevronRight, ArrowLeft, CheckCircle2, Plus } from "lucide-react";
import { useCart } from "@/lib/cart/CartContext";

export interface SubCategoryView {
  type: string;
  slug: string;
  displayName: string;
  shortName: string;
  description: string;
  accentColor: string;
  maxGuests: number;
  totalRooms: number;
  available: number;
  price: number;          // price after the marketing discount (what the guest pays)
  originalPrice: number;  // pre-discount price, for struck-through display
  images: string[];
}

export interface MainCategoryView {
  key: string;
  displayName: string;
  tagline: string;
  description: string;
  accentColor: string;
  heroImage: string;
  totalRooms: number;
  available: number;
  minPrice: number;          // discounted "from" price
  originalMinPrice: number;  // pre-discount "from" price
  subcategories: SubCategoryView[];
}

const ease = [0.21, 0.47, 0.32, 0.98] as const;

export default function CategoryBrowser({
  mains,
  hotelSlug,
  hotelId,
  checkIn,
  checkOut,
  query,
  hasDateFilter,
  nights,
}: {
  mains: MainCategoryView[];
  hotelSlug: string;
  hotelId: string;
  checkIn?: string;
  checkOut?: string;
  query: string;
  hasDateFilter: boolean;
  nights: number | null;
}) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const active = mains.find((m) => m.key === activeKey) ?? null;
  const { addItem, items } = useCart();

  const canAddToCart = hasDateFilter && !!checkIn && !!checkOut;

  function handleAdd(s: SubCategoryView) {
    if (!checkIn || !checkOut) return;
    const inCart = items.find((i) => i.categoryType === s.type)?.qty ?? 0;
    if (inCart + 1 > s.available) {
      toast.error("No more rooms of this type are available for your dates.");
      return;
    }
    addItem(
      { hotelId, hotelSlug, checkIn, checkOut },
      {
        categoryType: s.type,
        slug: s.slug,
        displayName: s.displayName,
        pricePerNight: s.price,
        originalPricePerNight: s.originalPrice,
        capacity: s.maxGuests,
        guestsPerRoom: Math.min(2, s.maxGuests),
        image: s.images[0] ?? null,
        accentColor: s.accentColor,
      }
    );
    toast.success(`${s.displayName} added to cart`);
  }

  return (
    <div className="relative">
      <AnimatePresence mode="wait">
        {!active ? (
          /* ── Level 1: main category cards ───────────────────────── */
          <motion.div
            key="mains"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.4, ease }}
            className="grid grid-cols-1 sm:grid-cols-3 gap-4"
          >
            {mains.map((m) => {
              const soldOut = hasDateFilter && m.available === 0;
              return (
                <button
                  key={m.key}
                  onClick={() => !soldOut && setActiveKey(m.key)}
                  disabled={soldOut}
                  className={`group relative text-left rounded-3xl overflow-hidden border transition-all duration-300 ${
                    soldOut
                      ? "border-white/5 opacity-55 cursor-not-allowed"
                      : "border-white/10 hover:border-white/20 hover:-translate-y-1 shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
                  }`}
                >
                  {/* Cover */}
                  <div className="relative h-44 overflow-hidden">
                    <Image
                      src={m.heroImage}
                      alt={m.displayName}
                      fill
                      className={`object-cover transition-transform duration-500 ${!soldOut ? "group-hover:scale-105" : ""}`}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                    <div
                      className="absolute top-0 left-0 right-0 h-0.5"
                      style={{ background: `linear-gradient(to right, transparent, ${m.accentColor}, transparent)` }}
                    />
                    <div className="absolute bottom-3 left-4 right-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] mb-0.5" style={{ color: m.accentColor }}>
                        {m.tagline}
                      </p>
                      <h3 className="text-white font-bold text-lg leading-tight">{m.displayName}</h3>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="p-4 bg-white/[0.03]">
                    <p className="text-white/40 text-xs leading-relaxed line-clamp-2 mb-3 min-h-[2rem]">
                      {m.description}
                    </p>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white/30 text-[10px] uppercase tracking-wider">From</p>
                        <p className="font-bold flex items-baseline gap-1.5" style={{ color: m.accentColor }}>
                          {m.originalMinPrice > m.minPrice && (
                            <span className="text-white/30 text-xs font-normal line-through">
                              ₹{m.originalMinPrice.toLocaleString("en-IN")}
                            </span>
                          )}
                          ₹{m.minPrice.toLocaleString("en-IN")}
                          <span className="text-white/30 text-xs font-normal">/night</span>
                        </p>
                      </div>
                      {soldOut ? (
                        <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/20">
                          Fully Booked
                        </span>
                      ) : (
                        <span
                          className="flex items-center gap-1 text-xs font-bold px-3 py-2 rounded-xl text-black transition-transform group-hover:scale-105"
                          style={{ background: m.accentColor }}
                        >
                          {hasDateFilter ? "Available" : "Explore"}
                          <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </motion.div>
        ) : (
          /* ── Level 2: sub-category cards for the chosen main ───────── */
          <motion.div
            key={`subs-${active.key}`}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.4, ease }}
            className="space-y-4"
          >
            {/* Back header */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setActiveKey(null)}
                className="flex items-center gap-1.5 text-sm text-white/55 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> All categories
              </button>
              <span
                className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full border"
                style={{ color: active.accentColor, borderColor: `${active.accentColor}30`, background: `${active.accentColor}10` }}
              >
                {active.displayName}
              </span>
            </div>

            {active.subcategories.map((s) => {
              const soldOut = hasDateFilter && s.available === 0;
              const imageSrc = s.images[0] ?? active.heroImage;
              return (
                <div
                  key={s.type}
                  className={`group relative rounded-3xl overflow-hidden flex flex-col sm:flex-row border transition-all duration-300 ${
                    soldOut
                      ? "border-white/5 opacity-60"
                      : "border-white/10 hover:border-white/18 hover:-translate-y-0.5 shadow-[0_8px_32px_rgba(0,0,0,0.35)]"
                  }`}
                >
                  {/* Image */}
                  <div className="relative w-full sm:w-60 h-44 sm:h-auto shrink-0 overflow-hidden">
                    <Image
                      src={imageSrc}
                      alt={s.displayName}
                      fill
                      className={`object-cover transition-transform duration-500 ${!soldOut ? "group-hover:scale-105" : ""}`}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute top-3 left-3">
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full text-black" style={{ background: s.accentColor }}>
                        {s.shortName}
                      </span>
                    </div>
                    <div className="absolute bottom-3 left-3">
                      {soldOut ? (
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-500/80 text-white">Fully Booked</span>
                      ) : (
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-black/50 text-white/80 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3 h-3 text-green-400" />
                          Available
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Details */}
                  <div className="flex flex-col sm:flex-row flex-1 p-5 gap-4 bg-white/[0.03]">
                    <div className="flex-1">
                      <h3 className="font-bold text-white text-base mb-1.5">{s.displayName}</h3>
                      <p className="flex items-center gap-1.5 text-sm text-white/45 mb-1">
                        <Users className="w-3.5 h-3.5" style={{ color: s.accentColor }} />
                        Up to {s.maxGuests} guests
                      </p>
                      <p className="flex items-center gap-1.5 text-sm text-white/45 mb-3">
                        <BedDouble className="w-3.5 h-3.5" style={{ color: s.accentColor }} />
                        {s.totalRooms} room{s.totalRooms !== 1 ? "s" : ""}
                      </p>
                      <p className="text-xs text-white/35 leading-relaxed line-clamp-2">{s.description}</p>
                    </div>

                    {/* Price + CTA */}
                    <div className="flex sm:flex-col items-end justify-between gap-3 shrink-0">
                      <div className="text-right">
                        {s.originalPrice > s.price && (
                          <p className="text-sm text-white/30 line-through leading-none mb-0.5">
                            ₹{s.originalPrice.toLocaleString("en-IN")}
                          </p>
                        )}
                        <p className="text-2xl font-bold" style={{ color: s.accentColor }}>
                          ₹{s.price.toLocaleString("en-IN")}
                        </p>
                        <p className="text-xs text-white/30">per night + taxes</p>
                        {s.originalPrice > s.price && (
                          <p className="text-[10px] font-bold text-violet-300 mt-0.5">
                            Save ₹{(s.originalPrice - s.price).toLocaleString("en-IN")}/night
                          </p>
                        )}
                        {nights && !soldOut && (
                          <p className="text-xs font-semibold text-white/55 mt-1">
                            ₹{(s.price * nights).toLocaleString("en-IN")} for {nights}N
                          </p>
                        )}
                      </div>

                      {soldOut ? (
                        <span className="text-sm font-bold px-4 py-2.5 rounded-xl text-white/30 bg-white/5 border border-white/8 cursor-not-allowed whitespace-nowrap">
                          Not Available
                        </span>
                      ) : (
                        <div className="flex flex-col items-stretch gap-2 w-full sm:w-auto">
                          <Link
                            href={`/book/${hotelSlug}/${s.slug}${query ? `?${query}` : ""}`}
                            className="flex items-center justify-center gap-1.5 text-sm font-bold px-4 py-2.5 rounded-xl text-black transition-all hover:scale-105 active:scale-95 whitespace-nowrap shadow-lg"
                            style={{ background: s.accentColor, boxShadow: `0 8px 24px ${s.accentColor}30` }}
                          >
                            Book Now <ArrowRight className="w-4 h-4" />
                          </Link>
                          {canAddToCart && (
                            <button
                              onClick={() => handleAdd(s)}
                              className="flex items-center justify-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl text-white/70 hover:text-white bg-white/5 hover:bg-white/10 border border-white/12 transition-all whitespace-nowrap"
                            >
                              <Plus className="w-3.5 h-3.5" /> Add to cart
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
