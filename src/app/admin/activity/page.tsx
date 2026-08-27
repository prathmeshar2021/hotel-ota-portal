import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/superAdmin";
import { prisma } from "@/lib/db/prisma";
import { ShieldCheck, Banknote, CalendarX, Pencil } from "lucide-react";
import { startOfMonth } from "date-fns";
import ActivityLogClient, { type ActivityRow } from "@/components/admin/ActivityLogClient";

export const dynamic = "force-dynamic";

/**
 * Every sensitive action staff took, searchable.
 *
 * These used to require the owner's OTP before they could happen at all, which
 * put a phone call between a member of staff and a guest at the desk. The gate
 * moved to after the fact: the action goes through, the owner is notified as it
 * happens, and this is where they can go through them at leisure.
 */
export default async function ActivityLogPage() {
  const ctx = await requireSuperAdmin();
  if (!ctx) redirect("/auth/admin-login");

  const monthStart = startOfMonth(new Date());

  const [logs, monthCash, monthCancels, monthEdits] = await Promise.all([
    prisma.staffActionLog.findMany({
      where: { hotelId: ctx.hotelId },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.staffActionLog.aggregate({
      where: { hotelId: ctx.hotelId, kind: "CASH_COLLECTION", createdAt: { gte: monthStart } },
      _sum: { amount: true }, _count: true,
    }),
    prisma.staffActionLog.count({
      where: { hotelId: ctx.hotelId, kind: { in: ["CANCEL_BOOKING", "DELETE_BOOKING"] }, createdAt: { gte: monthStart } },
    }),
    prisma.staffActionLog.count({
      where: { hotelId: ctx.hotelId, kind: { in: ["PRICE_CHANGE", "DEPOSIT_CHANGE"] }, createdAt: { gte: monthStart } },
    }),
  ]);

  const rows: ActivityRow[] = logs.map(l => ({
    id: l.id,
    kind: l.kind,
    summary: l.summary,
    amount: l.amount,
    refType: l.refType,
    refId: l.refId,
    bookingRef: l.bookingRef,
    guestName: l.guestName,
    reason: l.reason,
    actorName: l.actorName,
    actorRole: l.actorRole,
    notifiedWhatsapp: l.notifiedWhatsapp,
    notifiedEmail: l.notifiedEmail,
    createdAt: l.createdAt.toISOString(),
    undoneAt: l.undoneAt?.toISOString() ?? null,
    undoneByName: l.undoneByName,
  }));

  const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  return (
    <div className="p-5 sm:p-8 max-w-5xl mx-auto">
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
          <ShieldCheck className="w-6 h-6 text-amber-400" /> Activity Log
        </h1>
        <p className="text-white/40 text-sm mt-1.5">
          Price and deposit edits, cash taken from the till, expenses, deleted entries, cancelled
          and deleted bookings — every one, with who did it and why.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-7">
        <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
          <p className="text-white/35 text-xs uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <Banknote className="w-3.5 h-3.5" /> Cash taken this month
          </p>
          <p className="text-2xl font-bold text-red-300">{inr(monthCash._sum.amount ?? 0)}</p>
          <p className="text-white/25 text-[11px] mt-1">
            over {monthCash._count} collection{monthCash._count !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
          <p className="text-white/35 text-xs uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <CalendarX className="w-3.5 h-3.5" /> Bookings removed this month
          </p>
          <p className="text-2xl font-bold text-white">{monthCancels}</p>
          <p className="text-white/25 text-[11px] mt-1">cancelled or deleted</p>
        </div>
        <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
          <p className="text-white/35 text-xs uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <Pencil className="w-3.5 h-3.5" /> Price / deposit edits
          </p>
          <p className="text-2xl font-bold text-amber-300">{monthEdits}</p>
          <p className="text-white/25 text-[11px] mt-1">this month</p>
        </div>
      </div>

      <ActivityLogClient rows={rows} />
    </div>
  );
}
