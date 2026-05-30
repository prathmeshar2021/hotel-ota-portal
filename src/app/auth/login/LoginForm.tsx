"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { Loader2, Phone, Lock, ArrowRight, TreePine } from "lucide-react";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

export default function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/my-bookings";

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleGoogleLogin() {
    setGoogleLoading(true);
    await signIn("google", { callbackUrl });
    // page navigates away — no need to setGoogleLoading(false)
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await signIn("guest-login", {
      phone: phone.replace(/\D/g, ""),
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.ok) {
      toast.success("Welcome back!");
      window.location.href = callbackUrl;
    } else {
      toast.error("Invalid phone number or password.");
    }
  }

  return (
    <div className="min-h-screen flex">

      {/* ── Left: Resort image panel ─────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col">
        {/* Background image */}
        <Image
          src="/images/lc-interior.jpg"
          alt="The Urban Escape — Luxury Cottage"
          fill
          className="object-cover"
          priority
        />
        {/* Overlays */}
        <div className="absolute inset-0 bg-gradient-to-tr from-black/80 via-black/40 to-black/20" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/60" />

        {/* LED top strip */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/70 to-transparent" />

        {/* Content */}
        <div className="relative z-10 flex flex-col h-full p-10">
          {/* Logo */}
          <Link href="/" className="flex flex-col leading-tight group w-fit">
            <span className="text-white font-bold text-lg group-hover:text-amber-300 transition-colors">
              The Urban Escape
            </span>
            <span className="text-amber-400/60 text-[10px] tracking-[0.2em] uppercase">By Saubhagya Mangalam</span>
          </Link>

          {/* Center text */}
          <div className="flex-1 flex flex-col justify-center">
            <div className="inline-flex items-center gap-2 bg-amber-500/15 border border-amber-400/25 text-amber-300 text-xs font-bold px-3 py-1.5 rounded-full mb-6 w-fit tracking-wider uppercase">
              <TreePine className="w-3.5 h-3.5" />
              Bhilai, Chhattisgarh
            </div>
            <h2 className="text-4xl font-bold text-white leading-tight mb-4">
              Your Escape<br />
              <span className="text-amber-400">Awaits.</span>
            </h2>
            <p className="text-white/50 text-sm leading-relaxed max-w-xs">
              Sign in to manage your bookings, complete online check-in, and make every stay seamless.
            </p>
          </div>

          {/* Bottom room features */}
          <div className="flex flex-wrap gap-2">
            {["Pine Wood Interiors", "Amber LED Ambiance", "Forest View", "24/7 Service"].map((f) => (
              <span key={f} className="text-[11px] text-white/40 bg-white/5 border border-white/10 px-3 py-1 rounded-full">
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right: Login form ─────────────────────────────── */}
      <div className="flex-1 bg-[#071209] flex flex-col items-center justify-center px-6 py-12 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-1/4 right-1/4 w-64 h-64 bg-amber-900/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 left-1/4 w-48 h-48 bg-green-900/8 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-sm relative z-10">
          {/* Mobile logo */}
          <Link href="/" className="flex flex-col leading-tight mb-8 lg:hidden">
            <span className="text-white font-bold text-lg">The Urban Escape</span>
            <span className="text-amber-400/60 text-[10px] tracking-[0.2em] uppercase">By Saubhagya Mangalam</span>
          </Link>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-white mb-1">Welcome back</h1>
            <p className="text-white/40 text-sm">Sign in to view your bookings</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Phone */}
            <div>
              <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">
                Mobile Number
              </label>
              <div className="flex">
                <span className="flex items-center gap-1.5 px-3.5 bg-white/5 border border-white/10 border-r-0 rounded-l-xl text-white/40 text-sm shrink-0">
                  <Phone className="w-3.5 h-3.5" /> +91
                </span>
                <input
                  type="tel"
                  placeholder="10-digit number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  required
                  className="flex-1 bg-white/5 border border-white/10 rounded-r-xl px-4 py-3 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/50 focus:bg-white/8 transition-all"
                />
              </div>
            </div>

            {/* Password */}
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
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/50 focus:bg-white/8 transition-all"
                />
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-black font-bold py-3.5 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-amber-500/20 mt-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>Sign in <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-white/8" />
            <span className="text-white/25 text-xs">or</span>
            <div className="flex-1 h-px bg-white/8" />
          </div>

          {/* Google sign-in */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={googleLoading || loading}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 disabled:opacity-60 text-gray-800 font-semibold py-3 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] shadow-sm"
          >
            {googleLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
            ) : (
              <GoogleIcon />
            )}
            Continue with Google
          </button>

          <p className="text-center text-sm text-white/40 mt-6">
            New guest?{" "}
            <Link href="/auth/register" className="text-amber-400 font-semibold hover:text-amber-300 transition-colors">
              Create an account
            </Link>
          </p>

          <p className="text-center text-xs text-white/20 mt-8">
            © {new Date().getFullYear()} The Urban Escape, By Saubhagya Mangalam
          </p>
        </div>
      </div>
    </div>
  );
}
