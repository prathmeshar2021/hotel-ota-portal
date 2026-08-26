"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { usePanelT, LangToggle } from "@/components/i18n/PanelLang";
import type { PanelKey } from "@/lib/i18n/panel";
import {
  LayoutDashboard,
  TicketPercent,
  Percent,
  Sparkles,
  Tag,
  CalendarRange,
  ShieldCheck,
  LogOut,
  Menu,
  X,
  Crown,
  ChevronRight,
  LayoutGrid,
  FileSpreadsheet,
  MessageCircle,
  Users,
  Trash2,
} from "lucide-react";

interface SuperAdminNavProps {
  adminName: string;
  hotelName: string;
  pendingOtps?: number;
}

const NAV_LINKS: { href: string; tKey: PanelKey; icon: typeof LayoutDashboard; badge?: boolean }[] = [
  { href: "/admin/dashboard", tKey: "nav.overview", icon: LayoutDashboard },
  { href: "/admin/pricing", tKey: "nav.pricing", icon: Tag },
  { href: "/admin/inventory", tKey: "nav.inventory", icon: CalendarRange },
  { href: "/admin/coupons", tKey: "nav.coupons", icon: TicketPercent },
  { href: "/admin/promotions", tKey: "nav.promotions", icon: Sparkles },
  { href: "/admin/gst-report", tKey: "nav.gstReport", icon: FileSpreadsheet },
  { href: "/admin/discounts", tKey: "nav.staffDiscounts", icon: Percent },
  { href: "/admin/approvals", tKey: "nav.approvals", icon: ShieldCheck, badge: true },
  { href: "/admin/staff", tKey: "nav.staff", icon: Users },
  { href: "/admin/activity", tKey: "nav.activityLog", icon: ShieldCheck },
  { href: "/admin/deleted-bookings", tKey: "nav.deletedBookings", icon: Trash2 },
  { href: "/admin/hotel-admin/support", tKey: "nav.supportChat", icon: MessageCircle },
];

export default function SuperAdminNav({ adminName, hotelName, pendingOtps = 0 }: SuperAdminNavProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const t = usePanelT();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  const navContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-5 border-b border-white/8">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
            <Crown className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">{t("nav.ownerConsole")}</p>
            <p className="text-white/35 text-[10px] truncate max-w-[130px]">{hotelName}</p>
          </div>
        </div>
      </div>

      {/* Front desk shortcut */}
      <div className="px-3 pt-3">
        <Link
          href="/hotel-admin/dashboard"
          onClick={() => setMobileOpen(false)}
          className="flex items-center justify-center gap-2 w-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition-all border border-white/10"
        >
          <LayoutGrid className="w-4 h-4" /> {t("nav.frontDesk")}
        </Link>
      </div>

      {/* Nav links */}
      <nav className="flex-1 p-3 space-y-1">
        {NAV_LINKS.map(({ href, tKey, icon: Icon, badge }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
                active
                  ? "bg-amber-500/15 text-amber-300 border border-amber-500/25"
                  : "text-white/45 hover:text-white hover:bg-white/5"
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${active ? "text-amber-400" : "text-white/30 group-hover:text-white/60"}`} />
              {t(tKey)}
              {badge && pendingOtps > 0 && (
                <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                  {pendingOtps}
                </span>
              )}
              {active && !(badge && pendingOtps > 0) && (
                <ChevronRight className="w-3.5 h-3.5 ml-auto text-amber-400/60" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Admin info + sign out */}
      <div className="p-3 border-t border-white/8">
        <div className="px-3 pb-2">
          <LangToggle />
        </div>
        <div className="flex items-center gap-3 px-3 py-2.5 mb-1">
          <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-xs font-bold text-amber-300/80 shrink-0">
            {adminName.charAt(0).toUpperCase()}
          </div>
          <div className="overflow-hidden">
            <p className="text-white/70 text-xs font-semibold truncate">{adminName}</p>
            <p className="text-amber-400/50 text-[10px]">Super Admin</p>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/auth/admin-login" })}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/35 hover:text-red-400 hover:bg-red-500/8 transition-all w-full"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {t("nav.signOut")}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-56 fixed inset-y-0 left-0 bg-black/40 border-r border-white/8 backdrop-blur-sm z-40">
        {navContent}
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-black/80 border-b border-white/8 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-white font-bold text-sm">{t("nav.ownerConsole")}</p>
            <p className="text-white/35 text-[10px]">{hotelName}</p>
          </div>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="text-white/60 hover:text-white p-1.5 rounded-lg hover:bg-white/8 transition-all relative"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            {!mobileOpen && pendingOtps > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 bg-black/60 z-30"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="lg:hidden fixed top-0 left-0 bottom-0 w-64 bg-[#0d0a04] border-r border-white/8 z-50 flex flex-col">
            {navContent}
          </aside>
        </>
      )}
    </>
  );
}
