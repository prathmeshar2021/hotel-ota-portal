// Revalidate the homepage every 60 s (ISR). Hotel info, rooms and reviews
// change infrequently — no need to hit the DB on every visitor request.
export const revalidate = 60;

import Link from "next/link";
import Image from "next/image";
import Navbar from "@/components/customer/Navbar";
import HeroSection from "@/components/customer/HeroSection";
import RoomShowcase from "@/components/customer/RoomShowcase";
import { FadeUp, FadeIn, SlideIn, ScaleIn, Stagger, StaggerItem, CountUpStat } from "@/components/customer/AnimatedSection";
import ReviewMarquee from "@/components/customer/ReviewMarquee";
import { prisma } from "@/lib/db/prisma";
import { Mail, MapPin, Phone, Shield, Tv2, Wind, Zap, Droplets, Car, Wifi, Flame, ArrowRight } from "lucide-react";
import type { ShowcaseRoom } from "@/components/customer/RoomShowcase";
import { getCategoryImages } from "@/lib/utils/room-categories";
import { getUniversalDiscount } from "@/lib/utils/booking";
import { discountedNightlyPrice } from "@/lib/utils/booking-calc";
import HeroZoomOverlay from "@/components/customer/HeroZoomOverlay";

async function getResort() {
  return prisma.hotel.findUnique({
    where: { slug: "the-urban-escape-bhilai" },
    include: {
      rooms: { where: { isActive: true }, orderBy: { basePrice: "asc" } },
      reviews: { where: { isVisible: true }, include: { guest: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 9 },
    },
  });
}

const ROOM_CONFIG: Record<string, Omit<ShowcaseRoom, "price" | "capacity" | "imageSrc" | "hotelSlug">> = {
  LUXURY_COTTAGE: {
    type: "LUXURY_COTTAGE",
    label: "Luxury Cottage",
    tagline: "Pine Wood · Amber Soul",
    description:
      "Our finest cottages — handcrafted pine interiors, warm amber LED strips, premium furnishings and a private sit-out with breathtaking forest views. Up to 4 guests.",
    bgGradient: "linear-gradient(135deg, #2A1205 0%, #6B3410 60%, #1A0A02 100%)",
    accentColor: "#F59E0B",
    accentBg: "#F59E0B15",
    ledColor: "#F59E0B",
    features: ["Premium Furnishings", "Amber LED Strips", "Private Sit-out", "Forest Views", "Air Conditioning", "Smart TV"],
  },
  PINEWOOD_COTTAGE: {
    type: "PINEWOOD_COTTAGE",
    label: "Pinewood Cottage",
    tagline: "Rustic Charm · Pine Nest",
    description:
      "Cozy cottages nestled among the pines with a warm, rustic charm, a private sit-out and all the modern comforts. The perfect woodland hideaway for up to 4.",
    bgGradient: "linear-gradient(135deg, #0A2012 0%, #14502E 60%, #05140A 100%)",
    accentColor: "#86EFAC",
    accentBg: "#86EFAC15",
    ledColor: "#34D399",
    features: ["Pine Wood Interiors", "Private Sit-out", "Rustic Charm", "Forest Views", "Air Conditioning", "Smart TV"],
  },
  THEATRE_COTTAGE: {
    type: "THEATRE_COTTAGE",
    label: "Theatre Style Cottage",
    tagline: "Private Screen · Exclusive Stay",
    description:
      "An exclusive private cottage with a theatre-style entertainment setup — the ideal special-occasion getaway for up to 4 guests.",
    bgGradient: "linear-gradient(135deg, #2A0810 0%, #6B1024 60%, #150409 100%)",
    accentColor: "#FCA5A5",
    accentBg: "#FCA5A515",
    ledColor: "#F87171",
    features: ["Theatre Setup", "Private Cottage", "Exclusive Stay", "Premium Bedding", "Air Conditioning", "Smart TV"],
  },
  PREMIUM_AC_ROOM: {
    type: "PREMIUM_AC_ROOM",
    label: "Deluxe AC Room",
    tagline: "Slate Dark · Electric Blue",
    description:
      "Modern air-conditioned rooms with premium furnishings, cool blue LED mood lighting and scenic valley views. Contemporary comfort for 2.",
    bgGradient: "linear-gradient(135deg, #040D1E 0%, #0A1E42 60%, #03080F 100%)",
    accentColor: "#60A5FA",
    accentBg: "#60A5FA15",
    ledColor: "#3B82F6",
    features: ["Blue LED Ambiance", "Premium Furnishings", "Valley Views", "Air Conditioning", "Smart TV", "Modern Design"],
  },
  CAVE_AC_ROOM: {
    type: "CAVE_AC_ROOM",
    label: "Cave Theme AC Room",
    tagline: "Stone Soul · Cave Vibes",
    description:
      "Unique cave-inspired interiors with full air conditioning — a truly one-of-a-kind themed stay you won't find anywhere else.",
    bgGradient: "linear-gradient(135deg, #1A1024 0%, #3D1E5C 60%, #0D0814 100%)",
    accentColor: "#A78BFA",
    accentBg: "#A78BFA15",
    ledColor: "#8B5CF6",
    features: ["Cave Theme Interiors", "Ambient Lighting", "Unique Experience", "Air Conditioning", "Smart TV", "Cozy Retreat"],
  },
  NON_AC_ROOM: {
    type: "NON_AC_ROOM",
    label: "Non-AC Room",
    tagline: "Natural Light · Green Glow",
    description:
      "Comfortable, naturally ventilated rooms with forest views, vibrant green LED accents and all the basic comforts — nature's own air conditioning through the trees.",
    bgGradient: "linear-gradient(135deg, #081A06 0%, #1A3D12 60%, #05100A 100%)",
    accentColor: "#4ADE80",
    accentBg: "#4ADE8015",
    ledColor: "#22C55E",
    features: ["Forest Views", "Green LED Glow", "Natural Breeze", "Geometric Walls", "Smart TV", "All Essentials"],
  },
};

export default async function HomePage() {
  const resort = await getResort();

  // Active hotel-wide marketing discount — shown as struck-through pricing.
  const universal = resort ? await getUniversalDiscount(resort.id) : null;
  const discounted = (base: number) => discountedNightlyPrice(universal, base);

  const avgRating =
    resort && resort.reviews.length > 0
      ? resort.reviews.reduce((s, r) => s + r.rating, 0) / resort.reviews.length
      : null;

  const heroImage = resort?.images?.[0] ?? null;
  const galleryImages = (resort?.images ?? []).slice(1);

  // Build showcase rooms from DB rooms (deduplicate by type)
  const seenTypes = new Set<string>();
  const showcaseRooms: ShowcaseRoom[] = [];
  for (const room of resort?.rooms ?? []) {
    if (!seenTypes.has(room.roomType)) {
      seenTypes.add(room.roomType);
      const cfg = ROOM_CONFIG[room.roomType];
      if (cfg) {
        showcaseRooms.push({
          ...cfg,
          price: discounted(room.basePrice),
          originalPrice: room.basePrice,
          capacity: room.capacity,
          imageSrc:
            getCategoryImages(room.roomType)[0] ??
            room.images?.[0] ??
            galleryImages[showcaseRooms.length] ??
            null,
          hotelSlug: "the-urban-escape-bhilai",
        });
      }
    }
  }

  // Fallback: if DB has no rooms yet, use static config
  if (showcaseRooms.length === 0) {
    const fallback = [
      { type: "LUXURY_COTTAGE", price: 3500, capacity: 4 },
      { type: "PINEWOOD_COTTAGE", price: 3000, capacity: 4 },
      { type: "THEATRE_COTTAGE", price: 4500, capacity: 4 },
      { type: "PREMIUM_AC_ROOM", price: 2000, capacity: 2 },
      { type: "CAVE_AC_ROOM", price: 2200, capacity: 2 },
      { type: "NON_AC_ROOM", price: 1200, capacity: 2 },
    ];
    fallback.forEach(({ type, price, capacity }) => {
      const cfg = ROOM_CONFIG[type];
      if (cfg)
        showcaseRooms.push({
          ...cfg,
          price: discounted(price),
          originalPrice: price,
          capacity,
          imageSrc: getCategoryImages(type)[0] ?? null,
          hotelSlug: "the-urban-escape-bhilai",
        });
    });
  }

  return (
    <>
      {/* Cinematic zoom-from-space intro — plays once per session */}
      <HeroZoomOverlay heroImage={heroImage} />

      <Navbar />

      {/* ════════════════════════════════════════════════════════
          1. HERO — parallax + animated text + floating thumbnails
      ════════════════════════════════════════════════════════ */}
      <HeroSection
        heroImage={heroImage}
        galleryImages={galleryImages}
        avgRating={avgRating}
        reviewCount={resort?.reviews.length ?? 0}
      />

      {/* ════════════════════════════════════════════════════════
          2. STATS STRIP
      ════════════════════════════════════════════════════════ */}
      <section className="bg-[#0D1B0E] border-b border-white/5">
        <Stagger className="max-w-5xl mx-auto px-5 py-7 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          {[
            { to: 6,     suffix: "+",  label: "Luxury Cottages"  },
            { to: 5,     suffix: "+",  label: "Room Categories"  },
            { to: 100,   suffix: "%",  label: "Nature Surrounds"  },
            { to: 4.9,   suffix: "★",  label: "Guest Rating"      },
          ].map((s) => (
            <StaggerItem key={s.label}>
              <p className="text-2xl font-bold text-amber-400">
                <CountUpStat to={s.to} suffix={s.suffix} />
              </p>
              <p className="text-xs text-white/35 mt-0.5 tracking-wide">{s.label}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* ════════════════════════════════════════════════════════
          3. ROOM SHOWCASE — full-screen interactive switcher
      ════════════════════════════════════════════════════════ */}
      <RoomShowcase rooms={showcaseRooms} />

      {/* ════════════════════════════════════════════════════════
          4. ABOUT — split with floating photo mosaic
      ════════════════════════════════════════════════════════ */}
      <section id="about" className="bg-[#071209] py-24 px-5 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent pointer-events-none" />
        <div className="absolute top-1/4 right-0 w-80 h-80 bg-amber-900/8 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

          {/* Photo mosaic */}
          <SlideIn from="left" className="relative">
            <div className="grid grid-cols-5 grid-rows-3 gap-2.5 h-[420px]">
              {/* Main large image */}
              <div className="col-span-3 row-span-3 rounded-3xl overflow-hidden relative bg-gradient-to-br from-amber-900 to-amber-700">
                {galleryImages[0] ? (
                  <Image src={galleryImages[0]} alt="Resort" fill className="object-cover" />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                    {/* Decorative pine ceiling graphic */}
                    <div className="w-full h-full relative overflow-hidden opacity-20">
                      {[...Array(8)].map((_, i) => (
                        <div key={i}
                          className="absolute h-0.5 bg-amber-300 rounded-full"
                          style={{
                            width: `${40 + i * 10}%`,
                            left: `${(100 - (40 + i * 10)) / 2}%`,
                            top: `${8 + i * 11}%`,
                            transform: `rotate(${i % 2 === 0 ? -2 : 2}deg)`,
                          }}
                        />
                      ))}
                    </div>
                    <div className="absolute bottom-6 left-6">
                      <p className="text-amber-200/50 text-xs">Luxury Cottage</p>
                    </div>
                  </div>
                )}
                {/* LED strip effect */}
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />
              </div>

              {/* Top right */}
              <div className="col-span-2 row-span-2 rounded-3xl overflow-hidden relative bg-gradient-to-br from-slate-900 to-slate-700">
                {galleryImages[1] ? (
                  <Image src={galleryImages[1]} alt="AC Room" fill className="object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    {/* Blue LED pattern */}
                    <div className="text-blue-400/20 text-7xl">💡</div>
                  </div>
                )}
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-blue-400/60 to-transparent" />
              </div>

              {/* Bottom right */}
              <div className="col-span-2 row-span-1 rounded-3xl overflow-hidden relative bg-gradient-to-br from-[#102010] to-[#1A3D12]">
                {galleryImages[2] ? (
                  <Image src={galleryImages[2]} alt="Non-AC Room" fill className="object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-green-600/20 text-4xl">🌿</div>
                  </div>
                )}
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-green-400/60 to-transparent" />
              </div>
            </div>

            {/* Floating card */}
            <div className="absolute -bottom-5 -right-3 glass-card glass-top-highlight rounded-2xl px-5 py-4">
              <p className="text-white/40 text-[10px] uppercase tracking-wider mb-0.5">Guest Rating</p>
              <p className="text-white font-bold text-2xl">4.9 <span className="text-xs font-normal text-white/40">out of 5</span></p>
            </div>
          </SlideIn>

          {/* Text */}
          <SlideIn from="right">
            <p className="text-amber-400 font-bold text-xs tracking-[0.2em] uppercase mb-3">Our Story</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white leading-tight mb-5">
              A Forest Retreat<br />in the Heart of Bhilai
            </h2>
            <p className="text-white/55 leading-relaxed mb-4 text-sm sm:text-base">
              The Urban Escape is where every room tells its own story. Pine-clad cottages with amber LED ceilings,
              cool dark rooms with electric blue moods, bright suites with bamboo roofs and green glows.
              Each space is designed to immerse you.
            </p>
            <p className="text-white/55 leading-relaxed mb-8 text-sm sm:text-base">
              Surrounded by lush greenery just outside Bhilai city, we're your escape that needs no long drive —
              just the will to unwind completely.
            </p>
            <Stagger className="flex flex-wrap gap-2.5">
              {["Forest View", "Ambient LED Lighting", "AC Rooms Available", "Premium Bedding", "Free Parking", "Power Backup"].map((f) => (
                <StaggerItem key={f}>
                  <span className="glass-badge text-xs font-semibold text-green-300 px-3 py-1.5 rounded-full block">
                    ✓ {f}
                  </span>
                </StaggerItem>
              ))}
            </Stagger>
          </SlideIn>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          5. EXPERIENCE — dark, 3 columns
      ════════════════════════════════════════════════════════ */}
      <section className="bg-[#0D1B0E] py-24 px-5 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-amber-900/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-900/8 rounded-full blur-3xl" />
        </div>

        <div className="max-w-5xl mx-auto relative z-10">
          <FadeUp className="text-center mb-14">
            <p className="text-amber-400 font-bold text-xs tracking-[0.25em] uppercase mb-3">Why Guests Love Us</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">The Urban Escape Difference</h2>
          </FadeUp>

          <Stagger className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {[
              { emoji: "🌿", title: "Nature First", desc: "Surrounded by trees, plants, and fresh air — each cottage has its own garden entrance and forest-facing windows." },
              { emoji: "✨", title: "Ambient Luxury", desc: "Every room has bespoke LED mood lighting — amber warmth, electric blue, vibrant green. Photography-ready every night." },
              { emoji: "🏠", title: "Three Distinct Worlds", desc: "Pine wood, slate-dark, or natural-white — three entirely different room personalities under one roof." },
            ].map((item) => (
              <StaggerItem key={item.title}>
                <div className="text-center group">
                  <div className="text-5xl mb-4 group-hover:scale-110 transition-transform duration-300">{item.emoji}</div>
                  <h3 className="font-bold text-white text-lg mb-2">{item.title}</h3>
                  <p className="text-white/40 text-sm leading-relaxed">{item.desc}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />
      </section>

      {/* ════════════════════════════════════════════════════════
          6. GALLERY (only if images exist)
      ════════════════════════════════════════════════════════ */}
      {galleryImages.length >= 2 && (
        <section id="gallery" className="bg-[#0D1B0E] py-20 px-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent pointer-events-none" />
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent pointer-events-none" />
          <div className="max-w-6xl mx-auto">
            <FadeUp className="text-center mb-10">
              <p className="text-amber-400 font-bold text-xs tracking-[0.2em] uppercase mb-3">Gallery</p>
              <h2 className="text-3xl font-bold text-white">See It For Yourself</h2>
            </FadeUp>
            <Stagger className={`grid gap-3 ${galleryImages.length >= 4 ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2"}`}>
              {galleryImages.slice(0, 6).map((img, i) => (
                <StaggerItem key={i}>
                  <div className={`relative overflow-hidden rounded-2xl ${i === 0 ? "md:col-span-2 h-64" : "h-48"}`}>
                    <Image src={img} alt={`Gallery ${i + 1}`} fill className="object-cover hover:scale-105 transition-transform duration-500" />
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>
      )}

      {/* ════════════════════════════════════════════════════════
          7. AMENITIES
      ════════════════════════════════════════════════════════ */}
      <section id="amenities" className="bg-[#071209] py-20 px-5 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-amber-900/6 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-5xl mx-auto relative z-10">
          <FadeUp className="text-center mb-12">
            <p className="text-amber-400 font-bold text-xs tracking-[0.2em] uppercase mb-3">Facilities</p>
            <h2 className="text-3xl font-bold text-white">Everything You Need</h2>
          </FadeUp>
          <Stagger className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { icon: <Wind className="w-6 h-6" />, label: "Air Conditioning" },
              { icon: <Wifi className="w-6 h-6" />, label: "Free Wi-Fi" },
              { icon: <Car className="w-6 h-6" />, label: "Free Parking" },
              { icon: <Shield className="w-6 h-6" />, label: "24/7 Security" },
              { icon: <Droplets className="w-6 h-6" />, label: "Hot Water" },
              { icon: <Tv2 className="w-6 h-6" />, label: "Smart TV" },
              { icon: <Zap className="w-6 h-6" />, label: "Power Backup" },
              { icon: <Flame className="w-6 h-6" />, label: "Room Service" },
            ].map((item) => (
              <StaggerItem key={item.label}>
                <div className="glass-card glass-card-hover glass-shimmer glass-top-highlight flex flex-col items-center gap-3 p-5 rounded-2xl text-center group">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/15 flex items-center justify-center group-hover:bg-amber-500/15 transition-colors">
                    <span className="text-amber-400 group-hover:scale-110 transition-transform duration-200">{item.icon}</span>
                  </div>
                  <span className="text-xs font-semibold text-white/65">{item.label}</span>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          8. REVIEWS — infinite marquee
      ════════════════════════════════════════════════════════ */}
      {resort && resort.reviews.length > 0 && (
        <ReviewMarquee reviews={resort.reviews} avgRating={avgRating} />
      )}

      {/* ════════════════════════════════════════════════════════
          9. CTA BANNER
      ════════════════════════════════════════════════════════ */}
      <section className="relative py-28 px-5 bg-[#071209] overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-r from-amber-950/25 via-transparent to-emerald-950/20" />
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />
          <div className="absolute -left-40 top-1/2 -translate-y-1/2 w-80 h-80 bg-amber-900/12 rounded-full blur-3xl" />
          <div className="absolute -right-40 top-1/2 -translate-y-1/2 w-80 h-80 bg-green-900/10 rounded-full blur-3xl" />
        </div>
        <FadeUp className="relative z-10 text-center max-w-xl mx-auto">
          <p className="text-amber-400 font-bold text-xs tracking-[0.25em] uppercase mb-4">Book Direct</p>
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4 leading-tight">
            Ready for Your<br />Escape?
          </h2>
          <p className="text-white/45 mb-9 leading-relaxed">
            Book directly for the best rates, instant WhatsApp confirmation,
            and online check-in — no queues at arrival.
          </p>
          <Link href="/hotel/the-urban-escape-bhilai"
            className="shimmer-btn inline-flex items-center gap-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold px-10 py-4 rounded-2xl transition-all hover:scale-105 shadow-2xl shadow-amber-500/25 text-base"
          >
            Check Availability <ArrowRight className="w-5 h-5" />
          </Link>
          <p className="text-white/20 text-xs mt-6">
            ✅ Instant WhatsApp confirmation &nbsp;·&nbsp; 📱 Online check-in &nbsp;·&nbsp; 💰 Best rate guarantee
          </p>
        </FadeUp>
      </section>

      {/* ════════════════════════════════════════════════════════
          10. CONTACT
      ════════════════════════════════════════════════════════ */}
      <section id="contact" className="bg-[#0D1B0E] py-16 px-5 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent pointer-events-none" />
        <div className="absolute left-1/4 top-0 w-64 h-64 bg-amber-900/8 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute right-1/4 bottom-0 w-64 h-64 bg-blue-900/6 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-4xl mx-auto relative z-10">
          <FadeUp className="text-center mb-10">
            <p className="text-amber-400 font-bold text-xs tracking-[0.2em] uppercase mb-3">Find Us</p>
            <h2 className="text-3xl font-bold text-white">Contact & Location</h2>
          </FadeUp>
          <Stagger className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
            {[
              {
                icon: <MapPin className="w-6 h-6 text-amber-400" />,
                title: "Location",
                content: (
                  <a
                    href="https://maps.app.goo.gl/tm4cHuKkTpe39ymd6"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-amber-300 font-semibold hover:text-amber-200 leading-relaxed mt-1 block transition-colors"
                  >
                    Kohka, Bhilai<br />Chhattisgarh
                  </a>
                ),
              },
              {
                icon: <Phone className="w-6 h-6 text-amber-400" />,
                title: "Call / WhatsApp",
                content: (
                  <>
                    <a href="tel:+917000630016" className="text-sm text-amber-300 font-semibold hover:text-amber-200 block mt-1 transition-colors">+91 70006 30016</a>
                  </>
                ),
              },
              {
                icon: <Mail className="w-6 h-6 text-amber-400" />,
                title: "Email",
                content: (
                  <a href="mailto:saubhagyamangalam@gmail.com"
                    className="text-sm text-amber-300 font-semibold hover:text-amber-200 break-all block mt-1 transition-colors">
                    saubhagyamangalam@gmail.com
                  </a>
                ),
              },
            ].map((card) => (
              <StaggerItem key={card.title} className="h-full">
                <div className="h-full glass-card glass-card-hover glass-amber glass-shimmer glass-top-highlight rounded-2xl p-6 text-center flex flex-col items-center justify-center">
                  <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-center mx-auto mb-4">
                    {card.icon}
                  </div>
                  <p className="font-semibold text-white">{card.title}</p>
                  {card.content}
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          FOOTER
      ════════════════════════════════════════════════════════ */}
      <footer className="bg-[#0D1B0E] text-white/35 py-10 px-5 border-t border-white/5">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-col items-center md:items-start">
            <Image src="/logo.png" alt="The Urban Escape" width={120} height={120} className="h-12 w-auto rounded-lg" />
            <p className="text-xs mt-2 text-white/25">By Saubhagya Mangalam · Bhilai, Chhattisgarh</p>
          </div>
          <div className="flex flex-wrap gap-5 text-xs justify-center">
            {[
              { label: "Rooms", href: "#rooms" },
              { label: "Amenities", href: "#amenities" },
              { label: "Contact", href: "/contact" },
              { label: "My Bookings", href: "/my-bookings" },
              { label: "Login", href: "/auth/login" },
              { label: "Register", href: "/auth/register" },
            ].map((l) => (
              <Link key={l.label} href={l.href} className="hover:text-white/70 transition-colors">{l.label}</Link>
            ))}
          </div>
        </div>
        {/* Legal links — required for payment-gateway compliance */}
        <div className="max-w-5xl mx-auto mt-6 flex flex-wrap gap-x-5 gap-y-2 justify-center text-xs">
          {[
            { label: "Terms & Conditions", href: "/terms" },
            { label: "Privacy Policy", href: "/privacy" },
            { label: "Cancellation & Refund Policy", href: "/refund-policy" },
            { label: "Contact Us", href: "/contact" },
          ].map((l) => (
            <Link key={l.label} href={l.href} className="text-white/30 hover:text-white/70 transition-colors">{l.label}</Link>
          ))}
        </div>
        <div className="max-w-5xl mx-auto mt-8 pt-6 border-t border-white/5 text-center text-xs text-white/15">
          © {new Date().getFullYear()} The Urban Escape, By Saubhagya Mangalam. All rights reserved.
        </div>
      </footer>
    </>
  );
}
