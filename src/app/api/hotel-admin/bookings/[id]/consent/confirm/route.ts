import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { ensureConsent } from "@/lib/services/consent";

/**
 * POST → staff attests that the guest has signed the printed consent form.
 * Records electronic confirmation (mode PORTAL, staff-attested) so the check-in
 * gate is satisfied for the physical-signature flow. Idempotent.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.hotelId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (
    session.user.role !== "HOTEL_ADMIN" &&
    session.user.role !== "HOTEL_STAFF" &&
    session.user.role !== "SUPER_ADMIN"
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const booking = await prisma.booking.findFirst({
    where: { id, hotelId: session.user.hotelId },
    select: { id: true },
  });
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  try {
    const consent = await ensureConsent(booking.id);
    if (!consent.primaryAcceptedAt) {
      // mode PORTAL marks this as a staff-verified physical signature (not an
      // electronic acceptance), so the PDF shows the signed-copy note. Record
      // WHICH staff member verified it (name snapshotted for the record).
      await prisma.consent.update({
        where: { bookingId: booking.id },
        data: {
          status: "ACCEPTED",
          mode: "PORTAL",
          primaryAcceptedAt: new Date(),
          verifiedById: session.user.id,
          verifiedByName: session.user.name ?? "Staff",
        },
      });
    }
    return NextResponse.json({
      success: true,
      message: "Consent confirmed",
      verifiedByName: consent.primaryAcceptedAt
        ? consent.verifiedByName ?? null
        : session.user.name ?? "Staff",
    });
  } catch (err) {
    console.error("[consent confirm]", err);
    return NextResponse.json({ error: "Failed to confirm consent" }, { status: 500 });
  }
}
