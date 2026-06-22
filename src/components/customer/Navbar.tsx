"use client";

import Link from "next/link";
import Image from "next/image";
import { useSession, signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Menu, X, BookOpen, LogOut, User, Settings, MessageCircle } from "lucide-react";

export default function Navbar() {
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? "bg-[#0D1B0E]/98 backdrop-blur-md shadow-lg shadow-black/30 border-b border-white/8"
          : "bg-[#071209]/75 backdrop-blur-sm border-b border-white/5"
      }`}
    >
      {/* Ambient amber glow on the top edge */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent pointer-events-none" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16 md:h-18">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
            <Image src="/logo.png" alt="The Urban Escape" width={40} height={40} className="h-9 w-9 rounded-lg" priority />
            <div className="flex flex-col leading-tight">
              <span className="text-white font-bold text-sm tracking-wide group-hover:text-amber-300 transition-colors">The Urban Escape</span>
              <span className="text-amber-400/60 text-[9px] tracking-[0.2em] uppercase hidden sm:block">By Saubhagya Mangalam</span>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium">
            <a href="/#rooms" className="text-white/70 hover:text-white transition-colors">
              Rooms
            </a>
            <a href="/#gallery" className="text-white/70 hover:text-white transition-colors">
              Gallery
            </a>
            <a href="/#amenities" className="text-white/70 hover:text-white transition-colors">
              Amenities
            </a>
            <a href="/#contact" className="text-white/70 hover:text-white transition-colors">
              Contact
            </a>
          </nav>

          {/* Desktop auth + CTA */}
          <div className="hidden md:flex items-center gap-3">
            {session?.user ? (
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-2 hover:opacity-80 transition outline-none">
                  <Avatar className="w-8 h-8 border border-white/20">
                    <AvatarFallback className="bg-amber-800 text-amber-100 text-sm font-semibold">
                      {session.user.name?.[0]?.toUpperCase() ?? "U"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium text-white/80">{session.user.name}</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-48 bg-[#0D1B0E] border-white/10 text-white"
                >
                  <DropdownMenuItem
                    className="text-white/70 hover:text-white hover:bg-white/10 cursor-pointer"
                    onClick={() => (window.location.href = "/my-bookings")}
                  >
                    <BookOpen className="w-4 h-4 mr-2" />
                    My Bookings
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-white/70 hover:text-white hover:bg-white/10 cursor-pointer"
                    onClick={() => (window.location.href = "/account")}
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    My Account
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-white/70 hover:text-white hover:bg-white/10 cursor-pointer"
                    onClick={() => (window.location.href = "/support")}
                  >
                    <MessageCircle className="w-4 h-4 mr-2" />
                    Support
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem
                    className="text-red-400 hover:text-red-300 hover:bg-white/10 cursor-pointer"
                    onClick={() => signOut({ callbackUrl: "/" })}
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link
                href="/auth/login"
                className="text-sm text-white/70 hover:text-white flex items-center gap-1.5 transition-colors px-3 py-1.5"
              >
                <User className="w-4 h-4" />
                Login
              </Link>
            )}
            <Link
              href="/hotel/the-urban-escape-bhilai"
              className="bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm px-5 py-2.5 rounded-xl transition-all hover:shadow-lg hover:shadow-amber-500/30"
            >
              Book Now
            </Link>
          </div>

          {/* Mobile menu toggle */}
          <button
            className="md:hidden p-2 text-white"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu — animated slide-down */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            key="mobile-menu"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="md:hidden overflow-hidden bg-[#0D1B0E]/97 backdrop-blur-md border-t border-white/10"
          >
            <motion.div
              className="px-4 py-5 space-y-1"
              initial="hidden"
              animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } } }}
            >
              {[
                { href: "/#rooms", label: "Rooms" },
                { href: "/#gallery", label: "Gallery" },
                { href: "/#amenities", label: "Amenities" },
                { href: "/#contact", label: "Contact" },
              ].map(({ href, label }) => (
                <motion.a
                  key={label}
                  href={href}
                  variants={{ hidden: { opacity: 0, x: -16 }, show: { opacity: 1, x: 0 } }}
                  className="block text-sm font-medium text-white/70 hover:text-white py-2.5 border-b border-white/5 transition-colors"
                  onClick={() => setMobileOpen(false)}
                >
                  {label}
                </motion.a>
              ))}

              {session?.user ? (
                <>
                  <motion.div variants={{ hidden: { opacity: 0, x: -16 }, show: { opacity: 1, x: 0 } }}>
                    <Link
                      href="/my-bookings"
                      className="flex items-center gap-2 text-sm font-medium text-white/70 hover:text-white py-2.5 border-b border-white/5 transition-colors"
                      onClick={() => setMobileOpen(false)}
                    >
                      <BookOpen className="w-4 h-4" /> My Bookings
                    </Link>
                  </motion.div>
                  <motion.div variants={{ hidden: { opacity: 0, x: -16 }, show: { opacity: 1, x: 0 } }}>
                    <Link
                      href="/account"
                      className="flex items-center gap-2 text-sm font-medium text-white/70 hover:text-white py-2.5 border-b border-white/5 transition-colors"
                      onClick={() => setMobileOpen(false)}
                    >
                      <Settings className="w-4 h-4" /> My Account
                    </Link>
                  </motion.div>
                  <motion.div variants={{ hidden: { opacity: 0, x: -16 }, show: { opacity: 1, x: 0 } }}>
                    <Link
                      href="/support"
                      className="flex items-center gap-2 text-sm font-medium text-white/70 hover:text-white py-2.5 border-b border-white/5 transition-colors"
                      onClick={() => setMobileOpen(false)}
                    >
                      <MessageCircle className="w-4 h-4" /> Support
                    </Link>
                  </motion.div>
                  <motion.div variants={{ hidden: { opacity: 0, x: -16 }, show: { opacity: 1, x: 0 } }}>
                    <button
                      className="flex items-center gap-2 text-sm font-medium text-red-400 py-2.5 border-b border-white/5"
                      onClick={() => { signOut({ callbackUrl: "/" }); setMobileOpen(false); }}
                    >
                      <LogOut className="w-4 h-4" /> Sign out
                    </button>
                  </motion.div>
                </>
              ) : (
                <motion.div variants={{ hidden: { opacity: 0, x: -16 }, show: { opacity: 1, x: 0 } }}>
                  <Link
                    href="/auth/login"
                    className="flex items-center gap-2 text-sm font-medium text-white/70 hover:text-white py-2.5 border-b border-white/5 transition-colors"
                    onClick={() => setMobileOpen(false)}
                  >
                    <User className="w-4 h-4" /> Login / Register
                  </Link>
                </motion.div>
              )}

              <motion.div
                variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
                className="pt-3"
              >
                <Link
                  href="/hotel/the-urban-escape-bhilai"
                  className="block w-full bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm px-5 py-3 rounded-xl text-center transition-all"
                  onClick={() => setMobileOpen(false)}
                >
                  Book Now
                </Link>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
