"use client";

/**
 * Defers the review marquee: its JS chunk is only fetched once the visitor
 * scrolls within 600px of the section, keeping it out of the initial load.
 */

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { Review } from "./ReviewMarquee";

const ReviewMarquee = dynamic(() => import("./ReviewMarquee"), { ssr: false });

export default function ReviewMarqueeLazy(props: {
  reviews: Review[];
  avgRating: number | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setShow(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin: "600px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // min-height reserves space so late-mounting doesn't shift layout.
  return <div ref={ref} className={show ? "" : "min-h-[300px]"}>{show && <ReviewMarquee {...props} />}</div>;
}
