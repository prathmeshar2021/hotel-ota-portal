import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { processBookingRefund, markRefundManual } from "@/lib/services/refund";

/**
 * Admin action to settle a refund that's PENDING or FAILED.
 *  • body { markManual: true } → record that staff handed the refund back (cash).
 *  • otherwise                 → retry the automatic Razorpay refund.
 */
export async function POST(
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
  const body = await req.json().catch(() => ({}));
  const markManual = Boolean(body?.markManual);

  const booking = await prisma.booking.findFirst({
    where: { id, hotelId: session.user.hotelId },
    select: { id: true, refundStatus: true, refundAmount: true },
  });
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if (booking.refundStatus !== "PENDING" && booking.refundStatus !== "FAILED") {
    return NextResponse.json(
      { error: "No pending refund for this booking" },
      { status: 400 }
    );
  }

  const result = markManual
    ? await markRefundManual(booking.id, session.user.name ?? session.user.email ?? "Staff")
    : await processBookingRefund(booking.id, booking.refundAmount, { reason: "Admin refund retry" });

  const ok = result.refundStatus === "PROCESSED";
  return NextResponse.json(
    { success: ok, refundStatus: result.refundStatus, message: result.message },
    { status: ok ? 200 : 502 }
  );
}
