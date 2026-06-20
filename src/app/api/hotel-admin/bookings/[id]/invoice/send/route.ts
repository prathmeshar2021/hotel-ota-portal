import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { ensureGstInvoice } from "@/lib/services/invoice";
import { gupshup } from "@/lib/services/gupshup";
import { email } from "@/lib/services/email";
import { BUSINESS } from "@/lib/constants/business";

// POST → send the GST invoice PDF to the primary guest via WhatsApp and/or email.
export async function POST(
  _req: NextRequest,
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
  const booking = await prisma.booking.findFirst({
    where: { id, hotelId: session.user.hotelId },
    select: { id: true, primaryGuest: { select: { name: true, phone: true, email: true } } },
  });
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const { phone, email: guestEmail, name: guestName } = booking.primaryGuest;
  if (!phone && !guestEmail) {
    return NextResponse.json({ error: "Guest has no phone or email on file" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return NextResponse.json(
      { error: "Server misconfigured: NEXT_PUBLIC_APP_URL is not set" },
      { status: 500 }
    );
  }

  try {
    const invoice = await ensureGstInvoice(booking.id);
    const pdfUrl = `${appUrl}/api/invoices/${booking.id}/pdf?n=${encodeURIComponent(invoice.invoiceNumber)}`;
    const channels: string[] = [];

    if (phone) {
      await gupshup.sendInvoiceDocument(phone, {
        guestName,
        hotelName: BUSINESS.brand,
        invoiceNumber: invoice.invoiceNumber,
        pdfUrl,
      });
      channels.push("WhatsApp");
    }

    if (guestEmail) {
      await email.sendInvoice(guestEmail, {
        guestName,
        invoiceNumber: invoice.invoiceNumber,
        pdfUrl,
      });
      channels.push("email");
    }

    return NextResponse.json({ success: true, message: `Invoice sent via ${channels.join(" & ")}` });
  } catch (err) {
    console.error("[invoice send]", err);
    return NextResponse.json({ error: "Failed to send invoice" }, { status: 502 });
  }
}
