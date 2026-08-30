import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";
import { computeTotalsForPrice } from "@/lib/utils/booking-calc";
import { recordStaffAction } from "@/lib/services/staff-action";
import { syncDepositTaken, postSplit } from "@/lib/services/booking-ledger";

/**
 * Edit what a booking costs, after it was made.
 *
 * Staff agree a different rate all the time — a regular gets a discount, a late
 * checkout gets charged, a quoted price turns out to be wrong. Until now the
 * only way to change it was at creation, so the desk either rebuilt the booking
 * or left the figures wrong.
 *
 * The price staff type is what the guest pays, GST included. The tax split is
 * recomputed from it here rather than trusted from the browser, using the same
 * slab logic as booking creation, so an edited booking is taxed exactly as a
 * new one at that price would be.
 *
 * Every edit is notified to the owner and kept in the activity log — this moves
 * real money, and it is the kind of change that should never be quiet.
 */

const Schema = z.object({
  /** New GST-inclusive total for the room. Omit to leave the price alone. */
  totalAmount: z.number().min(0).optional(),
  /** New refundable deposit expected at check-in. */
  refundableDeposit: z.number().min(0).optional(),
  /** Correct the deposit actually held, when it was keyed in wrong. */
  depositCollected: z.number().min(0).optional(),
  /** How a corrected deposit came in, and the cash side when it is both. */
  depositMode: z.enum(["CASH", "ONLINE", "MIXED"]).optional(),
  depositCash: z.number().min(0).optional(),
  reason: z.string().trim().max(300).optional(),
});

