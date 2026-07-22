import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { ensureConsent } from "@/lib/services/consent";

/**
 * POST → ensure a Consent record + token exists for this booking and return the
 * token so the admin UI can build the (public, token-gated) PDF download link.
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
    return NextResponse.json({ success: true, token: consent.consentToken });
  } catch (err) {
    console.error("[consent generate]", err);
    return NextResponse.json({ error: "Failed to prepare consent form" }, { status: 500 });
  }
}
