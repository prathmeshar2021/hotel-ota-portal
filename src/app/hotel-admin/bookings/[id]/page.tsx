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
  BedDouble,
} from "lucide-react";
import { format } from "date-fns";
import { fmtIST } from "@/lib/utils/datetime";
import BookingStatusButton, { NoShowButton } from "@/components/hotel-admin/BookingStatusButton";
import CounterCheckinButton from "@/components/hotel-admin/CounterCheckinButton";
import CompleteCheckinButton from "@/components/hotel-admin/CompleteCheckinButton";
import RefundStatus from "@/components/hotel-admin/RefundStatus";
import GstInvoiceButton from "@/components/hotel-admin/GstInvoiceButton";
import ConsentFormButton from "@/components/hotel-admin/ConsentFormButton";
import CollectPaymentModal from "@/components/hotel-admin/CollectPaymentModal";
import AddChargeModal from "@/components/hotel-admin/AddChargeModal";
import DeleteChargeButton from "@/components/hotel-admin/DeleteChargeButton";
import AdminCancelBookingButton from "@/components/hotel-admin/CancelBookingButton";
import DeleteBookingButton from "@/components/hotel-admin/DeleteBookingButton";
import EditPricingButton from "@/components/hotel-admin/EditPricingButton";
import BookingAccountPanel from "@/components/hotel-admin/BookingAccountPanel";
import AssignRoomButton from "@/components/hotel-admin/AssignRoomButton";
import GuestCountEditor from "@/components/hotel-admin/GuestCountEditor";
import AddCompanionButton from "@/components/hotel-admin/AddCompanionButton";
import IdPhotos from "@/components/hotel-admin/IdPhotos";
import { isLateEntry, daysLate } from "@/lib/utils/late-entry";
import { getCategoryMeta, CATEGORY_ROOMS } from "@/lib/utils/room-categories";
import { isOtaPrepaid, otaSourceLabel } from "@/lib/ota/sources";

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  PENDING_PAYMENT: { label: "Pending Payment", cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25" },
  CONFIRMED: { label: "Confirmed", cls: "bg-blue-500/15 text-blue-400 border-blue-500/25" },
  CHECKED_IN: { label: "Checked In", cls: "bg-green-500/15 text-green-400 border-green-500/25" },
  CHECKED_OUT: { label: "Checked Out", cls: "bg-white/8 text-white/40 border-white/10" },
  CANCELLED: { label: "Cancelled", cls: "bg-red-500/15 text-red-400 border-red-500/25" },
  NO_SHOW: { label: "No Show", cls: "bg-orange-500/15 text-orange-400 border-orange-500/25" },
};

