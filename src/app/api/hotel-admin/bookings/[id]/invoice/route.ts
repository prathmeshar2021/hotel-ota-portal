import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { ensureGstInvoice } from "@/lib/services/invoice";

// POST → generate (or fetch) the GST invoice record for this booking.
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
    select: { id: true },
  });
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  try {
    const invoice = await ensureGstInvoice(booking.id);
    return NextResponse.json({
      success: true,
      invoiceNumber: invoice.invoiceNumber,
      pdfPath: `/api/invoices/${booking.id}/pdf`,
    });
  } catch (err) {
    console.error("[invoice generate]", err);
    return NextResponse.json({ error: "Failed to generate invoice" }, { status: 500 });
  }
}