function staffGuard(role?: string) {
  return role === "HOTEL_ADMIN" || role === "HOTEL_STAFF" || role === "SUPER_ADMIN";
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.hotelId || !staffGuard(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = Schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const booking = await prisma.booking.findFirst({
    where: { id, hotelId: session.user.hotelId },
    select: {
      id: true, bookingRef: true, status: true, noOfNights: true,
      roomRent: true, couponDiscount: true, totalAmount: true, originalTotal: true,
      taxableAmount: true, cgst: true, sgst: true,
      cashPaid: true, onlinePaid: true, balanceDue: true,
      refundableDeposit: true, depositCollected: true, depositMode: true,
      primaryGuest: { select: { name: true } },
    },
  });
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  if (booking.status === "CANCELLED") {
    return NextResponse.json({ error: "Can't reprice a cancelled booking" }, { status: 400 });
  }

  const { totalAmount, refundableDeposit, depositCollected, reason } = parsed.data;
  const depMode = parsed.data.depositMode;
  const updateData: Record<string, unknown> = {};
  const changes: string[] = [];
  const notifyLines: string[] = [];
  const actorName = session.user.name || session.user.email || "Staff";

  // ── Room price ──
  const wantsPriceChange =
    totalAmount != null && Math.abs(totalAmount - booking.totalAmount) > 0.5;

  if (wantsPriceChange) {
    const paid = +(booking.cashPaid + booking.onlinePaid).toFixed(2);
    if (totalAmount < paid - 0.5) {
      // Dropping the price below what's already been taken would imply a refund
      // this endpoint doesn't issue, and would silently leave the guest in
      // credit with nothing recording it.
      return NextResponse.json(
        {
          error: `₹${paid.toLocaleString("en-IN")} has already been paid on this booking. Set the total to at least that, or refund the difference first.`,
        },
        { status: 400 }
      );
    }

    const totals = computeTotalsForPrice({
      inclusiveTotal: totalAmount,
      noOfNights: booking.noOfNights,
    });

    updateData.taxableAmount = totals.taxableAmount;
    updateData.cgst = totals.cgst;
    updateData.sgst = totals.sgst;
    updateData.totalAmount = totals.totalAmount;
    updateData.balanceDue = +Math.max(0, totals.totalAmount - paid).toFixed(2);
    // Keep the original tariff visible once, so the owner can always see what
    // the booking would have cost before anyone touched it.
    if (booking.originalTotal == null) updateData.originalTotal = booking.totalAmount;
    updateData.discountedById = session.user.id;
    updateData.discountedByName = actorName;
    updateData.discountedAt = new Date();
    if (reason?.trim()) updateData.discountReason = reason.trim();
    // Only a reduction is a discount; charging more is recorded via originalTotal.
    updateData.staffDiscount = Math.max(
      0,
      +((booking.originalTotal ?? booking.totalAmount) - totals.totalAmount).toFixed(2)
    );

    const dir = totals.totalAmount > booking.totalAmount ? "increased" : "reduced";
    changes.push(
      `Room total ${dir} from ₹${booking.totalAmount.toLocaleString("en-IN")} to ₹${totals.totalAmount.toLocaleString("en-IN")}`
    );
    notifyLines.push(
      `Taxable ₹${totals.taxableAmount.toLocaleString("en-IN")} + CGST ₹${totals.cgst.toLocaleString("en-IN")} + SGST ₹${totals.sgst.toLocaleString("en-IN")}`,
      `Still due from guest: ₹${(updateData.balanceDue as number).toLocaleString("en-IN")}`
    );
  }

  // ── Refundable deposit expected ──
  if (refundableDeposit != null && Math.abs(refundableDeposit - booking.refundableDeposit) > 0.5) {
    updateData.refundableDeposit = refundableDeposit;
    changes.push(
      `Refundable deposit changed from ₹${booking.refundableDeposit.toLocaleString("en-IN")} to ₹${refundableDeposit.toLocaleString("en-IN")}`
    );
  }

  // ── Deposit actually held ──
  if (depositCollected != null && Math.abs(depositCollected - booking.depositCollected) > 0.5) {
    updateData.depositCollected = depositCollected;
    if (depositCollected > 0) updateData.depositMode = depMode ?? booking.depositMode ?? "CASH";
    changes.push(
      `Deposit held corrected from ₹${booking.depositCollected.toLocaleString("en-IN")} to ₹${depositCollected.toLocaleString("en-IN")}`
    );
  }

  if (changes.length === 0) {
    return NextResponse.json({ error: "Nothing changed" }, { status: 400 });
  }

  const updated = await prisma.booking.update({
    where: { id },
    data: updateData,
    select: { totalAmount: true, taxableAmount: true, cgst: true, sgst: true, balanceDue: true, refundableDeposit: true, depositCollected: true },
  });

  // A corrected holding has to move the booking's account as well, or the panel
  // would keep showing the old figure as held.
  if (depositCollected != null) {
    if (depMode === "MIXED") {
      // A part-cash deposit needs both sides recorded, so the till figure and
      // any later application know how much of it was actually notes. The old
      // entries go first — this is a correction of what is held, not a top-up.
      const cash = Math.min(Math.max(0, parsed.data.depositCash ?? 0), updated.depositCollected);
      await prisma.bookingTxn.deleteMany({
        where: { bookingId: booking.id, kind: { in: ["DEPOSIT_TAKEN", "DEPOSIT_RETURNED"] } },
      });
      await postSplit({
        hotelId: session.user.hotelId, bookingId: booking.id, kind: "DEPOSIT_TAKEN",
        recordedBy: actorName, note: "Deposit holding corrected at the desk",
        cashAmount: cash, onlineAmount: +(updated.depositCollected - cash).toFixed(2),
      });
    } else {
      await syncDepositTaken({
        hotelId: session.user.hotelId,
        bookingId: booking.id,
        depositCollected: updated.depositCollected,
        depositMode: depMode === "ONLINE" ? "ONLINE" : "CASH",
        recordedBy: actorName,
        note: "Deposit holding corrected at the desk",
      });
    }
  }

  await recordStaffAction({
    hotelId: session.user.hotelId,
    kind: wantsPriceChange ? "PRICE_CHANGE" : "DEPOSIT_CHANGE",
    summary: `${booking.bookingRef}: ${changes.join("; ")}.`,
    amount: wantsPriceChange ? updated.totalAmount : updated.depositCollected,
    refType: "booking",
    refId: booking.id,
    bookingRef: booking.bookingRef,
    guestName: booking.primaryGuest.name,
    reason: reason?.trim() || undefined,
    actorId: session.user.id,
    actorName,
    actorRole: session.user.role ?? "HOTEL_STAFF",
    details: {
      before: {
        totalAmount: booking.totalAmount, taxableAmount: booking.taxableAmount,
        cgst: booking.cgst, sgst: booking.sgst,
        refundableDeposit: booking.refundableDeposit, depositCollected: booking.depositCollected,
      },
      after: updated,
    },
    notifyLines,
  });

  return NextResponse.json({
    success: true,
    ...updated,
    message: changes.join(" · "),
  });
}
