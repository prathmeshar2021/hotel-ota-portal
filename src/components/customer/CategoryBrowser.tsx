"use client";

import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { Users, BedDouble, ArrowRight, CheckCircle2, Plus } from "lucide-react";
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
    <div className="space-y-8">
      {mains.map((m) => (
        <div key={m.key}>
          {/* Group separator */}
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px flex-1" style={{ background: `${m.accentColor}20` }} />
            <span
              className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full border"
              style={{ color: m.accentColor, borderColor: `${m.accentColor}30`, background: `${m.accentColor}10` }}
            >
              {m.displayName}
            </span>
            <div className="h-px flex-1" style={{ background: `${m.accentColor}20` }} />
          </div>

          {/* Subcategory cards */}
          <div className="space-y-4">
            {m.subcategories.map((s) => {
              const soldOut = hasDateFilter && s.available === 0;
              const imageSrc = s.images[0] ?? m.heroImage;
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
                  <div className="relative w-full sm:w-56 h-44 sm:h-auto shrink-0 overflow-hidden">
                    <Image
                      src={imageSrc}
                      alt={s.displayName}
                      fill
                      className={`object-cover transition-transform duration-500 ${!soldOut ? "group-hover:scale-105" : ""}`}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div
                      className="absolute top-0 left-0 right-0 h-0.5"
                      style={{ background: `linear-gradient(to right, transparent, ${s.accentColor}, transparent)` }}
                    />
                    <div className="absolute top-3 left-3">
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full text-black" style={{ background: s.accentColor }}>
                        {s.shortName}
                      </span>
                    </div>
                    <div className="absolute bottom-3 left-3">
                      {soldOut ? (
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-500/80 text-white">Fully Booked</span>
                      ) : hasDateFilter ? (
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-black/50 text-white/80 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3 h-3 text-green-400" />
                          Available
                        </span>
                      ) : null}
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
          </div>
        </div>
      ))}
    </div>
  );
}
