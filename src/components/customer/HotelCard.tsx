import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { MapPin, Star, Wifi, Car, Utensils, Wind, Waves } from "lucide-react";

interface HotelCardProps {
  hotel: {
    id: string;
    name: string;
    slug: string;
    city: string;
    state: string;
    images: string[];
    amenities: string[];
    starRating: number;
    avgRating: number | null;
    reviewCount: number;
    minPrice: number | null;          // price after the marketing discount
    originalMinPrice?: number | null; // pre-discount price, for struck-through display
    availableRooms: number;
  };
  searchParams?: {
    checkIn?: string;
    checkOut?: string;
    guests?: string;
  };
}

const AMENITY_ICONS: Record<string, React.ReactNode> = {
  WiFi: <Wifi className="w-3.5 h-3.5" />,
  Parking: <Car className="w-3.5 h-3.5" />,
  Restaurant: <Utensils className="w-3.5 h-3.5" />,
  "Air Conditioning": <Wind className="w-3.5 h-3.5" />,
  Pool: <Waves className="w-3.5 h-3.5" />,
};

export default function HotelCard({ hotel, searchParams }: HotelCardProps) {
  const qs = new URLSearchParams();
  if (searchParams?.checkIn) qs.set("checkIn", searchParams.checkIn);
  if (searchParams?.checkOut) qs.set("checkOut", searchParams.checkOut);
  if (searchParams?.guests) qs.set("guests", searchParams.guests);
  const query = qs.toString();

  return (
    <Link href={`/hotel/${hotel.slug}${query ? `?${query}` : ""}`} className="group block">
      <div className="glass-card glass-card-hover glass-shimmer glass-top-highlight rounded-2xl overflow-hidden">
        {/* Image */}
        <div className="relative h-48 bg-gradient-to-br from-[#071209] to-[#102016]">
          {hotel.images[0] ? (
            <Image
              src={hotel.images[0]}
              alt={hotel.name}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-blue-200 text-5xl">🏨</div>
          )}
          <div className="absolute top-3 left-3 flex gap-2">
            {hotel.availableRooms > 0 ? (
              <Badge className="bg-green-600 text-white border-0 text-xs">
                Available
              </Badge>
            ) : (
              <Badge variant="destructive" className="text-xs">Fully booked</Badge>
            )}
          </div>
        </div>

        <div className="p-4">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="font-semibold text-white text-sm leading-snug line-clamp-2">{hotel.name}</h3>
            {hotel.avgRating && (
              <span className="flex items-center gap-0.5 shrink-0 text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full">
                <Star className="w-3 h-3 fill-amber-400" />
                {hotel.avgRating.toFixed(1)}
              </span>
            )}
          </div>

          <p className="text-xs text-white/40 flex items-center gap-1 mb-3">
            <MapPin className="w-3 h-3 text-amber-400/60" /> {hotel.city}, {hotel.state}
          </p>

          <div className="flex flex-wrap gap-1.5 mb-4">
            {hotel.amenities.slice(0, 4).map((a) => (
              <span key={a} className="glass-badge flex items-center gap-1 text-xs text-white/50 px-2 py-0.5 rounded-full">
                <span className="text-amber-400/60">{AMENITY_ICONS[a]}</span>
                {a}
              </span>
            ))}
          </div>

          <div className="flex items-end justify-between pt-3 border-t border-white/8">
            {hotel.minPrice ? (
              <div>
                <p className="text-xs text-white/35">Starts from</p>
                <p className="text-lg font-bold text-amber-400 flex items-baseline gap-1.5">
                  {hotel.originalMinPrice != null && hotel.originalMinPrice > hotel.minPrice && (
                    <span className="text-xs font-normal text-white/30 line-through">
                      ₹{hotel.originalMinPrice.toLocaleString("en-IN")}
                    </span>
                  )}
                  ₹{hotel.minPrice.toLocaleString("en-IN")}
                  <span className="text-xs font-normal text-white/35">/night</span>
                </p>
                {hotel.originalMinPrice != null && hotel.originalMinPrice > hotel.minPrice && (
                  <p className="text-[10px] font-bold text-violet-300">
                    Save ₹{(hotel.originalMinPrice - hotel.minPrice).toLocaleString("en-IN")}/night
                  </p>
                )}
                {hotel.reviewCount > 0 && (
                  <p className="text-xs text-white/30">{hotel.reviewCount} reviews</p>
                )}
              </div>
            ) : (
              <span className="text-sm text-white/35">Price on request</span>
            )}
            <span className="text-xs font-semibold text-amber-400/70 group-hover:text-amber-400 transition-colors">
              View rooms →
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
