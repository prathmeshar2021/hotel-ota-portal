import Image from "next/image";
import Link from "next/link";
import { Users, Wind, Waves, Trees, Tv, ArrowRight } from "lucide-react";

type RoomType = "LUXURY_COTTAGE" | "AC_ROOM" | "NON_AC_ROOM";

interface Room {
  id: string;
  roomNumber: string;
  roomType: RoomType;
  capacity: number;
  basePrice: number;
  description: string | null;
  images: string[];
  amenities: string[];
}

interface RoomCardProps {
  room: Room;
  hotelSlug: string;
  searchParams?: { checkIn?: string; checkOut?: string; guests?: string };
}

const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  LUXURY_COTTAGE: "Luxury Cottage",
  AC_ROOM: "AC Room",
  NON_AC_ROOM: "Non-AC Room",
};

const ROOM_ACCENT: Record<RoomType, { color: string; gradient: string }> = {
  LUXURY_COTTAGE: { color: "#F59E0B", gradient: "from-amber-950/60 to-transparent" },
  AC_ROOM: { color: "#60A5FA", gradient: "from-blue-950/60 to-transparent" },
  NON_AC_ROOM: { color: "#4ADE80", gradient: "from-green-950/60 to-transparent" },
};

const ROOM_FALLBACK: Record<RoomType, string> = {
  LUXURY_COTTAGE: "/images/lc-interior.jpg",
  AC_ROOM: "/images/ac-interior.jpg",
  NON_AC_ROOM: "/images/nonac-interior.jpg",
};

const ROOM_ICONS: Record<string, React.ReactNode> = {
  "Air Conditioning": <Wind className="w-3.5 h-3.5" />,
  Pool: <Waves className="w-3.5 h-3.5" />,
  "Forest View": <Trees className="w-3.5 h-3.5" />,
  TV: <Tv className="w-3.5 h-3.5" />,
};

export default function RoomCard({ room, hotelSlug, searchParams }: RoomCardProps) {
  const qs = new URLSearchParams();
  if (searchParams?.checkIn) qs.set("checkIn", searchParams.checkIn);
  if (searchParams?.checkOut) qs.set("checkOut", searchParams.checkOut);
  if (searchParams?.guests) qs.set("guests", searchParams.guests);
  const query = qs.toString();

  const nights =
    searchParams?.checkIn && searchParams?.checkOut
      ? Math.ceil(
          (new Date(searchParams.checkOut).getTime() -
            new Date(searchParams.checkIn).getTime()) /
            86400000
        )
      : null;

  const accent = ROOM_ACCENT[room.roomType] ?? ROOM_ACCENT.LUXURY_COTTAGE;
  const imageSrc = room.images[0] ?? ROOM_FALLBACK[room.roomType];

  return (
    <div className="group relative bg-gradient-to-br from-white/[0.07] to-white/[0.02] border border-white/10 rounded-3xl overflow-hidden flex flex-col sm:flex-row transition-all duration-350 hover:border-white/18 hover:from-white/[0.10] hover:to-white/[0.04] shadow-[0_8px_32px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.12)] hover:shadow-[0_20px_56px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.20)] hover:-translate-y-1">
      {/* Crystal shimmer sweep */}
      <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden rounded-3xl">
        <div className="absolute top-0 left-[-80%] w-[45%] h-full bg-gradient-to-r from-transparent via-white/[0.05] to-transparent skew-x-[-12deg] animate-[crystal-shimmer_14s_ease-in-out_2s_infinite]" />
      </div>
      {/* Room image */}
      <div className="relative w-full sm:w-56 h-44 sm:h-auto shrink-0 overflow-hidden">
        <Image
          src={imageSrc}
          alt={room.roomNumber}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className={`absolute inset-0 bg-gradient-to-r ${accent.gradient}`} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        {/* Room number badge */}
        <div className="absolute top-3 left-3">
          <span
            className="text-xs font-bold px-2.5 py-1 rounded-full text-black"
            style={{ background: accent.color }}
          >
            #{room.roomNumber}
          </span>
        </div>
      </div>

      {/* Room details */}
      <div className="flex flex-col sm:flex-row flex-1 p-5 gap-4">
        <div className="flex-1">
          <h3 className="font-bold text-white text-base mb-1.5">
            {ROOM_TYPE_LABELS[room.roomType]}
          </h3>
          <p className="flex items-center gap-1.5 text-sm text-white/45 mb-3">
            <Users className="w-3.5 h-3.5" style={{ color: accent.color }} />
            Up to {room.capacity} guests
          </p>

          {room.description && (
            <p className="text-xs text-white/35 mb-3 line-clamp-2 leading-relaxed">
              {room.description}
            </p>
          )}

          <div className="flex flex-wrap gap-1.5">
            {room.amenities.slice(0, 5).map((a) => (
              <span
                key={a}
                className="flex items-center gap-1 text-xs text-white/40 bg-white/5 border border-white/8 px-2.5 py-1 rounded-full"
              >
                {ROOM_ICONS[a]}
                {a}
              </span>
            ))}
          </div>
        </div>

        {/* Price + CTA */}
        <div className="flex sm:flex-col items-end sm:items-end justify-between sm:justify-between gap-3 shrink-0">
          <div className="text-right">
            <p className="text-2xl font-bold" style={{ color: accent.color }}>
              ₹{room.basePrice.toLocaleString("en-IN")}
            </p>
            <p className="text-xs text-white/30">per night + taxes</p>
            {nights && (
              <p className="text-xs font-semibold text-white/55 mt-1">
                ₹{(room.basePrice * nights).toLocaleString("en-IN")} for {nights}N
              </p>
            )}
          </div>
          <Link
            href={`/book/${hotelSlug}/${room.id}${query ? `?${query}` : ""}`}
            className="flex items-center gap-1.5 text-sm font-bold px-4 py-2.5 rounded-xl text-black transition-all hover:scale-105 active:scale-95 whitespace-nowrap shadow-lg"
            style={{ background: accent.color, boxShadow: `0 8px 24px ${accent.color}30` }}
          >
            Book Now <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
