"use client";

/**
 * Infinite horizontal scrolling review marquee.
 * Two rows: top row scrolls left, bottom row scrolls right.
 * Pauses on hover. Uses pure CSS animation (GPU-composited, no layout thrash).
 */

import { motion } from "framer-motion";
import { Star } from "lucide-react";

interface Review {
  id: string;
  rating: number;
  title?: string | null;
  comment?: string | null;
  guest: { name: string };
}

function ReviewCard({ review }: { review: Review }) {
  return (
    <div className="flex-shrink-0 w-72 bg-white/5 border border-white/8 rounded-2xl p-5 mx-2.5
                    hover:bg-white/9 hover:border-white/14 transition-colors">
      {/* Stars + name */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map(i => (
            <Star
              key={i}
              className={`w-3.5 h-3.5 ${i <= review.rating ? "fill-amber-400 text-amber-400" : "fill-white/8 text-white/10"}`}
            />
          ))}
        </div>
        <div className="w-8 h-8 rounded-full bg-amber-800/40 flex items-center justify-center text-amber-300 font-bold text-sm shrink-0">
          {review.guest.name?.[0]?.toUpperCase() ?? "G"}
        </div>
      </div>
      {review.title && (
        <p className="text-white/75 text-sm font-semibold mb-1 leading-snug">{review.title}</p>
      )}
      {review.comment && (
        <p className="text-white/38 text-xs leading-relaxed line-clamp-3">{review.comment}</p>
      )}
      <p className="text-white/25 text-[11px] mt-3 font-medium">{review.guest.name}</p>
    </div>
  );
}

function MarqueeRow({
  reviews,
  reverse = false,
  duration = "30s",
}: {
  reviews: Review[];
  reverse?: boolean;
  duration?: string;
}) {
  // Duplicate for seamless infinite loop
  const doubled = [...reviews, ...reviews];
  return (
    <div
      className={`flex ${reverse ? "animate-marquee-reverse" : "animate-marquee"}`}
      style={{ "--marquee-duration": duration } as React.CSSProperties}
    >
      {doubled.map((r, i) => (
        <ReviewCard key={`${r.id}-${i}`} review={r} />
      ))}
    </div>
  );
}

export default function ReviewMarquee({
  reviews,
  avgRating,
}: {
  reviews: Review[];
  avgRating: number | null;
}) {
  if (reviews.length === 0) return null;

  // Split into two roughly equal rows
  const mid = Math.ceil(reviews.length / 2);
  const row1 = reviews.slice(0, mid).length >= 2 ? reviews.slice(0, mid) : reviews;
  const row2 = reviews.slice(mid).length >= 2 ? reviews.slice(mid) : reviews;

  return (
    <section className="bg-[#0D1B0E] py-20 overflow-hidden">
      <div className="max-w-6xl mx-auto px-5 mb-12">
        <motion.div
          initial={{ opacity: 0, y: 36 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.75, ease: [0.21, 0.47, 0.32, 0.98] }}
          className="text-center"
        >
          <p className="text-amber-400 font-bold text-xs tracking-[0.25em] uppercase mb-3">
            Guest Reviews
          </p>
          <h2 className="text-3xl font-bold text-white mb-3">
            What Our Guests Say
          </h2>
          {avgRating && (
            <div className="flex items-center justify-center gap-3 mt-4">
              <div className="flex">
                {[1, 2, 3, 4, 5].map(i => (
                  <Star
                    key={i}
                    className={`w-5 h-5 ${i <= Math.round(avgRating) ? "fill-amber-400 text-amber-400" : "fill-white/10 text-white/15"}`}
                  />
                ))}
              </div>
              <span className="text-white/40 text-sm">
                <span className="text-white/80 font-bold text-lg">{avgRating.toFixed(1)}</span>
                {" "}/ 5 &nbsp;·&nbsp; {reviews.length} reviews
              </span>
            </div>
          )}
        </motion.div>
      </div>

      {/* Marquee rows — pause on hover */}
      <div className="marquee-pause space-y-3">
        <MarqueeRow reviews={row1} duration="35s" />
        <MarqueeRow reviews={row2} reverse duration="28s" />
      </div>

      {/* Fade edges */}
      <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-20
                      bg-gradient-to-r from-[#0D1B0E] to-transparent" />
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-20
                      bg-gradient-to-l from-[#0D1B0E] to-transparent" />
    </section>
  );
}
