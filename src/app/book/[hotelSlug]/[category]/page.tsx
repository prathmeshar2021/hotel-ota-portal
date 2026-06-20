export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Image from "next/image";
import Navbar from "@/components/customer/Navbar";
import BookingForm from "@/components/customer/BookingForm";
import { prisma } from "@/lib/db/prisma";
import { computeTotals, getUniversalDiscount } from "@/lib/utils/booking";
import { REFUNDABLE_DEPOSIT, universalDiscountAmount, discountedNightlyPrice } from "@/lib/utils/booking-calc";
import { getCategoryImages, getCategoryMeta, slugToCategory } from "@/lib/utils/room-categories";
import { resolveCategoryPrice } from "@/lib/utils/pricing";
import { Calendar, Users, Moon, ShieldCheck } from "lucide-react";
import { auth } from "@/lib/auth/auth";

interface Props {
  params: Promise<{ hotelSlug: string; category: string }>;
  searchParams: Promise<{ checkIn?: string; checkOut?: string; guests?: string }>;
}

export default async function BookingPage({ params, searchParams }: Props) {
  const { hotelSlug, category: categorySlug } = await params;
  const sp = await searchParams;

  // Resolve category from slug (e.g. "luxury-cottage" → "LUXURY_COTTAGE")
  const categoryType = slugToCategory(categorySlug);
  const meta = getCategoryMeta(categoryType);
  if (!meta || meta.totalRooms === 0) notFound();

  const hotel = await prisma.hotel.findUnique({
    where: { slug: hotelSlug, isActive: true },
    select: {
      id: true, name: true, city: true, state: true,
      checkInTime: true, checkOutTime: true, images: true,
      allowPayAtHotel: true, allowPartialPay: true,
    },
  });
  if (!hotel) notFound();

  const checkIn  = sp.checkIn ?? "";
  const checkOut = sp.checkOut ?? "";
  const nights   = checkIn && checkOut
    ? Math.max(1, Math.ceil((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000))
    : 1;

  // Resolve the nightly price for the requested check-in date — honours any
  // date-wise override set by the super admin, else falls back to base price.
  const checkInDate = checkIn ? new Date(checkIn) : undefined;
  const pricePerNight = await resolveCategoryPrice(
    hotel.id,
    categoryType as never,
    checkInDate
  );

  // Fetch fresh contact info for logged-in customers — the JWT token can be stale
  // (e.g. user added a phone number after logging in).
  const session = await auth();
  let guestPhone: string | undefined;
  let guestEmail: string | undefined;
  if (session?.user?.role === "CUSTOMER") {
    const guest = await prisma.guest.findUnique({
      where: { id: session.user.id },
      select: { phone: true, email: true },
    });
    guestPhone = guest?.phone ?? undefined;
    guestEmail = guest?.email ?? undefined;
  }

  // Active hotel-wide marketing discount (auto-applied to every guest).
  const universal = await getUniversalDiscount(hotel.id);
  const rentDiscount = universalDiscountAmount(universal, pricePerNight * nights);
  const discountedNightly = discountedNightlyPrice(universal, pricePerNight);

  const totals = computeTotals({ roomRentPerNight: pricePerNight, noOfNights: nights, couponDiscount: rentDiscount });
  // Prefer the category-specific gallery; fall back to the hotel cover image.
  const categoryImages = getCategoryImages(categoryType);
  const heroImage = categoryImages[0] ?? hotel.images[0] ?? null;
  const summaryImage = categoryImages[1] ?? categoryImages[0] ?? hotel.images[0] ?? null;

  return (
    <div className="min-h-screen bg-[#071209]">
      <Navbar />

      {/* Category hero strip */}
      <div className="relative h-52 md:h-64 overflow-hidden mt-16">
        {heroImage ? (
          <Image src={heroImage} alt={meta.displayName} fill className="object-cover opacity-40" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-r from-[#0D1B0E] to-[#071209]" />
        )}
        <div className={`absolute inset-0 bg-gradient-to-b ${meta.accentGradient} via-transparent to-[#071209]`} />
        <div className="absolute inset-0 bg-gradient-to-t from-[#071209] via-transparent to-transparent" />
        <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent ${meta.ledColor} to-transparent`} />

        <div className="relative z-10 h-full flex flex-col justify-end px-5 pb-6 max-w-6xl mx-auto">
          <p className="text-white/40 text-xs uppercase tracking-widest mb-1">Completing Booking</p>
          <h1 className="text-2xl md:text-3xl font-bold text-white">{meta.displayName}</h1>
          <p className="text-white/40 text-sm mt-0.5">{hotel.name}</p>
        </div>
      </div>

      {/* Main grid */}
      <div className="max-w-6xl mx-auto px-4 pb-16 -mt-2">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Booking Form */}
          <div className="lg:col-span-3">
            <BookingForm
              hotel={hotel}
              room={{
                id: categoryType,            // used as roomCategory in form submission
                roomTypeLabel: meta.displayName,
                basePrice: pricePerNight,
                capacity: meta.maxGuests,
                isCategory: true,            // tells form to send roomCategory, not roomId
              }}
              checkIn={checkIn}
              checkOut={checkOut}
              nights={nights}
              guests={parseInt(sp.guests ?? "2")}
              totals={totals}
              universal={universal}
              hotelSlug={hotelSlug}
              categorySlug={categorySlug}
              categoryImage={heroImage}
              accentColor={meta.accentColor}
              allowPayAtHotel={hotel.allowPayAtHotel}
              allowPartialPay={hotel.allowPartialPay}
              defaultPhone={guestPhone}
              defaultEmail={guestEmail}
            />
          </div>

          {/* Booking Summary sidebar */}
          <div className="lg:col-span-2">
            <div className="sticky top-24 rounded-3xl overflow-hidden border border-white/8 bg-white/3 backdrop-blur-sm shadow-2xl">
              {/* Image */}
              <div className="relative h-44 overflow-hidden">
                {summaryImage ? (
                  <Image src={summaryImage} alt={meta.displayName} fill className="object-cover" />
                ) : (
                  <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, #0d1a0e, #1a3020)` }} />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                <div className={`absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent ${meta.ledColor} to-transparent`} />
                <div className="absolute bottom-4 left-4">
                  <p className="text-white/40 text-xs uppercase tracking-wider">Category</p>
                  <p className="text-white font-bold">{meta.displayName}</p>
                </div>
              </div>

              {/* Details */}
              <div className="p-5 space-y-4">
                <div>
                  <p className="text-white/35 text-xs uppercase tracking-wider mb-1">{hotel.name}</p>
                  <p className="text-white/50 text-xs">{hotel.city}, {hotel.state}</p>
                </div>

                <div className="grid grid-cols-1 gap-3 text-sm">
                  {checkIn && checkOut && (
                    <div className="flex items-center gap-3 bg-white/4 rounded-xl p-3">
                      <Calendar className="w-4 h-4 shrink-0" style={{ color: meta.accentColor }} />
                      <div>
                        <p className="text-white/35 text-xs">Dates</p>
                        <p className="text-white/80 font-medium text-xs">{checkIn} → {checkOut}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3 bg-white/4 rounded-xl p-3">
                    <Moon className="w-4 h-4 shrink-0" style={{ color: meta.accentColor }} />
                    <div>
                      <p className="text-white/35 text-xs">Duration</p>
                      <p className="text-white/80 font-medium text-xs">{nights} night{nights !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 bg-white/4 rounded-xl p-3">
                    <Users className="w-4 h-4 shrink-0" style={{ color: meta.accentColor }} />
                    <div>
                      <p className="text-white/35 text-xs">Capacity</p>
                      <p className="text-white/80 font-medium text-xs">Up to {meta.maxGuests} guests</p>
                    </div>
                  </div>
                </div>

                {/* Price breakdown */}
                <div className="border-t border-white/8 pt-4 space-y-2 text-sm">
                  <div className="flex justify-between text-white/50">
                    <span className="flex items-center gap-1.5">
                      Room ({nights}N ×{" "}
                      {rentDiscount > 0 ? (
                        <>
                          <span className="line-through text-white/30">₹{pricePerNight.toLocaleString("en-IN")}</span>
                          <span className="text-white/70">₹{discountedNightly.toLocaleString("en-IN")}</span>
                        </>
                      ) : (
                        <>₹{pricePerNight.toLocaleString("en-IN")}</>
                      )}
                      )
                    </span>
                    <span>₹{totals.roomRent.toLocaleString("en-IN")}</span>
                  </div>
                  {rentDiscount > 0 && (
                    <div className="flex justify-between text-violet-300 text-xs">
                      <span>{universal?.label || "Marketing discount"}</span>
                      <span>-₹{rentDiscount.toLocaleString("en-IN")}</span>
                    </div>
                  )}
                  {totals.cgst > 0 && (
                    <>
                      <div className="flex justify-between text-white/30 text-xs">
                        <span>CGST ({totals.cgstRate}%)</span>
                        <span>₹{totals.cgst.toLocaleString("en-IN")}</span>
                      </div>
                      <div className="flex justify-between text-white/30 text-xs">
                        <span>SGST ({totals.sgstRate}%)</span>
                        <span>₹{totals.sgst.toLocaleString("en-IN")}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between text-green-400 text-xs">
                    <span className="flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> Refundable deposit
                    </span>
                    <span>₹{REFUNDABLE_DEPOSIT}</span>
                  </div>
                  <div className="flex justify-between font-bold text-white text-base pt-2 border-t border-white/8">
                    <span>Total</span>
                    <span style={{ color: meta.accentColor }}>₹{totals.totalAmount.toLocaleString("en-IN")}</span>
                  </div>
                </div>

                <div className="bg-white/3 border border-white/8 rounded-xl p-3 text-xs text-white/35 space-y-1.5">
                  <p>✅ Instant WhatsApp confirmation</p>
                  <p>📱 Online check-in link after booking</p>
                  <p>🔒 Secured by Razorpay</p>
                  <p>🏨 Specific room assigned by our team</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
