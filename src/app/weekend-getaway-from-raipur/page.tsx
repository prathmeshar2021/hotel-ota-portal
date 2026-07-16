// SEO landing page targeting the "weekend getaway from Raipur / resort near
// Raipur" search cluster. Static content — revalidate hourly is plenty.
export const revalidate = 3600;

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight, Car, CalendarDays, Flame, Clock, MapPin, ShieldCheck, TreePine, Tv2, Users,
} from "lucide-react";
import Navbar from "@/components/customer/Navbar";
import PackagesSection from "@/components/customer/PackagesSection";
import { FadeUp, Stagger, StaggerItem } from "@/components/customer/AnimatedSection";
import { BUSINESS, SITE_URL } from "@/lib/constants/business";
import { waLink } from "@/lib/constants/packages";

const PAGE_PATH = "/weekend-getaway-from-raipur";
const BOOK_URL = "/hotel/the-urban-escape-bhilai";

const TITLE = "Weekend Getaway from Raipur — 45 min Drive | The Urban Escape";
const DESCRIPTION =
  "Skip the 4-hour highway trip. The Urban Escape is a forest-side cottage resort just 35 km from Raipur (about 45 minutes via NH-53) at Kohka, Bhilai — private AC cottages, a theatre-style cottage, bonfire evenings and direct booking from ₹1,200/night.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: PAGE_PATH,
    images: [{ url: "/rooms/luxury/1.jpg", width: 1200, height: 630 }],
  },
};

// Page-specific FAQs — visible content below matches this list 1:1 (Google
// requires FAQPage markup to mirror on-page content).
const RAIPUR_FAQS = [
  {
    q: "How far is The Urban Escape from Raipur?",
    a: "About 35 km — roughly 45 minutes by car via NH-53 towards Bhilai. Take the Kohka turn near Surya Treasure Island Mall; the resort is minutes from the main road.",
  },
  {
    q: "Is one night enough for a weekend trip from Raipur?",
    a: "Yes. Check-in is 12:00 PM and check-out is 10:00 AM, so a single night covers a full afternoon, evening bonfire and a relaxed morning — and you're home in under an hour.",
  },
  {
    q: "Is the resort couple friendly?",
    a: "Yes, couples are welcome. A government-issued photo ID (Aadhaar, PAN, Passport or Driving License) is required for every guest at check-in.",
  },
  {
    q: "What does a stay cost?",
    a: "Non-AC rooms start around ₹1,200 per night, AC rooms from ₹2,000, and private cottages from ₹3,000 — the exclusive theatre-style cottage is ₹4,500. Booking direct on this website always gets the best rate.",
  },
  {
    q: "Can we cancel if our plan changes?",
    a: "Yes — free cancellation up to 24 hours before check-in, with refunds processed in 5–7 business days.",
  },
] as const;

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Weekend Getaway from Raipur", item: `${SITE_URL}${PAGE_PATH}` },
      ],
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE_URL}${PAGE_PATH}#faq`,
      mainEntity: RAIPUR_FAQS.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ],
};

