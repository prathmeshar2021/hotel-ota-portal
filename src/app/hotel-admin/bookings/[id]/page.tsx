export const dynamic = "force-dynamic";

import { auth } from "@/lib/auth/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import Link from "next/link";
import {
  ArrowLeft,
  User,
  Phone,
  Mail,
  CreditCard,
  MapPin,
  Car,
  Calendar,
  Moon,
  Users,
  Banknote,
  CheckCircle,
  BookOpen,
  MessageSquare,
  Clock,
  LogIn,
  LogOut,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";
import BookingStatusButton, { NoShowButton } from "@/components/hotel-admin/BookingStatusButton";
import CounterCheckinButton from "@/components/hotel-admin/CounterCheckinButton";
import CollectPaymentModal from "@/components/hotel-admin/CollectPaymentModal";
import AddChargeModal from "@/components/hotel-admin/AddChargeModal";
import DeleteChargeButton from "@/components/hotel-admin/DeleteChargeButton";
import AdminCancelBookingButton from "@/components/hotel-admin/CancelBookingButton";

const ROOM_LABELS: Record<string, string> = {
  LUXURY_COTTAGE: "Luxury Cottage",
  AC_ROOM: "AC Room",
  NON_AC_ROOM: "Non-AC Room",
};

const ROOM_ACCENT: Record<string, string> = {
  LUXURY_COTTAGE: "#F59E0B",
  AC_ROOM: "#60A5FA",
  NON_AC_ROOM: "#4ADE80",
};

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  PENDING_PAYMENT: { label: "Pending Payment", cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25" },
  CONFIRMED: { label: "Confirmed", cls: "bg-blue-500/15 text-blue-400 border-blue-500/25" },
  CHECKED_IN: { label: "Checked In", cls: "bg-green-500/15 text-green-400 border-green-500/25" },
  CHECKED_OUT: { label: "Checked Out", cls: "bg-white/8 text-white/40 border-white/10" },
  CANCELLED: { label: "Cancelled", cls: "bg-red-500/15 text-red-400 border-red-500/25" },
  NO_SHOW: { label: "No Show", cls: "bg-orange-500/15 text-orange-400 border-orange-500/25" },
};

function InfoRow({ label, value, icon }: { label: string; value?: string | null; icon?: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3">
      {icon && <span className="text-white/25 mt-0.5 shrink-0">{icon}</span>}
      <div>
        <p className="text-xs text-white/30 mb-0.5">{label}</p>
        <p className="text-white/75 text-sm">{value}</p>
      </div>
    </div>
  );
}

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.hotelId) redirect("/auth/staff-login");

  const { id } = await params;

  const booking = await prisma.booking.findFirst({
    where: { id, hotelId: session.user.hotelId },
    include: {
      primaryGuest: true,
      room: true,
      onlineCheckin: true,
      companions: true,
      payment: true,
      charges: { orderBy: { id: "asc" } },
    },
  });

  if (!booking) notFound();

  const accent = ROOM_ACCENT[booking.room.roomType] ?? "#F59E0B";
  const status = STATUS_CONFIG[booking.status] ?? { label: booking.status, cls: "bg-white/8 text-white/40 border-white/10" };

  const ID_LABELS: Record<string, string> = {
    AADHAR: "Aadhar Card",
    DRIVING_LICENSE: "Driving License",
    PASSPORT: "Passport",
    VOTER_ID: "Voter ID",
    OTHER: "Other ID",
  };

  return (
    <div className="p-6 max-w-4xl">
      {/* Back + header */}
      <Link
        href="/hotel-admin/bookings"
        className="inline-flex items-center gap-2 text-white/35 hover:text-white/60 text-sm mb-5 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Bookings
      </Link>

      {/* Title row */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1 className="text-xl font-bold text-white">{booking.primaryGuest.name}</h1>
            <span className={`text-xs font-bold px-3 py-1 rounded-full border ${status.cls}`}>
              {status.label}
            </span>
          </div>
          <p className="text-white/35 text-sm font-mono">{booking.bookingRef}</p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {booking.status === "CONFIRMED" && (
            <>
              <AdminCancelBookingButton
                bookingId={booking.id}
                bookingRef={booking.bookingRef}
                checkInDate={booking.checkInDate}
                totalAmount={booking.totalAmount}
                depositAmount={booking.refundableDeposit}
              />
              <NoShowButton bookingId={booking.id} />
              {/* Counter check-in opens the full form modal — pre-fills from web check-in if done */}
              <CounterCheckinButton
                bookingId={booking.id}
                bookingRef={booking.bookingRef}
                guestName={booking.primaryGuest.name}
                noOfPersons={booking.noOfPersons}
                existingData={booking.onlineCheckin ? {
                  idType: booking.primaryGuest.idType,
                  idNumber: booking.primaryGuest.idNumber,
                  idFrontUrl: booking.primaryGuest.idFrontUrl,
                  idBackUrl: booking.primaryGuest.idBackUrl,
                  comingFrom: booking.onlineCheckin.comingFrom,
                  goingTo: booking.onlineCheckin.goingTo,
                  purpose: booking.onlineCheckin.purpose,
                  vehicleNo: booking.onlineCheckin.vehicleNo,
                  companions: booking.companions.map(c => ({
                    name: c.name,
                    relation: c.relation,
                    idType: c.idType as string | null,
                    idNumber: c.idNumber,
                    idFrontUrl: c.idFrontUrl,
                    idBackUrl: c.idBackUrl,
                  })),
                } : undefined}
              />
            </>
          )}
          {/* For post-CONFIRMED statuses (CHECKED_IN → CHECKED_OUT, etc.) */}
          {booking.status !== "CONFIRMED" && (
            <BookingStatusButton bookingId={booking.id} currentStatus={booking.status} />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* Left: Guest + Online Check-in */}
        <div className="lg:col-span-3 space-y-5">

          {/* Guest details */}
          <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
            <h2 className="font-semibold text-white text-sm mb-4 flex items-center gap-2">
              <User className="w-4 h-4 text-white/30" /> Guest Details
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoRow label="Full Name" value={booking.primaryGuest.name} icon={<User className="w-3.5 h-3.5" />} />
              <InfoRow label="Phone" value={`+91 ${booking.primaryGuest.phone}`} icon={<Phone className="w-3.5 h-3.5" />} />
              <InfoRow label="Email" value={booking.primaryGuest.email} icon={<Mail className="w-3.5 h-3.5" />} />
              {booking.primaryGuest.idType && (
                <InfoRow
                  label={ID_LABELS[booking.primaryGuest.idType] ?? "ID"}
                  value={booking.primaryGuest.idNumber ?? "—"}
                  icon={<CreditCard className="w-3.5 h-3.5" />}
                />
              )}
            </div>

            {/* ID images */}
            {(booking.primaryGuest.idFrontUrl || booking.primaryGuest.idBackUrl) && (
              <div className="flex gap-3 mt-4">
                {booking.primaryGuest.idFrontUrl && (
                  <a
                    href={booking.primaryGuest.idFrontUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative flex-1 max-w-[140px] h-24 rounded-xl overflow-hidden border border-white/10 hover:border-white/25 transition-colors"
                  >
                    <img src={booking.primaryGuest.idFrontUrl} alt="ID Front" className="w-full h-full object-cover" />
                    <div className="absolute bottom-0 inset-x-0 bg-black/60 text-[10px] text-white/70 text-center py-1">Front</div>
                  </a>
                )}
                {booking.primaryGuest.idBackUrl && (
                  <a
                    href={booking.primaryGuest.idBackUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative flex-1 max-w-[140px] h-24 rounded-xl overflow-hidden border border-white/10 hover:border-white/25 transition-colors"
                  >
                    <img src={booking.primaryGuest.idBackUrl} alt="ID Back" className="w-full h-full object-cover" />
                    <div className="absolute bottom-0 inset-x-0 bg-black/60 text-[10px] text-white/70 text-center py-1">Back</div>
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Online Check-in info */}
          {booking.onlineCheckin ? (
            <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
              <h2 className="font-semibold text-white text-sm mb-4 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                Online Check-in Details
                {booking.onlineCheckin.completedAt && (
                  <span className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full ml-auto">
                    Completed
                  </span>
                )}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoRow label="Coming From" value={booking.onlineCheckin.comingFrom} icon={<MapPin className="w-3.5 h-3.5" />} />
                <InfoRow label="Going To" value={booking.onlineCheckin.goingTo} icon={<MapPin className="w-3.5 h-3.5" />} />
                <InfoRow label="Purpose of Visit" value={booking.onlineCheckin.purpose} icon={<BookOpen className="w-3.5 h-3.5" />} />
                <InfoRow label="Vehicle Number" value={booking.onlineCheckin.vehicleNo} icon={<Car className="w-3.5 h-3.5" />} />
                <InfoRow label="Expected Arrival Time" value={booking.onlineCheckin.expectedCheckInTime} icon={<Clock className="w-3.5 h-3.5" />} />
                <InfoRow label="Expected Departure Time" value={booking.onlineCheckin.expectedCheckOutTime} icon={<Clock className="w-3.5 h-3.5" />} />
              </div>
            </div>
          ) : (
            <div className="bg-white/2 border border-white/6 rounded-2xl p-5">
              <p className="text-white/30 text-sm flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-white/15" />
                Guest has not completed online check-in yet
              </p>
            </div>
          )}

          {/* Companions */}
          {booking.companions.length > 0 && (
            <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
              <h2 className="font-semibold text-white text-sm mb-4 flex items-center gap-2">
                <Users className="w-4 h-4 text-white/30" />
                Companions ({booking.companions.length})
              </h2>
              <div className="space-y-3">
                {booking.companions.map((c, i) => (
                  <div key={c.id} className="bg-white/3 rounded-xl p-3">
                    <p className="text-white/70 text-sm font-medium">{c.name}</p>
                    <p className="text-white/35 text-xs mt-0.5">
                      {c.relation && `${c.relation} · `}
                      {c.idType && `${ID_LABELS[c.idType as string] ?? c.idType}: ${c.idNumber ?? "—"}`}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Special requests */}
          {booking.specialRequests && (
            <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
              <h2 className="font-semibold text-white text-sm mb-3 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-white/30" /> Special Requests
              </h2>
              <p className="text-white/55 text-sm leading-relaxed">{booking.specialRequests}</p>
            </div>
          )}

          {/* ── Additional Charges ── */}
          <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
              <div className="flex items-center gap-2">
                <Banknote className="w-4 h-4 text-amber-400" />
                <h2 className="font-semibold text-white text-sm">Additional Charges</h2>
                {booking.charges.length > 0 && (
                  <span className="bg-amber-500/15 text-amber-400 border border-amber-500/25 text-xs font-bold px-2 py-0.5 rounded-full">
                    {booking.charges.length}
                  </span>
                )}
              </div>
              <AddChargeModal
                bookingId={booking.id}
                disabled={booking.status === "CHECKED_OUT" || booking.status === "CANCELLED"}
              />
            </div>

            {booking.charges.length === 0 ? (
              <div className="py-8 text-center text-white/20 text-sm">
                No additional charges
              </div>
            ) : (
              <>
                <div className="divide-y divide-white/5">
                  {booking.charges.map(charge => {
                    const typeLabel = charge.chargeTypes[0]
                      ?.replace(/_/g, " ")
                      .replace(/\b\w/g, l => l.toUpperCase()) ?? "Charge";
                    const displayLabel = charge.description
                      ? `${typeLabel} — ${charge.description}`
                      : typeLabel;
                    return (
                      <div key={charge.id} className="flex items-center justify-between px-5 py-3 gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-white/70 text-sm font-medium truncate">{displayLabel}</p>
                          <p className="text-white/30 text-xs mt-0.5">
                            {charge.quantity} × ₹{charge.unitPrice.toLocaleString("en-IN")}
                          </p>
                        </div>
                        <p className="text-amber-300 font-semibold text-sm shrink-0">
                          ₹{charge.amount.toLocaleString("en-IN")}
                        </p>
                        {booking.status !== "CHECKED_OUT" && booking.status !== "CANCELLED" && (
                          <DeleteChargeButton
                            bookingId={booking.id}
                            chargeId={charge.id}
                            chargeLabel={displayLabel}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* Running total */}
                <div className="px-5 py-3 border-t border-white/8 flex items-center justify-between bg-white/2">
                  <p className="text-white/40 text-xs font-semibold uppercase tracking-wider">Charges Total</p>
                  <p className="text-amber-400 font-bold text-sm">
                    ₹{booking.charges.reduce((s, c) => s + c.amount, 0).toLocaleString("en-IN")}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right: Booking summary */}
        <div className="lg:col-span-2 space-y-4">

          {/* Room + dates */}
          <div
            className="rounded-2xl p-5 border"
            style={{ background: `${accent}08`, borderColor: `${accent}20` }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold text-black"
                style={{ background: accent }}
              >
                #{booking.room.roomNumber}
              </div>
              <div>
                <p className="text-white font-semibold">{ROOM_LABELS[booking.room.roomType]}</p>
                <p className="text-white/40 text-xs">Room {booking.room.roomNumber}</p>
              </div>
            </div>

            <div className="space-y-2.5 text-sm">
              <div className="flex items-center gap-2.5 text-white/55">
                <Calendar className="w-3.5 h-3.5" style={{ color: accent }} />
                <span>{format(booking.checkInDate, "dd MMM yyyy")} → {format(booking.checkOutDate, "dd MMM yyyy")}</span>
              </div>
              <div className="flex items-center gap-2.5 text-white/55">
                <Moon className="w-3.5 h-3.5" style={{ color: accent }} />
                <span>{booking.noOfNights} night{booking.noOfNights > 1 ? "s" : ""}</span>
              </div>
              <div className="flex items-center gap-2.5 text-white/55">
                <Users className="w-3.5 h-3.5" style={{ color: accent }} />
                <span>{booking.noOfPersons} guest{booking.noOfPersons > 1 ? "s" : ""}</span>
              </div>
            </div>

            {/* Actual check-in/out timestamps */}
            {(booking.checkedInAt || booking.checkedOutAt) && (
              <div className="mt-4 pt-3 border-t border-white/8 space-y-2">
                {booking.checkedInAt && (
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                      <LogIn className="w-3 h-3 text-green-400" />
                    </div>
                    <div>
                      <p className="text-[10px] text-white/30 uppercase tracking-wider">Actual Check-in</p>
                      <p className="text-green-400 text-xs font-semibold">
                        {format(booking.checkedInAt, "dd MMM yyyy, hh:mm a")}
                      </p>
                    </div>
                  </div>
                )}
                {booking.checkedOutAt && (
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                      <LogOut className="w-3 h-3 text-amber-400" />
                    </div>
                    <div>
                      <p className="text-[10px] text-white/30 uppercase tracking-wider">Actual Check-out</p>
                      <p className="text-amber-400 text-xs font-semibold">
                        {format(booking.checkedOutAt, "dd MMM yyyy, hh:mm a")}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Payment */}
          <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
            <h2 className="font-semibold text-white text-sm mb-4 flex items-center gap-2">
              <Banknote className="w-4 h-4 text-white/30" /> Payment
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-white/45">
                <span>Room Rent</span>
                <span>₹{booking.roomRent.toLocaleString("en-IN")}</span>
              </div>
              {booking.couponDiscount > 0 && (
                <div className="flex justify-between text-green-400/80">
                  <span>Coupon Discount</span>
                  <span>-₹{booking.couponDiscount.toLocaleString("en-IN")}</span>
                </div>
              )}
              {booking.cgst > 0 && (
                <>
                  <div className="flex justify-between text-white/30 text-xs">
                    <span>CGST</span>
                    <span>₹{booking.cgst.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between text-white/30 text-xs">
                    <span>SGST</span>
                    <span>₹{booking.sgst.toLocaleString("en-IN")}</span>
                  </div>
                </>
              )}
              {booking.refundableDeposit > 0 && (
                <div className="flex justify-between text-green-400/70 text-xs">
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> Refundable deposit
                  </span>
                  <span>₹{booking.refundableDeposit.toLocaleString("en-IN")}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-white border-t border-white/8 pt-2 mt-2">
                <span>Total Amount</span>
                <span style={{ color: accent }}>₹{booking.totalAmount.toLocaleString("en-IN")}</span>
              </div>
              {booking.balanceDue > 0 && (
                <div className="flex justify-between font-semibold text-red-400 text-sm">
                  <span>Balance Due</span>
                  <span>₹{booking.balanceDue.toLocaleString("en-IN")}</span>
                </div>
              )}
              {/* Cancellation details */}
              {booking.status === "CANCELLED" && booking.cancellationCharge !== null && (
                <div className="mt-3 pt-3 border-t border-red-500/15 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-red-400 text-xs font-semibold mb-2">
                    <XCircle className="w-3.5 h-3.5" /> Cancellation Details
                  </div>
                  <div className="flex justify-between text-xs text-red-400/70">
                    <span>Cancellation charge</span>
                    <span>₹{(booking.cancellationCharge ?? 0).toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between text-xs text-green-400/70">
                    <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Deposit refund</span>
                    <span>₹{booking.refundableDeposit.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold text-white/70 pt-1 border-t border-white/8">
                    <span>Total refund to guest</span>
                    <span className="text-green-400">₹{(booking.totalAmount - (booking.cancellationCharge ?? 0)).toLocaleString("en-IN")}</span>
                  </div>
                  {booking.cancelledAt && (
                    <p className="text-[10px] text-white/25 mt-1">
                      Cancelled {format(booking.cancelledAt, "dd MMM yyyy, hh:mm a")}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Cash/UPI collection button — only when balance is outstanding */}
            {booking.balanceDue > 0 && (
              <CollectPaymentModal
                bookingId={booking.id}
                balanceDue={booking.balanceDue}
                guestName={booking.primaryGuest.name}
                bookingRef={booking.bookingRef}
              />
            )}

            {/* Payment record details — moved outside the space-y div */}
            {booking.payment && (
              <div className="mt-3 pt-3 border-t border-white/8">
                <p className="text-xs text-white/30">
                  Payment via{" "}
                  <span className="text-white/50 font-medium">{booking.payment.mode}</span>
                </p>
                {booking.payment.razorpayPaymentId && (
                  <p className="text-xs text-white/25 font-mono mt-0.5 truncate">
                    {booking.payment.razorpayPaymentId}
                  </p>
                )}
                {booking.payment.notes && (
                  <p className="text-xs text-white/30 mt-1 whitespace-pre-line leading-relaxed">
                    {booking.payment.notes}
                  </p>
                )}
              </div>
            )}

          </div>

          {/* Source */}
          <div className="bg-white/2 border border-white/6 rounded-xl px-4 py-3 text-xs text-white/30">
            Booking source: <span className="text-white/50 font-medium">{booking.source}</span>
            <br />
            Created: {format(booking.createdAt, "dd MMM yyyy, hh:mm a")}
          </div>
        </div>

      </div>
    </div>
  );
}
