import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Navbar from "@/components/customer/Navbar";

// ─── Reusable prose helpers (dark-theme styled) ───────────────────────────────

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="text-lg font-bold text-white mb-3">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-white/55">{children}</div>
    </section>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>;
}

export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400/60 shrink-0 mt-2" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

// ─── Page shell ────────────────────────────────────────────────────────────────

export default function LegalShell({
  title,
  subtitle,
  lastUpdated,
  children,
}: {
  title: string;
  subtitle?: string;
  lastUpdated?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#071209]">
      <Navbar />

      {/* Title strip */}
      <div className="relative mt-16 border-b border-white/8 bg-gradient-to-b from-amber-950/20 to-transparent">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/50 to-transparent" />
        <div className="max-w-3xl mx-auto px-5 py-10">
          <p className="text-amber-400/70 text-xs font-bold tracking-[0.2em] uppercase mb-2">Legal</p>
          <h1 className="text-2xl md:text-3xl font-bold text-white">{title}</h1>
          {subtitle && <p className="text-white/40 text-sm mt-2">{subtitle}</p>}
          {lastUpdated && (
            <p className="text-white/25 text-xs mt-3">Last updated: {lastUpdated}</p>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-5 py-10">
        <div className="glass-card glass-top-highlight rounded-3xl p-6 md:p-10">
          {children}
        </div>

        <Link
          href="/"
          className="inline-flex items-center gap-1.5 mt-6 text-sm text-white/45 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to home
        </Link>
      </div>
    </div>
  );
}
