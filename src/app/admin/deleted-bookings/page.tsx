import { redirect } from "next/navigation";
import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/superAdmin";
import { prismaBase } from "@/lib/db/prisma";
import { Trash2, IndianRupee, AlertTriangle, ExternalLink, Inbox } from "lucide-react";
import { format } from "date-fns";
import { getCategoryMeta } from "@/lib/utils/room-categories";
import RestoreBookingButton from "@/components/admin/RestoreBookingButton";

export const dynamic = "force-dynamic";

/**
 * Every booking staff have deleted, and the way back.
 *
 * Deleting archives rather than erases, so this is the one place those rows are
 * still visible — deliberately through prismaBase, since the ordinary client
 * hides archived bookings from every read.
 *
 * Money is the column that matters. A deleted booking that had been paid for has
 * quietly left the revenue figures, so anything with an amount against it is
 * either a refund waiting to happen or a mistake worth undoing.
 */
export default async function DeletedBookingsPage() {
  const ctx = await requireSuperAdmin();
  if (!ctx) redirect("/auth/admin-login");

  const bookings = await prismaBase.booking.findMany({
    where: { hotelId: ctx.hotelId, deletedAt: { not: null } },
    select: {
      id: true, bookingRef: true, status: true, source: true,
      checkInDate: true, checkOutDate: true, roomCategory: true,
      totalAmount: true, cashPaid: true, onlinePaid: true,
      deletedAt: true, deletedByName: true, deleteReason: true,
      primaryGuest: { select: { name: true, phone: true } },
      room: { select: { roomNumber: true } },
      gstInvoice: { select: { invoiceNumber: true } },
    },
    orderBy: { deletedAt: "desc" },
    take: 200,
  });

  const paidOf = (b: (typeof bookings)[number]) => +(b.cashPaid + b.onlinePaid).toFixed(2);
  const withMoney = bookings.filter(b => paidOf(b) > 0);
  const moneyTotal = withMoney.reduce((s, b) => s + paidOf(b), 0);
  const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  return (
    <div className="p-5 sm:p-8 max-w-6xl mx-auto">
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
          <Trash2 className="w-6 h-6 text-red-400" /> Deleted Bookings
        </h1>
        <p className="text-white/40 text-sm mt-1.5">
          Bookings staff removed from the panel. Nothing is erased — restore any of them here.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-7">
        <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
          <p className="text-white/35 text-xs uppercase tracking-wider mb-1.5">Deleted</p>
          <p className="text-2xl font-bold text-white">{bookings.length}</p>
        </div>
        <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
          <p className="text-white/35 text-xs uppercase tracking-wider mb-1.5">Had money on them</p>
          <p className="text-2xl font-bold text-red-300">{withMoney.length}</p>
        </div>
        <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
          <p className="text-white/35 text-xs uppercase tracking-wider mb-1.5">Taken out of revenue</p>
          <p className="text-2xl font-bold text-red-300">{inr(moneyTotal)}</p>
        </div>
      </div>

      {withMoney.length > 0 && (
        <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/25 rounded-2xl px-4 py-3 mb-7">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-amber-200/85 text-xs leading-relaxed">
            {withMoney.length} deleted booking{withMoney.length !== 1 ? "s" : ""} had payments
            totalling <strong>{inr(moneyTotal)}</strong>. That money is no longer in your revenue
            figures. Deleting never issues a refund — check whether the guests are owed it back,
            or restore the booking if it was removed by mistake.
          </p>
        </div>
      )}

      {bookings.length === 0 ? (
        <div className="bg-white/3 border border-white/8 rounded-2xl p-10 text-center">
          <Inbox className="w-8 h-8 text-white/15 mx-auto mb-3" />
          <p className="text-white/40 text-sm">Nothing has been deleted.</p>
        </div>
      ) : (
        <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="text-left text-white/35 text-xs uppercase tracking-wider border-b border-white/8">
                  <th className="px-4 py-3 font-semibold">Booking</th>
                  <th className="px-4 py-3 font-semibold">Guest</th>
                  <th className="px-4 py-3 font-semibold">Stay</th>
                  <th className="px-4 py-3 font-semibold text-right">Paid</th>
                  <th className="px-4 py-3 font-semibold">Deleted by</th>
                  <th className="px-4 py-3 font-semibold">Reason</th>
                  <th className="px-4 py-3 font-semibold text-right">Restore</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map(b => {
                  const paid = paidOf(b);
                  const cat = getCategoryMeta(b.roomCategory).displayName;
                  return (
                    <tr key={b.id} className="border-b border-white/5 last:border-0 hover:bg-white/3">
                      <td className="px-4 py-3">
                        <span className="text-white/80 font-semibold font-mono text-xs">{b.bookingRef}</span>
                        <p className="text-white/25 text-[11px] mt-0.5">
                          {b.room ? `${cat} #${b.room.roomNumber}` : cat} · was {b.status.replace(/_/g, " ").toLowerCase()}
                        </p>
                        {b.gstInvoice && (
                          <p className="text-amber-400/60 text-[11px] mt-0.5 inline-flex items-center gap-1">
                            <IndianRupee className="w-2.5 h-2.5" /> Invoice {b.gstInvoice.invoiceNumber} retained
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-white/70">
                        {b.primaryGuest.name}
                        {b.primaryGuest.phone && (
                          <p className="text-white/25 text-[11px] mt-0.5">{b.primaryGuest.phone}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-white/50 text-xs">
                        {format(b.checkInDate, "dd MMM")} → {format(b.checkOutDate, "dd MMM yyyy")}
                      </td>
                      <td className={`px-4 py-3 text-right font-bold ${paid > 0 ? "text-red-300" : "text-white/25"}`}>
                        {paid > 0 ? inr(paid) : "—"}
                        {paid > 0 && (
                          <p className="text-white/25 text-[11px] font-normal mt-0.5">
                            of {inr(b.totalAmount)}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-white/70 text-xs">
                        {b.deletedByName ?? "—"}
                        <p className="text-white/25 text-[11px] mt-0.5">
                          {b.deletedAt ? format(b.deletedAt, "dd MMM yyyy, h:mm a") : ""}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-white/40 text-xs max-w-[180px]">
                        {b.deleteReason || <span className="text-white/15">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <RestoreBookingButton
                            bookingId={b.id}
                            bookingRef={b.bookingRef}
                            amountPaid={paid}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-white/25 text-xs mt-5 leading-relaxed">
        Showing the 200 most recently deleted. A restored booking reappears in the bookings list,
        holds its room again, and its payments return to the accounts.{" "}
        <Link href="/hotel-admin/bookings" className="text-blue-300 hover:text-blue-200 inline-flex items-center gap-1">
          Bookings <ExternalLink className="w-3 h-3" />
        </Link>
      </p>
    </div>
  );
}