// OTA channels get a highlighted source tag; direct sources stay untagged.
const SOURCE_CONFIG: Record<string, { label: string; cls: string }> = {
  MMT: { label: "MakeMyTrip", cls: "bg-red-500/15 text-red-300 border-red-500/30" },
  GOIBIBO: { label: "Goibibo", cls: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  BOOKING_COM: { label: "Booking.com", cls: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" },
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
      companions: { include: { guest: { select: { phone: true, email: true } } } },
      payment: true,
      charges: { orderBy: { id: "asc" } },
      gstInvoice: { select: { invoiceNumber: true } },
      consent: { select: { consentToken: true, primaryAcceptedAt: true, verifiedByName: true } },
    },
  });

  if (!booking) notFound();

  const categoryMeta = getCategoryMeta(booking.roomCategory as never);
  const accent = categoryMeta?.accentColor ?? "#F59E0B";

  // The rate actually applied, derived from what was charged rather than the
  // slab table — an edited price can land in a different band from the tariff.
  const gstRate = booking.taxableAmount > 0
    ? Math.round((booking.cgst / booking.taxableAmount) * 1000) / 10
    : 0;
  // True once the price charged differs from the room's standard tariff.
  const priceEdited =
    booking.originalTotal != null &&
    Math.abs(booking.originalTotal - booking.totalAmount) > 0.5;
  const categoryLabel = categoryMeta?.displayName ?? booking.roomCategory;
  const categoryRooms = CATEGORY_ROOMS[booking.roomCategory as never] ?? [];
  const status = STATUS_CONFIG[booking.status] ?? { label: booking.status, cls: "bg-white/8 text-white/40 border-white/10" };
  const isOta = isOtaPrepaid(booking.source);
  // Hoisted once per request so the JSX doesn't call an impure clock during render.
  const nowMs = new Date().getTime();

  // People the booking is for, minus the primary guest and everyone already
  // registered — what raising the guest count leaves outstanding. Only actionable
  // while the stay is open.
  const stayOpen = booking.status !== "CANCELLED" && booking.status !== "CHECKED_OUT";
  const unregisteredGuests = stayOpen
    ? Math.max(0, booking.noOfPersons - (booking.companions.length + 1))
    : 0;

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
            {SOURCE_CONFIG[booking.source] && (
              <span className={`text-xs font-bold px-3 py-1 rounded-full border ${SOURCE_CONFIG[booking.source].cls}`}>
                {SOURCE_CONFIG[booking.source].label}
              </span>
            )}
            {isLateEntry(booking.createdAt, booking.checkInDate, booking.source) && (
              <span
                className="text-xs font-bold px-3 py-1 rounded-full border bg-purple-500/15 text-purple-300 border-purple-500/30"
                title={`Recorded ${daysLate(booking.createdAt, booking.checkInDate)} day(s) after the stay began`}
              >
                Added late
              </span>
            )}
            {booking.instantBooking && (
              <span className="text-xs font-bold px-3 py-1 rounded-full border bg-blue-500/15 text-blue-300 border-blue-500/30">
                Instantly Booked
              </span>
            )}
            <span className={`text-xs font-bold px-3 py-1 rounded-full border ${status.cls}`}>
              {status.label}
            </span>
          </div>
          <p className="text-white/35 text-sm font-mono">{booking.bookingRef}</p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Removing a booking entirely — available in any state, since the
              usual reasons (a test entry, a duplicate, wrong dates) are just as
              likely to be spotted after check-in as before. */}
          {booking.status !== "CANCELLED" && (
            <EditPricingButton
              bookingId={booking.id}
              bookingRef={booking.bookingRef}
              noOfNights={booking.noOfNights}
              currentTotal={booking.totalAmount}
              currentDeposit={booking.refundableDeposit}
              depositCollected={booking.depositCollected}
              amountPaid={booking.cashPaid + booking.onlinePaid}
              status={booking.status}
            />
          )}
          <DeleteBookingButton
            bookingId={booking.id}
            bookingRef={booking.bookingRef}
            guestName={booking.primaryGuest.name}
            amountPaid={booking.cashPaid + booking.onlinePaid}
          />
          {booking.status === "CONFIRMED" && (
            <>
              <AdminCancelBookingButton
                bookingId={booking.id}
                bookingRef={booking.bookingRef}
                checkInDate={booking.checkInDate}
                totalAmount={booking.totalAmount}
                depositAmount={booking.refundableDeposit}
              />
              {/* No-show only makes sense once the stay has started — hide it for
                  future reservations so a booking can't be wrongly no-showed. */}
              {new Date(booking.checkInDate).setHours(0, 0, 0, 0) <= nowMs && (
                <NoShowButton bookingId={booking.id} />
              )}
              {/* Counter check-in opens the full form modal. Always pre-fill from
                  whatever we already hold: the primary guest's stored ID (captured
                  at booking / a previous stay) and any companions added at booking,
                  plus online-check-in travel details when the guest completed it. */}
              <CounterCheckinButton
                bookingId={booking.id}
                bookingRef={booking.bookingRef}
                guestName={booking.primaryGuest.name}
                guestPhone={booking.primaryGuest.phone ?? booking.guestPhone}
                noOfPersons={booking.noOfPersons}
                existingData={{
                  idType: booking.primaryGuest.idType,
                  idNumber: booking.primaryGuest.idNumber,
                  idFrontUrl: booking.primaryGuest.idFrontUrl,
                  idBackUrl: booking.primaryGuest.idBackUrl,
                  comingFrom: booking.onlineCheckin?.comingFrom,
                  goingTo: booking.onlineCheckin?.goingTo,
                  purpose: booking.onlineCheckin?.purpose,
                  vehicleNo: booking.onlineCheckin?.vehicleNo,
                  depositLinkUrl: booking.depositLinkUrl,
                  depositCollected: booking.depositCollected,
                  companions: booking.companions.map(c => ({
                    name: c.name,
                    relation: c.relation,
                    phone: c.guest?.phone ?? null,
                    email: c.guest?.email ?? null,
                    idType: c.idType as string | null,
                    idNumber: c.idNumber,
                    idFrontUrl: c.idFrontUrl,
                    idBackUrl: c.idBackUrl,
                  })),
                }}
              />
              {/* Final gated step — appears once registration is captured. The
                  server blocks it until a room is assigned AND consent confirmed. */}
              {booking.onlineCheckinDone && (
                <CompleteCheckinButton bookingId={booking.id} />
              )}
            </>
          )}
          {/* For post-CONFIRMED statuses (CHECKED_IN → CHECKED_OUT, etc.) */}
          {booking.status !== "CONFIRMED" && (
            <BookingStatusButton
              bookingId={booking.id}
              currentStatus={booking.status}
              depositCollected={booking.depositCollected}
              additionalCharges={booking.additionalCharges}
              balanceDue={booking.balanceDue}
              totalAmount={booking.totalAmount}
              // Only when the DEPOSIT itself was paid online. Refunding a cash
              // deposit against the room payment would push money to a card it
              // never came from and eat into that payment's refundable balance.
              canRefundToSource={!!booking.depositPaymentId}
            />
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
              <InfoRow label="Phone" value={(booking.primaryGuest.phone ?? booking.guestPhone) ? `+91 ${booking.primaryGuest.phone ?? booking.guestPhone}` : undefined} icon={<Phone className="w-3.5 h-3.5" />} />
              <InfoRow label="Email" value={booking.primaryGuest.email} icon={<Mail className="w-3.5 h-3.5" />} />
              {booking.primaryGuest.idType && (
                <InfoRow
                  label={ID_LABELS[booking.primaryGuest.idType] ?? "ID"}
                  value={booking.primaryGuest.idNumber ?? "—"}
                  icon={<CreditCard className="w-3.5 h-3.5" />}
                />
              )}
            </div>

            {/* ID images — click to read the whole document */}
            <IdPhotos
              frontUrl={booking.primaryGuest.idFrontUrl}
              backUrl={booking.primaryGuest.idBackUrl}
              who={booking.primaryGuest.name}
            />
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

          {/* Companions. Also shown when nobody is registered yet but the
              booking is for more than one — raising the guest count on a
              checked-in stay is exactly that case. */}
          {(booking.companions.length > 0 || unregisteredGuests > 0) && (
            <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
              <h2 className="font-semibold text-white text-sm mb-4 flex items-center gap-2">
                <Users className="w-4 h-4 text-white/30" />
                Companions ({booking.companions.length})
              </h2>
              {unregisteredGuests > 0 && (
                <div className="mb-4">
                  <AddCompanionButton bookingId={booking.id} pending={unregisteredGuests} />
                </div>
              )}
              <div className="space-y-3">
                {booking.companions.map((c) => (
                  <div key={c.id} className="bg-white/3 rounded-xl p-3">
                    <p className="text-white/70 text-sm font-medium">{c.name}</p>
                    <p className="text-white/35 text-xs mt-0.5">
                      {c.relation && `${c.relation} · `}
                      {c.idType && `${ID_LABELS[c.idType as string] ?? c.idType}: ${c.idNumber ?? "—"}`}
                    </p>
                    {(c.guest?.phone || c.guest?.email) && (
                      <p className="text-white/25 text-[11px] mt-0.5">
                        {[c.guest?.phone ? `+91 ${c.guest.phone}` : null, c.guest?.email].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {/* Companion ID was captured at check-in but never shown here */}
                    <IdPhotos
                      frontUrl={c.idFrontUrl}
                      backUrl={c.idBackUrl}
                      who={c.name}
                      compact
                    />
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
                            {" · "}
                            {/* Whether this one still has to come off the deposit */}
                            {charge.paidNow ? (
                              <span className="text-green-400/70">
                                paid {charge.mode === "ONLINE" ? "UPI" : "cash"}
                              </span>
                            ) : (
                              <span className="text-amber-400/70">from deposit</span>
                            )}
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

          {/* Account — the full money trail. Sits at the foot of this column so
              the consent form stays near the top of the right-hand one, where
              staff reach for it during check-in. */}
          <BookingAccountPanel
            bookingId={booking.id}
            depositExpected={booking.refundableDeposit}
          />
        </div>

        {/* Right: Booking summary */}
        <div className="lg:col-span-2 space-y-4">

          {/* Room + dates */}
          <div
            className="rounded-2xl p-5 border"
            style={{ background: `${accent}08`, borderColor: `${accent}20` }}
          >
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold text-black shrink-0"
                  style={{ background: accent }}
                >
                  {booking.room ? `#${booking.room.roomNumber}` : <BedDouble className="w-4 h-4" />}
                </div>
                <div>
                  <p className="text-white font-semibold">{categoryLabel}</p>
                  {booking.room ? (
                    <p className="text-white/40 text-xs">Room {booking.room.roomNumber}</p>
                  ) : (
                    <p className="text-amber-400/70 text-xs italic">No room assigned yet</p>
                  )}
                </div>
              </div>
              {/* Assign / Change room button */}
              {(booking.status === "CONFIRMED" || booking.status === "CHECKED_IN") && (
                <AssignRoomButton
                  bookingId={booking.id}
                  hotelId={session.user.hotelId!}
                  roomCategory={booking.roomCategory}
                  categoryLabel={categoryLabel}
                  categoryRooms={categoryRooms}
                  currentRoomId={booking.roomId ?? null}
                  currentRoomNumber={booking.room?.roomNumber ?? null}
                  checkInDate={booking.checkInDate.toISOString()}
                  checkOutDate={booking.checkOutDate.toISOString()}
                  noOfNights={booking.noOfNights}
                  currentTotal={booking.totalAmount}
                />
              )}
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
                <GuestCountEditor
                  bookingId={booking.id}
                  noOfPersons={booking.noOfPersons}
                  editable={booking.status !== "CANCELLED" && booking.status !== "CHECKED_OUT"}
                />
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
                        {fmtIST(booking.checkedInAt, "dd MMM yyyy, hh:mm a")}
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
                        {fmtIST(booking.checkedOutAt, "dd MMM yyyy, hh:mm a")}
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
              {/* The tariff the room is listed at — shown only when the price
                  actually charged differs, so the two are never confused. */}
              {priceEdited && (
                <div className="flex justify-between text-white/30 text-xs">
                  <span>Standard tariff</span>
                  <span className="line-through">₹{(booking.originalTotal ?? booking.roomRent).toLocaleString("en-IN")}</span>
                </div>
              )}
              {booking.couponDiscount > 0 && (
                <div className="flex justify-between text-green-400/80">
                  <span>Coupon Discount</span>
                  <span>-₹{booking.couponDiscount.toLocaleString("en-IN")}</span>
                </div>
              )}
              {booking.staffDiscount > 0 && (
                <div className="flex justify-between text-purple-300/90">
                  <span>
                    Staff Discount
                    {booking.discountedByName && (
                      <span className="text-white/25 text-xs ml-1.5">by {booking.discountedByName}</span>
                    )}
                  </span>
                  <span>-₹{booking.staffDiscount.toLocaleString("en-IN")}</span>
                </div>
              )}
              {/* Taxable + GST, as actually charged. These three add up to the
                  room total; the listed tariff does not once a price is edited. */}
              <div className="flex justify-between text-white/45">
                <span>Taxable value</span>
                <span>₹{booking.taxableAmount.toLocaleString("en-IN")}</span>
              </div>
              {booking.cgst > 0 ? (
                <>
                  <div className="flex justify-between text-white/30 text-xs">
                    <span>CGST @ {gstRate}%</span>
                    <span>₹{booking.cgst.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between text-white/30 text-xs">
                    <span>SGST @ {gstRate}%</span>
                    <span>₹{booking.sgst.toLocaleString("en-IN")}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between text-white/25 text-xs">
                  <span>GST</span>
                  <span>Nil — under ₹1,000 per night</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-white border-t border-white/8 pt-2 mt-2">
                <span>Room Total</span>
                <span style={{ color: accent }}>₹{booking.totalAmount.toLocaleString("en-IN")}</span>
              </div>
              {booking.additionalCharges > 0 && (
                <div className="flex justify-between text-amber-300/80 text-xs">
                  <span>Extra charges (tea, damage…)</span>
                  <span>₹{booking.additionalCharges.toLocaleString("en-IN")}</span>
                </div>
              )}
              {/* Deposit — stated plainly, because staff need to know at a
                  glance how much of the guest's money is being held. */}
              {booking.depositCollected > 0 ? (
                <div className="mt-2 rounded-xl border border-green-500/25 bg-green-500/8 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-green-300 text-xs font-bold">
                      <ShieldCheck className="w-3.5 h-3.5" /> Deposit held
                    </span>
                    <span className="text-green-300 font-bold text-sm">
                      ₹{booking.depositCollected.toLocaleString("en-IN")}
                    </span>
                  </div>
                  <p className="text-green-400/50 text-[10px] mt-1">
                    Taken {booking.depositMode === "ONLINE" ? "online / UPI"
                      : booking.depositMode === "MIXED" ? "part cash, part UPI"
                      : "in cash"}
                    {booking.depositPaymentId ? " · refundable to source" : ""}
                    {booking.status === "CHECKED_OUT" ? " · settled at checkout" : " · returned at checkout, less any charges"}
                  </p>
                </div>
              ) : booking.refundableDeposit > 0 && booking.status !== "CHECKED_OUT" && booking.status !== "CANCELLED" ? (
                <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/3 px-3 py-2">
                  <span className="flex items-center gap-1.5 text-white/45 text-xs">
                    <ShieldCheck className="w-3.5 h-3.5" /> No deposit collected yet
                  </span>
                  <span className="text-white/35 text-[11px]">
                    ₹{booking.refundableDeposit.toLocaleString("en-IN")} expected
                  </span>
                </div>
              ) : null}
              {isOta && (
                <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-red-500/20 bg-red-500/8 px-3 py-2">
                  <span className="flex items-center gap-1.5 text-red-300 text-xs font-semibold">
                    <CheckCircle className="w-3.5 h-3.5" /> Paid to {otaSourceLabel(booking.source)}
                  </span>
                  <span className="text-red-300/60 text-[10px]">No payment collected at hotel</span>
                </div>
              )}
              {!isOta && booking.balanceDue > 0 && (
                <div className="flex justify-between font-semibold text-red-400 text-sm">
                  <span>Balance Due</span>
                  <span>₹{booking.balanceDue.toLocaleString("en-IN")}</span>
                </div>
              )}
              {/* Checkout settlement outcome */}
              {booking.status === "CHECKED_OUT" && (booking.depositCollected > 0 || booking.additionalCharges > 0) && (
                <div className="mt-3 pt-3 border-t border-white/8 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-white/40 text-xs font-semibold mb-2">
                    <ShieldCheck className="w-3.5 h-3.5" /> Checkout Settlement
                  </div>
                  {booking.depositCollected > 0 && (
                    <div className="flex justify-between text-xs text-white/50">
                      <span>Deposit held</span>
                      <span>₹{booking.depositCollected.toLocaleString("en-IN")}</span>
                    </div>
                  )}
                  {booking.additionalCharges > 0 && (
                    <div className="flex justify-between text-xs text-amber-400/70">
                      <span>Extra charges</span>
                      <span>−₹{booking.additionalCharges.toLocaleString("en-IN")}</span>
                    </div>
                  )}
                  {(() => {
                    const refund = Math.max(0, booking.depositCollected - booking.depositDeducted);
                    return refund > 0 ? (
                      <div className="flex justify-between text-xs text-green-400/80 font-semibold pt-0.5 border-t border-white/8">
                        <span>Refunded to guest</span>
                        <span>₹{refund.toLocaleString("en-IN")}</span>
                      </div>
                    ) : null;
                  })()}
                  {booking.depositNotes && (
                    <p className="text-[10px] text-white/30 italic mt-1">{booking.depositNotes}</p>
                  )}
                  {/* A deposit refund pushed to the gateway shows its result
                      here — and, if it failed, the retry / mark-paid actions.
                      Self-hides when there was no gateway refund. */}
                  <RefundStatus
                    bookingId={booking.id}
                    refundStatus={booking.refundStatus}
                    refundAmount={booking.refundAmount}
                    refundId={booking.refundId}
                  />
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
                  {booking.depositCollected > 0 && (
                    <div className="flex justify-between text-xs text-green-400/70">
                      <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Deposit refund</span>
                      <span>₹{booking.depositCollected.toLocaleString("en-IN")}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-semibold text-white/70 pt-1 border-t border-white/8">
                    <span>Total refund to guest</span>
                    <span className="text-green-400">₹{(booking.totalAmount - (booking.cancellationCharge ?? 0)).toLocaleString("en-IN")}</span>
                  </div>
                  {booking.cancelledAt && (
                    <p className="text-[10px] text-white/25 mt-1">
                      Cancelled {fmtIST(booking.cancelledAt, "dd MMM yyyy, hh:mm a")}
                    </p>
                  )}
                  <RefundStatus
                    bookingId={booking.id}
                    refundStatus={booking.refundStatus}
                    refundAmount={booking.refundAmount}
                    refundId={booking.refundId}
                  />
                </div>
              )}
            </div>

            {/* Cash/UPI collection button — only when balance is outstanding (never for OTA-prepaid) */}
            {!isOta && booking.balanceDue > 0 && (
              <CollectPaymentModal
                bookingId={booking.id}
                balanceDue={booking.balanceDue}
                guestName={booking.primaryGuest.name}
                bookingRef={booking.bookingRef}
              />
            )}

            {/* Guest registration & consent form — print for signature or send on WhatsApp.
                Shown once registration data exists (online/counter check-in done). */}
            {(booking.onlineCheckinDone ||
              ["CHECKED_IN", "CHECKED_OUT"].includes(booking.status)) && (
              <div className="mt-3">
                <ConsentFormButton
                  bookingId={booking.id}
                  guestPhone={booking.primaryGuest.phone ?? booking.guestPhone}
                  consentToken={booking.consent?.consentToken ?? null}
                  acceptedAt={booking.consent?.primaryAcceptedAt?.toISOString() ?? null}
                  verifiedByName={booking.consent?.verifiedByName ?? null}
                />
              </div>
            )}

            {/* GST invoice — generate, download, send on WhatsApp */}
            {["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"].includes(booking.status) && (
              <div className="mt-3">
                <GstInvoiceButton
                  bookingId={booking.id}
                  invoiceNumber={booking.gstInvoice?.invoiceNumber ?? null}
                  guestPhone={booking.primaryGuest.phone ?? booking.guestPhone}
                />
              </div>
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
            Created: {fmtIST(booking.createdAt, "dd MMM yyyy, hh:mm a")}
          </div>
        </div>

      </div>
    </div>
  );
}
