import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { ensureConsent } from "@/lib/services/consent";
import { gupshup } from "@/lib/services/gupshup";

/**
 * POST → send the guest-registration & consent form to the primary guest on
 * WhatsApp (paperless check-in). The message carries the PDF plus a secure link
 * the guest taps to record electronic acceptance.
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
    select: {
      id: true,
      guestPhone: true,
      primaryGuest: { select: { name: true, phone: true } },
    },
  });
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const phone = booking.primaryGuest.phone ?? booking.guestPhone;
  if (!phone) {
    return NextResponse.json({ error: "Guest has no phone number on file" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return NextResponse.json(
      { error: "Server misconfigured: NEXT_PUBLIC_APP_URL is not set" },
      { status: 500 }
    );
  }

  try {
    const consent = await ensureConsent(booking.id);
    const pdfUrl = `${appUrl}/api/consent/${booking.id}/pdf?t=${consent.consentToken}`;
    const acceptUrl = `${appUrl}/consent/${consent.consentToken}`;

    await gupshup.sendConsentDocument(phone, {
      guestName: booking.primaryGuest.name,
      pdfUrl,
      acceptUrl,
    });

    await prisma.consent.update({
      where: { bookingId: booking.id },
      data: { status: "SENT", mode: "WHATSAPP", sentAt: new Date() },
    });

    return NextResponse.json({ success: true, message: "Consent form sent on WhatsApp" });
  } catch (err) {
    console.error("[consent send]", err);
    return NextResponse.json({ error: "Failed to send consent form" }, { status: 502 });
  }
}
