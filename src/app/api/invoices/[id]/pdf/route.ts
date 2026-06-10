import { NextRequest, NextResponse } from "next/server";
import { renderBookingInvoicePdf } from "@/lib/services/invoice";

/**
 * Public invoice PDF, keyed by the booking's (unguessable) id — consistent with
 * the public /booking/confirmation/[ref] page. Must be public so WhatsApp
 * (gupshup) can fetch it as a document. `?download=1` forces a save dialog.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let result: { bytes: Uint8Array; invoiceNumber: string } | null = null;
  try {
    result = await renderBookingInvoicePdf(id);
  } catch (err) {
    console.error("[invoice pdf]", err);
    return NextResponse.json({ error: "Could not generate invoice" }, { status: 500 });
  }
  if (!result) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const download = req.nextUrl.searchParams.get("download") === "1";
  const filename = `Invoice_${result.invoiceNumber}.pdf`;

  return new NextResponse(Buffer.from(result.bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
