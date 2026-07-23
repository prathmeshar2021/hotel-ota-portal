"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { Loader2, Mail, Lock, ArrowRight, ShieldCheck } from "lucide-react";

export default function StaffLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await signIn("staff-login", { email, password, redirect: false });
    setLoading(false);
    if (res?.ok) {
      toast.success("Welcome back!");
      window.location.href = "/hotel-admin/dashboard";
    } else {
      toast.error("Invalid user ID or password.");
    }
  }

  return (
    <div className="min-h-screen flex">

      {/* ── Left: image panel ── */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col">
        <Image
          src="/images/hero.jpg"
          alt="The Urban Escape — Front Desk"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-black/90 via-black/55 to-black/25" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/70" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-400/60 to-transparent" />

        <div className="relative z-10 flex flex-col h-full p-10">
          <Link href="/" className="block w-fit">
            <Image src="/logo.png" alt="The Urban Escape" width={120} height={120} className="h-10 w-auto rounded-lg" />
          </Link>

          <div className="flex-1 flex flex-col justify-center">
            <div className="inline-flex items-center gap-2 bg-blue-500/15 border border-blue-400/25 text-blue-300 text-xs font-bold px-3 py-1.5 rounded-full mb-6 w-fit tracking-wider uppercase">
              <ShieldCheck className="w-3.5 h-3.5" />
              Front Desk Access
            </div>
            <h2 className="text-4xl font-bold text-white leading-tight mb-4">
              Hotel Management<br />
              <span className="text-blue-400">Portal.</span>
            </h2>
            <p className="text-white/50 text-sm leading-relaxed max-w-xs">
              Manage bookings, check guests in and out, monitor room status,
              and keep your resort running smoothly.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {["Booking Management", "Guest Check-in", "Room Status", "Daily Reports"].map((f) => (
              <span
                key={f}
                className="text-[11px] text-white/40 bg-white/5 border border-white/10 px-3 py-1 rounded-full"
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right: login form ── */}
      <div className="flex-1 bg-[#071209] flex flex-col items-center justify-center px-6 py-12 relative overflow-hidden">
        <div className="absolute top-1/3 right-1/4 w-64 h-64 bg-blue-900/8 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-sm relative z-10">
          <Link href="/" className="block mb-8 lg:hidden w-fit">
            <Image src="/logo.png" alt="The Urban Escape" width={120} height={120} className="h-9 w-auto rounded-lg" />
          </Link>

          <div className="mb-8">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/15 border border-blue-500/25 flex items-center justify-center mb-4">
              <ShieldCheck className="w-6 h-6 text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-1">Staff Sign In</h1>
            <p className="text-white/40 text-sm">Access the hotel management dashboard</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">
                User ID
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                <input
                  type="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="e.g. rahul"
                  value={email}
                  onChange={(e) => setEmail(e.target.value.trim().toLowerCase())}
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-blue-400/50 focus:bg-white/8 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                <input
                  type="password"
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-blue-400/50 focus:bg-white/8 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-400 disabled:opacity-60 text-white font-bold py-3.5 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-blue-500/20 mt-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>Sign In <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          <p className="text-center text-xs text-white/20 mt-10">
            © {new Date().getFullYear()} The Urban Escape, By Saubhagya Mangalam
          </p>
        </div>
      </div>
    </div>
  );
}
