import Image from "next/image";
import Link from "next/link";
import { Users, ArrowRight, BedDouble, CheckCircle2 } from "lucide-react";
import { type CategoryMeta, categoryToSlug, type RoomCategoryType } from "@/lib/utils/room-categories";

interface CategoryCardProps {
  categoryType: RoomCategoryType;
  meta: CategoryMeta;
  hotelSlug: string;
  hotelImages: string[];           // hotel-level images to use until category-specific ones are added
  pricePerNight: number;
  availableRooms: number;          // 0 = fully booked
  searchParams?: { checkIn?: string; checkOut?: string; guests?: string };
}

export default function CategoryCard({
  categoryType,
  meta,
  hotelSlug,
  hotelImages,
  pricePerNight,
  availableRooms,
  searchParams,
}: CategoryCardProps) {
  const qs = new URLSearchParams();
  if (searchParams?.checkIn)  qs.set("checkIn",  searchParams.checkIn);
  if (searchParams?.checkOut) qs.set("checkOut", searchParams.checkOut);
  if (searchParams?.guests)   qs.set("guests",   searchParams.guests);
  const query = qs.toString();

  const nights =
    searchParams?.checkIn && searchParams?.checkOut
      ? Math.ceil(
          (new Date(searchParams.checkOut).getTime() -
            new Date(searchParams.checkIn).getTime()) /
            86400000
        )
      : null;

  const slug       = categoryToSlug(categoryType);
  const isBooked   = availableRooms === 0;
  const imageSrc   = hotelImages[0] ?? "/images/hero.jpg";
  const { accentColor } = meta;

  return (
    <div
      className={`group relative bg-gradient-to-br from-white/[0.07] to-white/[0.02] border rounded-3xl overflow-hidden flex flex-col sm:flex-row transition-all duration-350 shadow-[0_8px_32px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.12)] ${
        isBooked
          ? "border-white/5 opacity-60"
          : "border-white/10 hover:border-white/18 hover:from-white/[0.10] hover:to-white/[0.04] hover:shadow-[0_20px_56px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.20)] hover:-translate-y-1"
      }`}
    >
      {/* Crystal shimmer */}
      {!isBooked && (
        <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden rounded-3xl">
          <div className="absolute top-0 left-[-80%] w-[45%] h-full bg-gradient-to-r from-transparent via-white/[0.05] to-transparent skew-x-[-12deg] animate-[crystal-shimmer_14s_ease-in-out_2s_infinite]" />
        </div>
      )}

      {/* Image */}
      <div className="relative w-full sm:w-56 h-44 sm:h-auto shrink-0 overflow-hidden">
        <Image
          src={imageSrc}
          alt={meta.displayName}
          fill
          className={`object-cover transition-transform duration-500 ${!isBooked ? "group-hover:scale-105" : ""}`}
        />
        <div className={`absolute inset-0 bg-gradient-to-r ${meta.accentGradient}`} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

        {/* Category badge */}
        <div className="absolute top-3 left-3">
          <span
            className="text-xs font-bold px-2.5 py-1 rounded-full text-black"
            style={{ background: accentColor }}
          >
            {meta.shortName}
          </span>
        </div>

        {/* Availability chip */}
        <div className="absolute bottom-3 left-3">
          {isBooked ? (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-500/80 text-white">
              Fully Booked
            </span>
          ) : (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-black/50 text-white/80 flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3 text-green-400" />
              {availableRooms} of {meta.totalRooms} available
            </span>
          )}
        </div>
      </div>

      {/* Details */}
      <div className="flex flex-col sm:flex-row flex-1 p-5 gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border"
              style={{ color: accentColor, borderColor: `${accentColor}30`, background: `${accentColor}10` }}>
              {meta.group}
            </span>
          </div>
          <h3 className="font-bold text-white text-base mb-1.5">{meta.displayName}</h3>

          <p className="flex items-center gap-1.5 text-sm text-white/45 mb-2">
            <Users className="w-3.5 h-3.5" style={{ color: accentColor }} />
            Up to {meta.maxGuests} guests
          </p>
          <p className="flex items-center gap-1.5 text-sm text-white/45 mb-3">
            <BedDouble className="w-3.5 h-3.5" style={{ color: accentColor }} />
            {meta.totalRooms} room{meta.totalRooms !== 1 ? "s" : ""} available
          </p>

          <p className="text-xs text-white/35 leading-relaxed line-clamp-2">
            {meta.description}
          </p>
        </div>

        {/* Price + CTA */}
        <div className="flex sm:flex-col items-end sm:items-end justify-between sm:justify-between gap-3 shrink-0">
          <div className="text-right">
            <p className="text-2xl font-bold" style={{ color: accentColor }}>
              ₹{pricePerNight.toLocaleString("en-IN")}
            </p>
            <p className="text-xs text-white/30">per night + taxes</p>
            {nights && !isBooked && (
              <p className="text-xs font-semibold text-white/55 mt-1">
                ₹{(pricePerNight * nights).toLocaleString("en-IN")} for {nights}N
              </p>
            )}
          </div>

          {isBooked ? (
            <span className="flex items-center gap-1.5 text-sm font-bold px-4 py-2.5 rounded-xl text-white/30 bg-white/5 border border-white/8 cursor-not-allowed whitespace-nowrap">
              Not Available
            </span>
          ) : (
            <Link
              href={`/book/${hotelSlug}/${slug}${query ? `?${query}` : ""}`}
              className="flex items-center gap-1.5 text-sm font-bold px-4 py-2.5 rounded-xl text-black transition-all hover:scale-105 active:scale-95 whitespace-nowrap shadow-lg"
              style={{ background: accentColor, boxShadow: `0 8px 24px ${accentColor}30` }}
            >
              Book Now <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
