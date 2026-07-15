"use client";

/**
 * Scroll-reveal primitives — CSS transitions driven by one IntersectionObserver
 * per element. No animation library: cheaper main-thread work and smaller JS
 * than the previous framer-motion implementation, with identical APIs.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const EASE = "cubic-bezier(0.21, 0.47, 0.32, 0.98)";

/** Once-only in-view flag. Falls back to visible when IO is unavailable. */
function useReveal<T extends HTMLElement>(margin = "-80px") {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: margin }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [margin]);

  return [ref, inView] as const;
}

function reveal(
  inView: boolean,
  hiddenTransform: string,
  duration: number,
  delay: number
): React.CSSProperties {
  return {
    opacity: inView ? 1 : 0,
    transform: inView ? "none" : hiddenTransform,
    transition: `opacity ${duration}s ${EASE} ${delay}s, transform ${duration}s ${EASE} ${delay}s`,
  };
}

export function FadeUp({
  children, delay = 0, className = "",
}: { children: React.ReactNode; delay?: number; className?: string }) {
  const [ref, inView] = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={className} style={reveal(inView, "translateY(48px)", 0.75, delay)}>
      {children}
    </div>
  );
}

export function FadeIn({
  children, delay = 0, className = "",
}: { children: React.ReactNode; delay?: number; className?: string }) {
  const [ref, inView] = useReveal<HTMLDivElement>("-60px");
  return (
    <div ref={ref} className={className} style={reveal(inView, "none", 0.9, delay)}>
      {children}
    </div>
  );
}

export function SlideIn({
  children, from = "left", delay = 0, className = "",
}: { children: React.ReactNode; from?: "left" | "right"; delay?: number; className?: string }) {
  const [ref, inView] = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={className}
      style={reveal(inView, `translateX(${from === "left" ? -64 : 64}px)`, 0.8, delay)}>
      {children}
    </div>
  );
}

export function ScaleIn({
  children, delay = 0, className = "",
}: { children: React.ReactNode; delay?: number; className?: string }) {
  const [ref, inView] = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={className} style={reveal(inView, "scale(0.88)", 0.65, delay)}>
      {children}
    </div>
  );
}

// ── Stagger: parent observes once, children reveal in DOM order ────────────

const StaggerCtx = createContext<{
  inView: boolean;
  counter: React.MutableRefObject<number>;
} | null>(null);

export function Stagger({
  children, className = "",
}: { children: React.ReactNode; className?: string }) {
  const [ref, inView] = useReveal<HTMLDivElement>();
  const counter = useRef(0);
  const ctx = useMemo(() => ({ inView, counter }), [inView]);
  return (
    <StaggerCtx.Provider value={ctx}>
      <div ref={ref} className={className}>{children}</div>
    </StaggerCtx.Provider>
  );
}

export function StaggerItem({
  children, className = "",
}: { children: React.ReactNode; className?: string }) {
  const ctx = useContext(StaggerCtx);
  const idxRef = useRef<number | null>(null);
  if (idxRef.current === null) idxRef.current = ctx ? ctx.counter.current++ : 0;
  const inView = ctx ? ctx.inView : true;
  return (
    <div className={className}
      style={reveal(inView, "translateY(32px)", 0.65, idxRef.current * 0.13)}>
      {children}
    </div>
  );
}

/**
 * Animates a number counting up from 0 to `to` when scrolled into view.
 * For non-numeric values (e.g. "24/7") it fades in with a character stagger.
 */
export function CountUpStat({
  to,
  suffix = "",
  className = "",
}: {
  to: number | string;
  suffix?: string;
  className?: string;
}) {
  const [ref, inView] = useReveal<HTMLSpanElement>("-60px");
  const isNumeric = typeof to === "number";
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!inView || !isNumeric) return;
    const target = to as number;
    const decimals = Number.isInteger(target) ? 0 : 1;
    const duration = 1600;
    let startTime: number;
    let raf: number;
    function tick(timestamp: number) {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setCount(Number((eased * target).toFixed(decimals)));
      if (progress < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, isNumeric, to]);

  if (!isNumeric) {
    // Character-by-character entrance for strings like "24/7"
    return (
      <span ref={ref} className={className}>
        {String(to).split("").map((ch, i) => (
          <span key={i} style={{
            display: "inline-block",
            opacity: inView ? 1 : 0,
            transform: inView ? "none" : "translateY(8px)",
            transition: `opacity 0.4s ${EASE} ${i * 0.08}s, transform 0.4s ${EASE} ${i * 0.08}s`,
          }}>
            {ch}
          </span>
        ))}
        {suffix}
      </span>
    );
  }

  return (
    <span ref={ref} className={className}
      style={{ opacity: inView ? 1 : 0, transition: "opacity 0.3s" }}>
      {count}{suffix}
    </span>
  );
}
