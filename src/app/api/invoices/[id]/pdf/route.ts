import { NextRequest, NextResponse } from "next/server";
import { renderExistingInvoicePdf } from "@/lib/services/invoice";
import { enforceRateLimit } from "@/lib/ratelimit";

/**
 * Public invoice PDF, keyed by the booking's (unguessable) id — consistent with
 * the public /booking/confirmation/[ref] page. Must be public so WhatsApp
 * (gupshup) can fetch it as a document. `?download=1` forces a save dialog.
 *
 * Read-only: it renders an already-issued invoice and never creates one, so an
 * unauthenticated request can't mint invoice records or numbers.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = await enforceRateLimit(req, { name: "invoice-pdf", limit: 30, windowSec: 60 });
  if (limited) return limited;

  const { id } = await params;
  // Second factor: the booking id alone isn't enough — the invoice number must
  // also be supplied. Missing/mismatched → 404 (don't reveal the booking).
  const n = req.nextUrl.searchParams.get("n");
  if (!n) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  let result: { bytes: Uint8Array; invoiceNumber: string } | null = null;
  try {
    result = await renderExistingInvoicePdf(id, n);
  } catch (err) {
    console.error("[invoice pdf]", err);
    return NextResponse.json({ error: "Could not render invoice" }, { status: 500 });
  }
  if (!result) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
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
