import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { ensureRoomAssigned, isConsentConfirmed, CHECKIN_GATE_MESSAGES } from "@/lib/services/checkin-gate";

const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING_PAYMENT: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["CHECKED_IN", "NO_SHOW", "CANCELLED"],
  CHECKED_IN: ["CHECKED_OUT"],
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.hotelId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "HOTEL_ADMIN" && session.user.role !== "HOTEL_STAFF" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { status: newStatus, settlement } = body;

  // Verify booking belongs to this hotel
  const booking = await prisma.booking.findFirst({
    where: { id, hotelId: session.user.hotelId },
    select: {
      id: true, status: true, roomId: true, checkInDate: true, checkOutDate: true,
      hotelId: true, roomCategory: true,
      depositCollected: true, additionalCharges: true, balanceDue: true,
      cashPaid: true, onlinePaid: true,
      // Needed to push a deposit refund back to the card/UPI it came from.
      depositPaymentId: true,
      payment: { select: { razorpayPaymentId: true, amount: true, refundAmount: true } },
    },
  });

  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const allowed = VALID_TRANSITIONS[booking.status] ?? [];
  if (!allowed.includes(newStatus)) {
    return NextResponse.json(
      { error: `Cannot transition from ${booking.status} to ${newStatus}` },
      { status: 400 }
    );
  }

  // A booking can only be a no-show once its stay has started — you can't
  // no-show a future reservation. Compare against the start of the check-in day.
  if (newStatus === "NO_SHOW") {
    const checkInDay = new Date(booking.checkInDate);
    checkInDay.setHours(0, 0, 0, 0);
    if (Date.now() < checkInDay.getTime()) {
      return NextResponse.json(
        { error: "Can't mark No Show before the check-in date." },
        { status: 400 }
      );
    }
  }

  const now = new Date();
  const updateData: Record<string, unknown> = { status: newStatus };

  if (newStatus === "CHECKED_IN") {
    // Gate: a stay cannot be checked in until (1) a physical room is assigned
    // (auto-allot as a fallback) and (2) the guest's consent is confirmed.
    const roomId = await ensureRoomAssigned({
      id: booking.id,
      hotelId: booking.hotelId,
      roomId: booking.roomId,
      roomCategory: booking.roomCategory,
      checkInDate: booking.checkInDate,
      checkOutDate: booking.checkOutDate,
    });
    if (!roomId) {
      return NextResponse.json({ error: CHECKIN_GATE_MESSAGES.noRoom }, { status: 409 });
    }
    if (!(await isConsentConfirmed(booking.id))) {
      return NextResponse.json({ error: CHECKIN_GATE_MESSAGES.consent }, { status: 409 });
    }

    updateData.checkedInAt = now;
    await prisma.room.update({
      where: { id: roomId },
      data: { status: "OCCUPIED" },
    });
  }

  if (newStatus === "CHECKED_OUT") {
    updateData.checkedOutAt = now;

    // Final settlement (server-authoritative): the deposit held nets against
    // everything still owed (unpaid room balance + extra charges).
    //   net = depositCollected − (balanceDue + additionalCharges)
    //   net ≥ 0 → refund net to guest;  net < 0 → collect −net from guest.
    const owed = +(booking.balanceDue + booking.additionalCharges).toFixed(2);
    const net = +(booking.depositCollected - owed).toFixed(2);
    const collect = Math.max(0, -net);
    const depositUsed = Math.min(booking.depositCollected, owed); // deposit applied to what was owed

    // Whatever the deposit didn't have to cover is refundable — but staff can
    // withhold part of it at the desk for dirt/damage found on inspection.
    // Clamped here rather than trusted, so the guest can never be short-changed
    // beyond the deposit actually held.
    const refundable = Math.max(0, net);
    const rawDeduction = Number(settlement?.deduction) || 0;
    const deduction = Math.min(Math.max(0, +rawDeduction.toFixed(2)), refundable);
    const refund = +(refundable - deduction).toFixed(2);

    updateData.balanceDue = 0; // everything is settled at checkout
    updateData.depositDeducted = +(depositUsed + deduction).toFixed(2);
    updateData.depositRefunded = refund > 0;

    // Record any amount collected now (excess beyond the deposit) as a payment.
    if (collect > 0) {
      const mode = settlement?.collectMode === "ONLINE" ? "ONLINE" : "CASH";
      if (mode === "ONLINE") updateData.onlinePaid = booking.onlinePaid + collect;
      else updateData.cashPaid = booking.cashPaid + collect;
    }

    // Push the refund back to the card/UPI it came from when staff ask for it
    // and we still have the original Razorpay payment to refund against.
    // A gateway failure must never block the checkout itself, so it's recorded
    // as PENDING for someone to retry rather than thrown.
    const wantsGatewayRefund = settlement?.refundMode === "RAZORPAY";
    // Prefer the deposit's own payment (taken via the WhatsApp link) so the
    // money goes back to the exact account that paid it. Only fall back to the
    // room payment when the deposit wasn't collected online.
    const paidByLink = !!booking.depositPaymentId;
    const sourcePaymentId = booking.depositPaymentId ?? booking.payment?.razorpayPaymentId ?? null;
    // This moves real money, so never ask the gateway for more than is actually
    // left on that payment — a partial refund may already have been issued.
    const refundableAtSource = paidByLink
      ? booking.depositCollected
      : +((booking.payment?.amount ?? 0) - (booking.payment?.refundAmount ?? 0)).toFixed(2);
    const withinSource = refund <= refundableAtSource + 0.01;
    let refundSpeed: string | null = null;

    if (refund > 0 && wantsGatewayRefund && sourcePaymentId && withinSource) {
      try {
        const { createRefund } = await import("@/lib/services/razorpay");
        // "optimum" = instant where the guest's bank supports it, automatically
        // falling back to the normal cycle where it doesn't.
        const r = await createRefund(
          sourcePaymentId,
          Math.round(refund * 100),
          { bookingId: booking.id, reason: "Refundable deposit returned at checkout" },
          "optimum"
        );
        const res = r as { id?: string; speed_processed?: string };
        refundSpeed = res?.speed_processed ?? null;
        updateData.refundStatus = "PROCESSED";
        updateData.refundId = res?.id;
        updateData.refundAmount = refund;
        updateData.refundedAt = now;
        // Keep the room payment's refunded total in step so a later refund
        // can't exceed what's left on it. Skipped when the deposit had its own
        // payment link — that money never came through this Payment row.
        if (!paidByLink) {
          await prisma.payment.update({
            where: { bookingId: booking.id },
            data: {
              refundAmount: +((booking.payment?.refundAmount ?? 0) + refund).toFixed(2),
              refundedAt: now,
            },
          }).catch(() => {});
        }
      } catch (e) {
        console.error("[checkout] deposit refund failed:", e);
        updateData.refundStatus = "PENDING";
        updateData.refundAmount = refund;
      }
    }

    const how = refund > 0
      ? wantsGatewayRefund && sourcePaymentId
        ? !withinSource
          ? " — exceeds what's left on the original payment, hand it back at the desk"
          : updateData.refundStatus === "PROCESSED"
            ? ` to source (Razorpay${refundSpeed === "instant" ? ", instant" : ""})`
            : " — gateway refund failed, settle manually"
        : ` in ${settlement?.refundMode === "ONLINE" ? "UPI" : "cash"} at the desk`
      : "";
    const summary = refund > 0
      ? `Refunded ₹${refund} deposit${how}`
      : collect > 0 ? `Collected ₹${collect} at checkout` : "Settled — no refund/collection";
    const withDeduction = deduction > 0 ? `${summary}; ₹${deduction} withheld` : summary;
    updateData.depositNotes = settlement?.notes ? `${withDeduction} — ${settlement.notes}` : withDeduction;

    // Free up the room if one was assigned
    if (booking.roomId) {
      await prisma.room.update({
        where: { id: booking.roomId },
        data: { status: "CLEANING" },
      });
    }
  }

  await prisma.booking.update({
    where: { id },
    data: updateData,
  });

  // Issue the GST tax invoice at check-out so every completed stay gets a
  // sequential invoice number automatically. Idempotent; never blocks check-out.
  // (Delivery stays manual — the invoice is only sent on WhatsApp when staff press Send.)
  if (newStatus === "CHECKED_OUT") {
    try {
      const { ensureGstInvoice } = await import("@/lib/services/invoice");
      await ensureGstInvoice(id);
    } catch (e) {
      console.error("[status] auto-issue invoice failed:", e);
    }
  }

  const messages: Record<string, string> = {
    CONFIRMED: "Booking confirmed",
    CHECKED_IN: "Guest checked in successfully",
    CHECKED_OUT: "Guest checked out. Room marked for cleaning.",
    NO_SHOW: "Booking marked as No Show",
    CANCELLED: "Booking cancelled",
  };

  return NextResponse.json({ success: true, message: messages[newStatus] ?? "Status updated" });
}
