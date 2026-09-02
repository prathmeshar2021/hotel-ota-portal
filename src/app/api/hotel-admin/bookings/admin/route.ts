import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";
import { generateBookingRef, applyCoupon } from "@/lib/utils/booking";
import {
  REFUNDABLE_DEPOSIT, computeTotals, computeTotalsForPrice, computeTotalsWithStaffDiscount,
} from "@/lib/utils/booking-calc";
import { recordTxn, roomPaymentNote } from "@/lib/services/booking-txn";
import { syncDepositTaken } from "@/lib/services/booking-ledger";
import { recordStaffAction } from "@/lib/services/staff-action";
import { gupshup } from "@/lib/services/gupshup";
import { email } from "@/lib/services/email";
import { format } from "date-fns";
import { getCategoryMeta } from "@/lib/utils/room-categories";

const AdminBookingSchema = z.object({
  roomId: z.string(),
  checkInDate: z.string(),
  checkOutDate: z.string(),
  noOfPersons: z.number().min(1).max(10),
  // Guest — either existing guestId or details to create
  guestId: z.string().optional(),
  guestName: z.string().min(2),
  guestPhone: z.string().regex(/^\d{10}$/),
  guestEmail: z.string().email().optional().or(z.literal("")),
  guestIdType: z.string().optional(),
  guestIdNumber: z.string().optional(),
  guestIdFrontUrl: z.string().url().optional().or(z.literal("")),
  guestIdBackUrl: z.string().url().optional().or(z.literal("")),
  // Travel details (optional, for same-day online check-in)
  comingFrom: z.string().optional(),
  goingTo: z.string().optional(),
  purpose: z.string().optional(),
  vehicleNo: z.string().optional(),
  // Payment
  source: z.enum(["WALK_IN", "PHONE", "OTHER"]),
  paymentMode: z.enum(["CASH", "ONLINE", "MIXED"]),
  cashPaid: z.number().min(0).default(0),
  onlinePaid: z.number().min(0).default(0),
  depositCollected: z.number().min(0).default(0),
  depositMode: z.enum(["CASH", "ONLINE"]).optional(),
  couponCode: z.string().optional(),
  specialRequests: z.string().optional(),
  // Counter discount the staff member gives at their own discretion — rupees
  // off the FINAL GST-inclusive price, on top of any coupon. Re-applied
  // server-side so the client can never dictate the tax split.
  staffDiscount: z.number().min(0).max(1_000_000).default(0),
  // The final GST-inclusive price staff typed. Takes precedence over
  // staffDiscount and, unlike it, can be ABOVE the standard tariff.
  customTotal: z.number().min(0).max(1_000_000).optional(),
  discountReason: z.string().max(300).optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.hotelId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "HOTEL_ADMIN" && session.user.role !== "HOTEL_STAFF" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const hotelId = session.user.hotelId;
  const body = await req.json();
  const parsed = AdminBookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const d = parsed.data;
  const checkIn = new Date(d.checkInDate);
  const checkOut = new Date(d.checkOutDate);
  const noOfNights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / 86400000);

  if (noOfNights < 1) return NextResponse.json({ error: "Invalid dates" }, { status: 400 });

  // Verify room belongs to this hotel
  const room = await prisma.room.findFirst({
    where: { id: d.roomId, hotelId, isActive: true },
  });
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  // Availability check
  const conflict = await prisma.booking.findFirst({
    where: {
      roomId: d.roomId,
      status: { in: ["CONFIRMED", "CHECKED_IN"] },
      checkInDate: { lt: checkOut },
      checkOutDate: { gt: checkIn },
    },
  });
  if (conflict) return NextResponse.json({ error: "Room not available for selected dates" }, { status: 409 });

  // Resolve guest — find by phone or use provided guestId
  let guestId = d.guestId;
  if (guestId) {
    // Existing guest picked from search. If they were saved without a phone
    // (e.g. first captured as a companion), backfill the number staff just
    // entered — but only if no other guest already owns it (phone is @unique).
    const g = await prisma.guest.findUnique({
      where: { id: guestId },
      select: { id: true, phone: true },
    });
    if (g && !g.phone && d.guestPhone) {
      const clash = await prisma.guest.findFirst({
        where: { phone: d.guestPhone, NOT: { id: g.id } },
        select: { id: true },
      });
      if (!clash) {
        await prisma.guest.update({ where: { id: g.id }, data: { phone: d.guestPhone } });
      }
    }
  }
  if (!guestId) {
    const existing = await prisma.guest.findUnique({ where: { phone: d.guestPhone } });
    if (existing) {
      guestId = existing.id;
      // Update ID info if not already set
      if (!existing.idNumber && d.guestIdNumber) {
        await prisma.guest.update({
          where: { id: existing.id },
          data: {
            idType: d.guestIdType as never ?? existing.idType,
            idNumber: d.guestIdNumber,
            idFrontUrl: d.guestIdFrontUrl || existing.idFrontUrl || undefined,
            idBackUrl: d.guestIdBackUrl || existing.idBackUrl || undefined,
          },
        });
      }
    } else {
      const created = await prisma.guest.create({
        data: {
          name: d.guestName,
          phone: d.guestPhone,
          email: d.guestEmail || undefined,
          idType: d.guestIdType as never ?? undefined,
          idNumber: d.guestIdNumber || undefined,
          idFrontUrl: d.guestIdFrontUrl || undefined,
          idBackUrl: d.guestIdBackUrl || undefined,
        },
      });
      guestId = created.id;
    }
  }

  // Validate coupon (if provided)
  let couponDiscount = 0;
  let couponId: string | undefined;

  if (d.couponCode) {
    const coupon = await prisma.coupon.findFirst({
      where: {
        code: d.couponCode.toUpperCase(),
        isActive: true,
        OR: [{ hotelId }, { hotelId: null }],
        AND: [
          { OR: [{ expiryDate: null }, { expiryDate: { gte: new Date() } }] },
        ],
      },
    });
    if (coupon) {
      const hasUseLimit = coupon.maxUses !== null;
      if (!hasUseLimit || coupon.usedCount < coupon.maxUses!) {
        couponDiscount = applyCoupon(coupon, room.basePrice * noOfNights);
        couponId = coupon.id;
      }
    }
  }

  // Standard tariff for these dates — the baseline any edited price is judged
  // against, and what gets stored as originalTotal when staff change it.
  const standardTotals = computeTotals({
    roomRentPerNight: room.basePrice,
    noOfNights,
    couponDiscount,
  });

  // Staff can type the final price outright. It's GST-inclusive, so the taxable
  // value and tax are derived from it against the slabs — and it may be higher
  // than the tariff, which a discount could never express. Falls back to the
  // older discount field so existing callers keep working.
  const typedPrice = typeof d.customTotal === "number" ? Math.round(d.customTotal) : null;
  const priceEdited =
    typedPrice !== null && Math.abs(typedPrice - standardTotals.totalAmount) > 0.5;

  const totals = priceEdited
    ? computeTotalsForPrice({ inclusiveTotal: typedPrice!, noOfNights })
    : d.staffDiscount > 0
      ? computeTotalsWithStaffDiscount({
          roomRentPerNight: room.basePrice, noOfNights, couponDiscount,
          staffDiscount: d.staffDiscount,
        })
      : standardTotals;

  // Only a reduction counts as a discount for the owner's report; charging
  // above the tariff is recorded via originalTotal instead of a negative one.
  const discountGiven = Math.max(
    0,
    +(standardTotals.totalAmount - totals.totalAmount).toFixed(2)
  );
  const priceChanged = Math.abs(standardTotals.totalAmount - totals.totalAmount) > 0.5;

  const totalPaid = d.cashPaid + d.onlinePaid;
  const balanceDue = Math.max(0, totals.totalAmount - totalPaid);

  const bookingRef = await generateBookingRef();

  // Create booking — CONFIRMED immediately (admin-side, payment handled at counter)
  const booking = await prisma.booking.create({
    data: {
      bookingRef,
      hotelId,
      roomId: d.roomId,
      roomCategory: room.roomType,   // always set from physical room's type
      primaryGuestId: guestId,
      source: d.source,
      status: "CONFIRMED",
      checkInDate: checkIn,
      checkOutDate: checkOut,
      noOfNights,
      noOfPersons: d.noOfPersons,
      roomRent: standardTotals.roomRent,
      couponDiscount,
      couponId: couponId ?? undefined,
      taxableAmount: totals.taxableAmount,
      cgst: totals.cgst,
      sgst: totals.sgst,
      totalAmount: totals.totalAmount,
      // Counter discount + who gave it, for the owner's review
      staffDiscount: discountGiven,
      ...(priceChanged
        ? {
            originalTotal:    standardTotals.totalAmount,
            discountedById:   session.user.id,
            discountedByName: session.user.name || session.user.email || "Staff",
            discountReason:   d.discountReason?.trim() || undefined,
            discountedAt:     new Date(),
          }
        : {}),
      cashPaid: d.cashPaid,
      onlinePaid: d.onlinePaid,
      balanceDue,
      refundableDeposit: REFUNDABLE_DEPOSIT,
      depositCollected: d.depositCollected,
      depositMode: d.depositCollected > 0 ? (d.depositMode ?? "CASH") : undefined,
      specialRequests: d.specialRequests || undefined,
    },
  });

  // Increment coupon usage count
  if (couponId) {
    await prisma.coupon.update({
      where: { id: couponId },
      data: { usedCount: { increment: 1 } },
    });
  }

  // Payment record (cash/online split is tracked on the Booking itself)
  await prisma.payment.create({
    data: {
      bookingId: booking.id,
      amount: totals.totalAmount,
      mode: d.paymentMode,
      status: balanceDue === 0 ? "paid" : "partial",
      notes: d.paymentMode === "MIXED"
        ? `Cash: ₹${d.cashPaid}, Online: ₹${d.onlinePaid}`
        : undefined,
    },
  });

  // Ledger — whatever the guest handed over at the desk when the booking was
  // made. Anything paid later is recorded separately, on the day it arrives.
  const recordedBy = session.user.name || session.user.email || "Staff";
  const stage = balanceDue === 0 ? "paid in full at booking" : "part payment at booking";
  await recordTxn({
    hotelId, bookingId: booking.id, kind: "ROOM_PAYMENT", mode: "CASH",
    amount: d.cashPaid, note: roomPaymentNote("CASH", stage), recordedBy,
  });
  await recordTxn({
    hotelId, bookingId: booking.id, kind: "ROOM_PAYMENT", mode: "ONLINE",
    amount: d.onlinePaid, note: roomPaymentNote("ONLINE", stage), recordedBy,
  });
  // Taking more than the booking is billed at is legitimate — the price is
  // often discounted after the payment figure has been typed — but it is the
  // kind of thing that later looks like an accounting error, so it is recorded
  // as unusual and the owner is told the same day.
  const overpaid = +(totalPaid - totals.totalAmount).toFixed(2);
  if (overpaid > 0.5) {
    await recordStaffAction({
      hotelId,
      kind: "OTHER",
      summary: `${bookingRef}: ₹${totalPaid.toLocaleString("en-IN")} taken on a booking billed at ₹${totals.totalAmount.toLocaleString("en-IN")}.`,
      amount: overpaid,
      refType: "booking",
      refId: booking.id,
      bookingRef,
      guestName: d.guestName,
      reason: d.discountReason?.trim() || undefined,
      actorId: session.user.id,
      actorName: recordedBy,
      actorRole: session.user.role ?? "HOTEL_STAFF",
      details: { billed: totals.totalAmount, taken: totalPaid, extra: overpaid },
      notifyLines: [`₹${overpaid.toLocaleString("en-IN")} more than the bill — check the price or refund the difference`],
    });
  }

  // The deposit is the guest's money, held rather than earned — it shows on the
  // booking's account but stays out of the hotel's statement until it is used.
  await syncDepositTaken({
    hotelId, bookingId: booking.id,
    depositCollected: d.depositCollected,
    depositMode: d.depositMode ?? "CASH",
    recordedBy,
  });

  // If ID details provided, create online check-in record (pre-filled)
  const hasCheckinData = d.guestIdNumber || d.comingFrom || d.purpose;
  if (hasCheckinData) {
    await prisma.onlineCheckin.create({
      data: {
        bookingId: booking.id,
        guestId: guestId,
        comingFrom: d.comingFrom || undefined,
        goingTo: d.goingTo || undefined,
        purpose: d.purpose || undefined,
        vehicleNo: d.vehicleNo || undefined,
        completedAt: d.guestIdNumber ? new Date() : undefined,
      },
    });
    // Update guest ID details
    if (d.guestIdNumber) {
      await prisma.guest.update({
        where: { id: guestId },
        data: {
          idType: d.guestIdType as never ?? undefined,
          idNumber: d.guestIdNumber,
        },
      });
    }
  }

  // Notifications. A walk-in guest is standing at the desk being handed a key,
  // so a "booking confirmed" WhatsApp is noise — skip it for them, but keep it
  // for phone/other bookings where the guest isn't present. The owner is alerted
  // either way; counter bookings were the only channel never reaching them.
  {
    const hotel = await prisma.hotel.findUnique({
      where: { id: hotelId },
      select: { name: true },
    });
    const notif = {
      guestName: d.guestName,
      bookingRef,
      hotelName: hotel?.name ?? "The Hotel",
      roomType: getCategoryMeta(room.roomType).displayName,
      checkIn: format(checkIn, "dd MMM yyyy"),
      checkOut: format(checkOut, "dd MMM yyyy"),
      totalAmount: totals.totalAmount,
      payAtHotel: true,
    };

    const tasks: Promise<unknown>[] = [];
    if (d.source !== "WALK_IN" && d.guestPhone) {
      tasks.push(gupshup.sendBookingConfirmation(d.guestPhone, notif));
    }

    const ownerAlertData = {
      guestName: d.guestName,
      guestPhone: d.guestPhone || undefined,
      bookingRef,
      roomType: getCategoryMeta(room.roomType).displayName,
      checkIn: format(checkIn, "dd MMM yyyy"),
      checkOut: format(checkOut, "dd MMM yyyy"),
      nights: noOfNights,
      totalAmount: totals.totalAmount,
      payMode: balanceDue === 0 ? "PAID" : "PAY_AT_HOTEL",
      source: d.source,
    };
    tasks.push(gupshup.sendOwnerBookingAlert(ownerAlertData));
    tasks.push(email.sendOwnerBookingAlert(ownerAlertData));

    // Never let a messaging failure fail the booking that was just taken.
    await Promise.allSettled(tasks);
  }

  return NextResponse.json({ bookingId: booking.id, bookingRef }, { status: 201 });
}
