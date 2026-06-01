import Link from "next/link";
import {
  Tag,
  CalendarRange,
  TicketPercent,
  Sparkles,
  ShieldCheck,
  TrendingUp,
  BedDouble,
  IndianRupee,
  ArrowRight,
} from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth/superAdmin";
import { prisma } from "@/lib/db/prisma";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function SuperAdminDashboard() {
  const ctx = await requireSuperAdmin();
  if (!ctx) redirect("/auth/admin-login");

  const today = startOfToday();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [
    pendingOtps,
    activeCoupons,
    activePromotions,
    arrivalsToday,
    inHouse,
    monthRevenueAgg,
  ] = await Promise.all([
    prisma.adminOtp.count({ where: { hotelId: ctx.hotelId, status: "PENDING" } }),
    prisma.coupon.count({ where: { hotelId: ctx.hotelId, isActive: true } }),
    prisma.promotionScheme.count({ where: { hotelId: ctx.hotelId, isActive: true } }),
    prisma.booking.count({
      where: {
        hotelId: ctx.hotelId,
        checkInDate: { gte: today, lt: new Date(today.getTime() + 86400000) },
      },
    }),
    prisma.booking.count({
      where: { hotelId: ctx.hotelId, status: "CHECKED_IN" },
    }),
    prisma.booking.aggregate({
      where: {
        hotelId: ctx.hotelId,
        createdAt: { gte: monthStart },
        status: { notIn: ["CANCELLED", "PENDING_PAYMENT"] },
      },
      _sum: { totalAmount: true },
    }),
  ]);

  const monthRevenue = monthRevenueAgg._sum.totalAmount ?? 0;

  const stats = [
    {
      label: "Revenue (This Month)",
      value: `₹${monthRevenue.toLocaleString("en-IN")}`,
      icon: IndianRupee,
      accent: "text-emerald-400",
      bg: "bg-emerald-500/10 border-emerald-500/20",
    },
    {
      label: "Arrivals Today",
      value: arrivalsToday,
      icon: TrendingUp,
      accent: "text-blue-400",
      bg: "bg-blue-500/10 border-blue-500/20",
    },
    {
      label: "In-House Guests",
      value: inHouse,
      icon: BedDouble,
      accent: "text-violet-400",
      bg: "bg-violet-500/10 border-violet-500/20",
    },
    {
      label: "Pending Approvals",
      value: pendingOtps,
      icon: ShieldCheck,
      accent: pendingOtps > 0 ? "text-red-400" : "text-white/40",
      bg: pendingOtps > 0 ? "bg-red-500/10 border-red-500/20" : "bg-white/5 border-white/10",
    },
  ];

  const actions = [
    {
      href: "/admin/pricing",
      label: "Room Pricing",
      desc: "Set date-wise or bulk prices per room type",
      icon: Tag,
      accent: "text-amber-400",
    },
    {
      href: "/admin/inventory",
      label: "Inventory",
      desc: "Adjust available units date-wise or in bulk",
      icon: CalendarRange,
      accent: "text-cyan-400",
    },
    {
      href: "/admin/coupons",
      label: "Coupons",
      desc: "Generate instant flat / % discount codes",
      icon: TicketPercent,
      accent: "text-pink-400",
      meta: `${activeCoupons} active`,
    },
    {
      href: "/admin/promotions",
      label: "Promotions",
      desc: "Seasonal schemes with named campaigns",
      icon: Sparkles,
      accent: "text-fuchsia-400",
      meta: `${activePromotions} live`,
    },
    {
      href: "/admin/approvals",
      label: "OTP Approvals",
      desc: "Authorize cash debits, deletes & refunds",
      icon: ShieldCheck,
      accent: "text-red-400",
      meta: pendingOtps > 0 ? `${pendingOtps} waiting` : undefined,
    },
  ];

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <p className="text-amber-400/70 text-xs font-bold tracking-[0.2em] uppercase mb-1">
          Owner Console
        </p>
        <h1 className="text-2xl lg:text-3xl font-bold text-white">
          Welcome back, {ctx.name.split(" ")[0]}
        </h1>
        <p className="text-white/40 text-sm mt-1">{ctx.hotelName}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon, accent, bg }) => (
          <div key={label} className={`rounded-2xl border p-4 ${bg}`}>
            <Icon className={`w-5 h-5 mb-3 ${accent}`} />
            <p className="text-2xl font-bold text-white">{value}</p>
            <p className="text-white/40 text-xs mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <h2 className="text-white/60 text-sm font-semibold uppercase tracking-wider mb-3">
        Manage
      </h2>
      <div className="grid sm:grid-cols-2 gap-3">
        {actions.map(({ href, label, desc, icon: Icon, accent, meta }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-start gap-4 rounded-2xl border border-white/8 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/15 p-5 transition-all"
          >
            <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
              <Icon className={`w-5 h-5 ${accent}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-white font-semibold text-sm">{label}</p>
                {meta && (
                  <span className="text-[10px] font-bold text-amber-300/80 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full">
                    {meta}
                  </span>
                )}
              </div>
              <p className="text-white/40 text-xs mt-0.5 leading-relaxed">{desc}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-white/50 group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
          </Link>
        ))}
      </div>
    </div>
  );
}
