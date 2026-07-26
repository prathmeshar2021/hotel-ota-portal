import { redirect } from "next/navigation";
import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/superAdmin";
import { prisma } from "@/lib/db/prisma";
import { Percent, TrendingDown, Users, ExternalLink } from "lucide-react";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

/**
 * Owner-only view of every counter discount staff gave out of their own
 * discretion (Booking.staffDiscount > 0) — who gave it, how much, and on which
 * booking. Coupon-code discounts are deliberately excluded; those are policy,
 * these are judgement calls worth reviewing.
 */
export default async function StaffDiscountsPage() {
  const ctx = await requireSuperAdmin();
  if (!ctx) redirect("/auth/admin-login");

  const bookings = await prisma.booking.findMany({
    where: { hotelId: ctx.hotelId, staffDiscount: { gt: 0 } },
    select: {
      id: true, bookingRef: true, checkInDate: true, createdAt: true,
      staffDiscount: true, originalTotal: true, totalAmount: true,
      discountedByName: true, discountReason: true, discountedAt: true,
      status: true,
      primaryGuest: { select: { name: true } },
    },
    orderBy: { discountedAt: "desc" },
    take: 200,
  });

  const totalGiven = bookings.reduce((s, b) => s + b.staffDiscount, 0);

  // Per-staff rollup so the owner can see who discounts most.
  const byStaff = new Map<string, { count: number; total: number }>();
  for (const b of bookings) {
    const key = b.discountedByName ?? "Unknown";
    const cur = byStaff.get(key) ?? { count: 0, total: 0 };
    byStaff.set(key, { count: cur.count + 1, total: cur.total + b.staffDiscount });
  }
  const staffRows = [...byStaff.entries()].sort((a, b) => b[1].total - a[1].total);

  const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  return (
    <div className="p-5 sm:p-8 max-w-6xl mx-auto">
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
          <Percent className="w-6 h-6 text-purple-400" /> Staff Discounts
        </h1>
        <p className="text-white/40 text-sm mt-1.5">
          Discounts staff gave at the counter, outside of coupon codes.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-7">
        <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
          <p className="text-white/35 text-xs uppercase tracking-wider mb-1.5">Total discounted</p>
          <p className="text-2xl font-bold text-purple-300">{inr(totalGiven)}</p>
        </div>
        <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
          <p className="text-white/35 text-xs uppercase tracking-wider mb-1.5">Bookings</p>
          <p className="text-2xl font-bold text-white">{bookings.length}</p>
        </div>
        <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
          <p className="text-white/35 text-xs uppercase tracking-wider mb-1.5">Avg per booking</p>
          <p className="text-2xl font-bold text-white">
            {bookings.length ? inr(+(totalGiven / bookings.length).toFixed(2)) : "₹0"}
          </p>
        </div>
      </div>

      {/* Per-staff rollup */}
      {staffRows.length > 0 && (
        <div className="bg-white/3 border border-white/8 rounded-2xl p-5 mb-7">
          <h2 className="font-semibold text-white flex items-center gap-2 mb-4 text-sm">
            <Users className="w-4 h-4 text-white/40" /> By staff member
          </h2>
          <div className="space-y-2.5">
            {staffRows.map(([name, s]) => (
              <div key={name} className="flex items-center justify-between text-sm">
                <span className="text-white/70">{name}</span>
                <span className="text-white/40 text-xs">
                  {s.count} booking{s.count !== 1 ? "s" : ""} ·{" "}
                  <span className="text-purple-300 font-semibold">{inr(s.total)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detail table */}
      {bookings.length === 0 ? (
        <div className="bg-white/3 border border-white/8 rounded-2xl p-10 text-center">
          <TrendingDown className="w-8 h-8 text-white/15 mx-auto mb-3" />
          <p className="text-white/40 text-sm">No staff discounts given yet.</p>
        </div>
      ) : (
        <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="text-left text-white/35 text-xs uppercase tracking-wider border-b border-white/8">
                  <th className="px-4 py-3 font-semibold">Booking</th>
                  <th className="px-4 py-3 font-semibold">Guest</th>
                  <th className="px-4 py-3 font-semibold">Staff</th>
                  <th className="px-4 py-3 font-semibold text-right">Original</th>
                  <th className="px-4 py-3 font-semibold text-right">Discount</th>
                  <th className="px-4 py-3 font-semibold text-right">Charged</th>
                  <th className="px-4 py-3 font-semibold">Reason</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map(b => (
                  <tr key={b.id} className="border-b border-white/5 last:border-0 hover:bg-white/3">
                    <td className="px-4 py-3">
                      <Link href={`/hotel-admin/bookings/${b.id}`}
                        className="text-blue-300 hover:text-blue-200 font-semibold inline-flex items-center gap-1">
                        {b.bookingRef} <ExternalLink className="w-3 h-3" />
                      </Link>
                      <p className="text-white/25 text-[11px] mt-0.5">
                        {format(b.discountedAt ?? b.createdAt, "dd MMM yyyy, h:mm a")}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-white/70">{b.primaryGuest.name}</td>
                    <td className="px-4 py-3 text-white/70">{b.discountedByName ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-white/35 line-through">
                      {b.originalTotal != null ? inr(b.originalTotal) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-purple-300 font-bold">
                      −{inr(b.staffDiscount)}
                    </td>
                    <td className="px-4 py-3 text-right text-white font-semibold">{inr(b.totalAmount)}</td>
                    <td className="px-4 py-3 text-white/40 text-xs max-w-[200px]">
                      {b.discountReason || <span className="text-white/15">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