export default function RaipurLandingPage() {
  return (
    <div className="min-h-screen bg-[#071209]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Navbar />

      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="relative pt-32 pb-16 px-5 overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src="/rooms/luxury/1.jpg"
            alt="Cottage at The Urban Escape near Raipur"
            fill
            sizes="100vw"
            quality={60}
            priority
            className="object-cover opacity-25"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#071209]/70 via-[#071209]/40 to-[#071209]" />
        </div>

        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <FadeUp>
            <p className="inline-flex items-center gap-2 bg-amber-500/12 border border-amber-400/25 text-amber-300 text-xs font-bold px-4 py-2 rounded-full mb-6 tracking-[0.12em] uppercase">
              <Car className="w-3.5 h-3.5" /> 35 km from Raipur · via NH-53
            </p>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white leading-tight mb-5">
              A Weekend Getaway,<br />
              <span className="text-amber-400">45 Minutes from Raipur</span>
            </h1>
            <p className="text-white/55 text-base sm:text-lg leading-relaxed max-w-xl mx-auto mb-8">
              Skip the 4-hour highway trip. Leave Raipur after breakfast and be at a
              forest-side cottage before lunch — private sit-outs, LED-lit pine interiors,
              bonfire evenings, and home by Sunday lunch.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                href={BOOK_URL}
                className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold px-7 py-3.5 rounded-2xl transition-all hover:scale-105 shadow-2xl shadow-amber-500/25"
              >
                Check Availability <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href={waLink("Hi! I'm planning a weekend trip from Raipur. Please share availability and details.")}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-[#25D366]/15 hover:bg-[#25D366]/25 border border-[#25D366]/30 text-[#4ade80] font-bold px-7 py-3.5 rounded-2xl transition-colors"
              >
                Ask on WhatsApp
              </a>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ── Drive facts strip ────────────────────────────── */}
      <section className="bg-[#0D1B0E] border-y border-white/5 py-6 px-5">
        <Stagger className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          {[
            { icon: <Car className="w-5 h-5" />, big: "45 min", small: "drive from Raipur" },
            { icon: <MapPin className="w-5 h-5" />, big: "Kohka, Bhilai", small: "near Surya Mall" },
            { icon: <Clock className="w-5 h-5" />, big: "12 PM – 10 AM", small: "check-in · check-out" },
            { icon: <ShieldCheck className="w-5 h-5" />, big: "Free cancellation", small: "up to 24 hrs before" },
          ].map((s) => (
            <StaggerItem key={s.small}>
              <div className="flex items-center justify-center text-amber-400 mb-1.5">{s.icon}</div>
              <p className="text-white font-bold text-sm">{s.big}</p>
              <p className="text-white/35 text-xs mt-0.5">{s.small}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* ── Why here instead of a big hotel ──────────────── */}
      <section className="bg-[#071209] py-20 px-5">
        <div className="max-w-5xl mx-auto">
          <FadeUp className="text-center mb-12">
            <p className="text-amber-400 font-bold text-xs tracking-[0.2em] uppercase mb-3">Why The Urban Escape</p>
            <h2 className="text-3xl font-bold text-white">A Cottage, Not a Hotel Room</h2>
          </FadeUp>
          <Stagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                icon: <TreePine className="w-6 h-6" />,
                title: "Forest-side privacy",
                text: "15 rooms and cottages spread through greenery — not a 100-room tower with a queue at the buffet.",
              },
              {
                icon: <Tv2 className="w-6 h-6" />,
                title: "The theatre cottage",
                text: "Your own big screen inside the cottage — movies in bed. Nothing else like it within 100 km.",
              },
              {
                icon: <Flame className="w-6 h-6" />,
                title: "Bonfire evenings",
                text: "Evenings around the fire under the trees, with music and BBQ arranged on request.",
              },
              {
                icon: <Users className="w-6 h-6" />,
                title: "Groups welcome",
                text: "Book cottages side by side and the lawn is effectively yours for the evening.",
              },
            ].map((c) => (
              <StaggerItem key={c.title} className="h-full">
                <div className="h-full glass-card rounded-2xl p-6 border border-white/8">
                  <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-center text-amber-400 mb-4">
                    {c.icon}
                  </div>
                  <h3 className="font-bold text-white text-sm mb-2">{c.title}</h3>
                  <p className="text-xs text-white/45 leading-relaxed">{c.text}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ── Sample 24 hours ──────────────────────────────── */}
      <section className="bg-[#0D1B0E] py-20 px-5 border-y border-white/5">
        <div className="max-w-3xl mx-auto">
          <FadeUp className="text-center mb-12">
            <p className="text-amber-400 font-bold text-xs tracking-[0.2em] uppercase mb-3">How a Weekend Looks</p>
            <h2 className="text-3xl font-bold text-white">Your 24 Hours Here</h2>
          </FadeUp>
          <div className="space-y-0">
            {[
              { time: "11:00 AM", day: "Saturday", what: "Leave Raipur after breakfast — NH-53 towards Bhilai, Kohka turn near Surya Mall." },
              { time: "12:00 PM", day: "Saturday", what: "Check in, drop the bags, tea on your private sit-out." },
              { time: "5:00 PM", day: "Saturday", what: "Garden walk, photos in the golden hour, room service snacks." },
              { time: "8:00 PM", day: "Saturday", what: "Bonfire under the trees — or your own movie night in the theatre cottage." },
              { time: "8:00 AM", day: "Sunday", what: "Slow morning with forest views and breakfast." },
              { time: "10:00 AM", day: "Sunday", what: "Check out — home in Raipur before lunch." },
            ].map((step, i, arr) => (
              <FadeUp key={step.time + step.what} className="relative pl-10 pb-8">
                {i < arr.length - 1 && (
                  <span className="absolute left-[11px] top-6 bottom-0 w-px bg-white/10" aria-hidden />
                )}
                <span className="absolute left-0 top-1 w-6 h-6 rounded-full bg-amber-500/15 border border-amber-400/30 flex items-center justify-center" aria-hidden>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                </span>
                <p className="text-amber-300 text-xs font-bold tracking-wide">
                  {step.time} <span className="text-white/25 font-medium">· {step.day}</span>
                </p>
                <p className="text-white/60 text-sm mt-1 leading-relaxed">{step.what}</p>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ── Packages (shared with homepage) ──────────────── */}
      <PackagesSection
        heading="Pick Your Kind of Weekend"
        subheading="Couples, groups, celebrations — tell us the occasion on WhatsApp and it's ready when you arrive."
      />

      {/* ── FAQ (visible copy of the FAQPage markup) ─────── */}
      <section className="bg-[#071209] py-20 px-5">
        <div className="max-w-3xl mx-auto">
          <FadeUp className="text-center mb-10">
            <p className="text-amber-400 font-bold text-xs tracking-[0.2em] uppercase mb-3">Before You Drive Down</p>
            <h2 className="text-3xl font-bold text-white">Quick Answers</h2>
          </FadeUp>
          <div className="space-y-3">
            {RAIPUR_FAQS.map((f) => (
              <FadeUp key={f.q}>
                <details className="group bg-white/[0.04] border border-white/8 rounded-2xl overflow-hidden transition-colors hover:border-white/15 open:border-amber-400/25">
                  <summary className="flex items-center justify-between gap-4 cursor-pointer list-none px-5 py-4 text-white/85 font-semibold text-sm select-none [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span className="shrink-0 text-amber-400/70 transition-transform duration-200 group-open:rotate-45 text-lg leading-none">+</span>
                  </summary>
                  <p className="px-5 pb-5 text-sm text-white/45 leading-relaxed">{f.a}</p>
                </details>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────── */}
      <section className="relative py-24 px-5 bg-[#0D1B0E] overflow-hidden border-t border-white/5">
        <div className="absolute -left-40 top-1/2 -translate-y-1/2 w-80 h-80 bg-amber-900/12 rounded-full blur-3xl pointer-events-none" />
        <FadeUp className="relative z-10 text-center max-w-xl mx-auto">
          <CalendarDays className="w-8 h-8 text-amber-400 mx-auto mb-4" />
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            This Weekend Is 45 Minutes Away
          </h2>
          <p className="text-white/45 mb-8">
            Rooms from ₹1,200/night · instant WhatsApp confirmation · free cancellation up to 24 hours before check-in.
          </p>
          <Link
            href={BOOK_URL}
            className="inline-flex items-center gap-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold px-10 py-4 rounded-2xl transition-all hover:scale-105 shadow-2xl shadow-amber-500/25"
          >
            Check This Weekend's Availability <ArrowRight className="w-5 h-5" />
          </Link>
        </FadeUp>
      </section>

      {/* ── Slim footer ──────────────────────────────────── */}
      <footer className="bg-[#0D1B0E] text-white/30 py-8 px-5 border-t border-white/5 text-center text-xs">
        <p className="mb-3">
          {BUSINESS.brand} · Kohka, Bhilai, Chhattisgarh ·{" "}
          <a href={BUSINESS.phoneHref} className="text-amber-300/80 hover:text-amber-200">{BUSINESS.phone}</a>
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 justify-center">
          {[
            { label: "Home", href: "/" },
            { label: "Book a Room", href: BOOK_URL },
            { label: "Contact", href: "/contact" },
            { label: "Terms", href: "/terms" },
            { label: "Privacy", href: "/privacy" },
          ].map((l) => (
            <Link key={l.label} href={l.href} className="hover:text-white/60 transition-colors">{l.label}</Link>
          ))}
        </div>
      </footer>
    </div>
  );
}
