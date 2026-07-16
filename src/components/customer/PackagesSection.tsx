import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { FadeUp, Stagger, StaggerItem } from "@/components/customer/AnimatedSection";
import { PACKAGES, waLink } from "@/lib/constants/packages";

/**
 * Occasion packages grid — couples & group weekends. Each card quotes the
 * real nightly stay rate and hands the add-on conversation to WhatsApp,
 * which is how nearby guests actually book occasions.
 */
export default function PackagesSection({
  heading = "Plan Your Weekend",
  subheading = "Tell us the occasion — we'll set it up before you arrive.",
}: {
  heading?: string;
  subheading?: string;
}) {
  return (
    <section id="packages" className="bg-[#0D1B0E] py-20 px-5 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent pointer-events-none" />
      <div className="max-w-6xl mx-auto relative z-10">
        <FadeUp className="text-center mb-12">
          <p className="text-amber-400 font-bold text-xs tracking-[0.2em] uppercase mb-3">Weekend Packages</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">{heading}</h2>
          <p className="text-white/45 max-w-lg mx-auto">{subheading}</p>
        </FadeUp>

        <Stagger className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {PACKAGES.map((p) => (
            <StaggerItem key={p.id}>
              <div className="group h-full flex flex-col sm:flex-row rounded-3xl overflow-hidden border border-white/10 hover:border-white/18 bg-white/[0.03] transition-all duration-300 hover:-translate-y-0.5 shadow-[0_8px_32px_rgba(0,0,0,0.35)]">
                {/* Image */}
                <div className="relative w-full sm:w-44 h-40 sm:h-auto shrink-0 overflow-hidden">
                  <Image
                    src={p.image}
                    alt={p.name}
                    fill
                    sizes="(max-width: 640px) 100vw, 176px"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <span
                    className="absolute top-3 left-3 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full text-black"
                    style={{ background: p.accent }}
                  >
                    {p.audience}
                  </span>
                </div>

                {/* Details */}
                <div className="flex flex-col flex-1 p-5">
                  <h3 className="font-bold text-white text-base mb-1">{p.name}</h3>
                  <p className="text-xs text-white/40 mb-3 leading-relaxed">{p.tagline}</p>

                  <ul className="space-y-1.5 mb-4">
                    {p.includes.map((line) => (
                      <li key={line} className="flex items-start gap-2 text-xs text-white/55">
                        <Check className="w-3.5 h-3.5 mt-px shrink-0" style={{ color: p.accent }} />
                        {line}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-auto flex items-center justify-between gap-3">
                    <p className="leading-tight">
                      <span className="text-[10px] text-white/35 uppercase tracking-wider font-semibold block">Stay from</span>
                      <span className="font-bold text-lg" style={{ color: p.accent }}>
                        ₹{p.stayFrom.toLocaleString("en-IN")}
                        <span className="text-white/35 text-xs font-medium">{p.stayFromLabel}</span>
                      </span>
                    </p>
                    <a
                      href={waLink(p.waMessage)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 bg-[#25D366]/15 hover:bg-[#25D366]/25 border border-[#25D366]/30 text-[#4ade80] font-semibold text-xs px-3.5 py-2.5 rounded-xl transition-colors whitespace-nowrap"
                    >
                      Plan on WhatsApp
                    </a>
                  </div>
                </div>
              </div>
            </StaggerItem>
          ))}
        </Stagger>

        <FadeUp className="text-center mt-10">
          <Link
            href="/hotel/the-urban-escape-bhilai"
            className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white/80 transition-colors font-semibold"
          >
            Or browse all rooms & book directly <ArrowRight className="w-4 h-4" />
          </Link>
        </FadeUp>
      </div>
    </section>
  );
}
