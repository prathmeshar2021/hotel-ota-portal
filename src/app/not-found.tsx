import Link from "next/link";
import { Compass, Home, BedDouble } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#071209] flex items-center justify-center px-5">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center mb-6">
          <Compass className="w-7 h-7 text-amber-400" />
        </div>
        <p className="text-amber-400/70 text-5xl font-black tracking-tight mb-2">404</p>
        <h1 className="text-xl font-bold text-white mb-2">Page not found</h1>
        <p className="text-white/45 text-sm leading-relaxed mb-6">
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold px-5 py-2.5 rounded-xl transition-all"
          >
            <Home className="w-4 h-4" /> Home
          </Link>
          <Link
            href="/hotels"
            className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white font-semibold px-5 py-2.5 rounded-xl transition-all"
          >
            <BedDouble className="w-4 h-4" /> Browse stays
          </Link>
        </div>
      </div>
    </div>
  );
}
