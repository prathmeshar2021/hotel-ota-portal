"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { usePanelT, LangToggle } from "@/components/i18n/PanelLang";
import type { PanelKey } from "@/lib/i18n/panel";
import {
  LayoutDashboard,
  BookOpen,
  BedDouble,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  ChevronRight,
  Users,
  PlusCircle,
  Wallet,
  BookOpenText,
  Bell,
  Crown,
  Plane,
  MessageCircle,
  MonitorSmartphone,
  UserCog,
} from "lucide-react";

interface AdminNavProps {
  staffName: string;
  staffRole: string;
  hotelName: string;
  pendingOtps?: number;
}

const NAV_LINKS: { href: string; tKey: PanelKey; icon: typeof LayoutDashboard; superAdminOnly?: boolean }[] = [
  { href: "/hotel-admin/dashboard", tKey: "nav.dashboard", icon: LayoutDashboard },
  { href: "/hotel-admin/bookings", tKey: "nav.bookings", icon: BookOpen },
  { href: "/hotel-admin/rooms", tKey: "nav.rooms", icon: BedDouble },
  { href: "/hotel-admin/guests", tKey: "nav.guests", icon: Users },
  { href: "/hotel-admin/accounts", tKey: "nav.accounts", icon: Wallet },
  { href: "/hotel-admin/gommt-finance", tKey: "nav.gommtFinance", icon: Plane },
  { href: "/hotel-admin/ledger", tKey: "nav.ledger", icon: BookOpenText },
  { href: "/hotel-admin/support", tKey: "nav.supportChat", icon: MessageCircle },
  { href: "/hotel-admin/kiosk", tKey: "nav.kioskDevices", icon: MonitorSmartphone, superAdminOnly: true },
  { href: "/hotel-admin/account", tKey: "nav.myAccount", icon: UserCog },
];

export default function AdminNav({ staffName, staffRole, hotelName, pendingOtps = 0 }: AdminNavProps) {
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
          <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">{t("nav.frontDesk")}</p>
            <p className="text-white/35 text-[10px] truncate max-w-[130px]">{hotelName}</p>
          </div>
        </div>
      </div>

      {/* New Booking CTA */}
      <div className="px-3 pt-3 space-y-2">
        <Link
          href="/hotel-admin/bookings/new"
          onClick={() => setMobileOpen(false)}
          className="flex items-center justify-center gap-2 w-full bg-blue-500 hover:bg-blue-400 text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-500/20"
        >
          <PlusCircle className="w-4 h-4" /> {t("nav.newBooking")}
        </Link>

        {/* Back to Owner Console — only shown when super admin is viewing front desk */}
        {staffRole === "SUPER_ADMIN" && (
          <Link
            href="/admin/dashboard"
            onClick={() => setMobileOpen(false)}
            className="flex items-center justify-center gap-2 w-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-400/80 hover:text-amber-300 font-semibold text-sm px-4 py-2.5 rounded-xl transition-all border border-amber-500/20 hover:border-amber-500/35"
          >
            <Crown className="w-4 h-4" /> {t("nav.ownerConsole")}
          </Link>
        )}
      </div>

      {/* Nav links */}
      <nav className="flex-1 p-3 space-y-1">
        {NAV_LINKS
          .filter((link) => !("superAdminOnly" in link) || staffRole === "SUPER_ADMIN")
          .map(({ href, tKey, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
                active
                  ? "bg-blue-500/15 text-blue-300 border border-blue-500/25"
                  : "text-white/45 hover:text-white hover:bg-white/5"
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${active ? "text-blue-400" : "text-white/30 group-hover:text-white/60"}`} />
              {t(tKey)}
              {active && <ChevronRight className="w-3.5 h-3.5 ml-auto text-blue-400/60" />}
            </Link>
          );
        })}

        {/* Pending Approvals — always visible with badge when items exist */}
        {(() => {
          const active = isActive("/hotel-admin/pending-approvals");
          return (
            <Link
              href="/hotel-admin/pending-approvals"
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
                active
                  ? "bg-amber-500/15 text-amber-300 border border-amber-500/25"
                  : pendingOtps > 0
                    ? "text-amber-400/80 hover:text-amber-300 hover:bg-amber-500/8 border border-amber-500/15"
                    : "text-white/45 hover:text-white hover:bg-white/5"
              }`}
            >
              <Bell className={`w-4 h-4 shrink-0 ${active ? "text-amber-400" : pendingOtps > 0 ? "text-amber-400" : "text-white/30 group-hover:text-white/60"}`} />
              {t("nav.pendingApprovals")}
              {pendingOtps > 0 && (
                <span className="ml-auto flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-black text-[10px] font-black shrink-0">
                  {pendingOtps > 9 ? "9+" : pendingOtps}
                </span>
              )}
              {active && pendingOtps === 0 && (
                <ChevronRight className="w-3.5 h-3.5 ml-auto text-amber-400/60" />
              )}
            </Link>
          );
        })()}
      </nav>

      {/* Staff info + language + sign out */}
      <div className="p-3 border-t border-white/8">
        <div className="px-3 pb-2">
          <LangToggle />
        </div>
        <div className="flex items-center gap-3 px-3 py-2.5 mb-1">
          <div className="w-8 h-8 rounded-full bg-white/8 border border-white/10 flex items-center justify-center text-xs font-bold text-white/60 shrink-0">
            {staffName.charAt(0).toUpperCase()}
          </div>
          <div className="overflow-hidden">
            <p className="text-white/70 text-xs font-semibold truncate">{staffName}</p>
            <p className="text-white/30 text-[10px]">{staffRole.replace("_", " ")}</p>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/auth/staff-login" })}
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
            <p className="text-white font-bold text-sm">Front Desk</p>
            <p className="text-white/35 text-[10px]">{hotelName}</p>
          </div>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="text-white/60 hover:text-white p-1.5 rounded-lg hover:bg-white/8 transition-all"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
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
          <aside className="lg:hidden fixed top-0 left-0 bottom-0 w-64 bg-[#071209] border-r border-white/8 z-50 flex flex-col">
            {navContent}
          </aside>
        </>
      )}
    </>
  );
}
