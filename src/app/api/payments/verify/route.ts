import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { verifyPaymentSignature } from "@/lib/services/razorpay";
import { gupshup } from "@/lib/services/gupshup";
import { syncBookingToAppSheet } from "@/lib/services/appsheet-sync";
import { format } from "date-fns";
import { getCategoryMeta } from "@/lib/utils/room-categories";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, bookingId } = body;

  const isValid = verifyPaymentSignature({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature,
  });

  if (!isValid) {
    return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
  }

  const booking = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: "CONFIRMED",
      onlinePaid: { increment: 0 }, // will be set below
      payment: {
        update: {
          razorpayPaymentId: razorpay_payment_id,
          status: "captured",
          paidAt: new Date(),
        },
      },
    },
    include: {
      primaryGuest: true,
      hotel: true,
      room: true,
      payment: true,
    },
  });

  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      onlinePaid: booking.totalAmount,
      balanceDue: 0,
    },
  });

  // Send WhatsApp confirmation (fire-and-forget, only if guest has phone)
  if (booking.primaryGuest.phone) gupshup
    .sendBookingConfirmation(booking.primaryGuest.phone, {
      guestName: booking.primaryGuest.name,
      bookingRef: booking.bookingRef,
      hotelName: booking.hotel.name,
      roomType: getCategoryMeta(booking.roomCategory).displayName,
      checkIn: format(booking.checkInDate, "dd MMM yyyy"),
      checkOut: format(booking.checkOutDate, "dd MMM yyyy"),
      totalAmount: booking.totalAmount,
    })
    .catch((e) => console.error("[WhatsApp] Confirmation failed:", e));

  // Sync to AppSheet (fire-and-forget)
  syncBookingToAppSheet(booking.id).catch((e) =>
    console.error("[AppSheet Sync]:", e)
  );

  return NextResponse.json({ success: true, bookingRef: booking.bookingRef });
}
