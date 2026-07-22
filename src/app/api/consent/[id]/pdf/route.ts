import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { renderConsentPdf } from "@/lib/services/consent";
import { enforceRateLimit } from "@/lib/ratelimit";

/**
 * Public consent-form PDF, keyed by the booking's (unguessable) id + a per-
 * consent token. Must be public so WhatsApp (gupshup) can fetch it as a
 * document. `?download=1` forces a save dialog.
 *
 * The token (`?t=`) is a required second factor: a missing/mismatched token is
 * a 404, so the booking id alone never renders someone else's registration.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = await enforceRateLimit(req, { name: "consent-pdf", limit: 30, windowSec: 60 });
  if (limited) return limited;

  const { id } = await params;
  const token = req.nextUrl.searchParams.get("t");
  if (!token) {
    return NextResponse.json({ error: "Consent form not found" }, { status: 404 });
  }

  const consent = await prisma.consent.findUnique({
    where: { bookingId: id },
    select: { consentToken: true },
  });
  if (!consent?.consentToken || consent.consentToken !== token) {
    return NextResponse.json({ error: "Consent form not found" }, { status: 404 });
  }

  let bytes: Uint8Array | null = null;
  try {
    bytes = await renderConsentPdf(id);
  } catch (err) {
    console.error("[consent pdf]", err);
    return NextResponse.json({ error: "Could not render consent form" }, { status: 500 });
  }
  if (!bytes) {
    return NextResponse.json({ error: "Consent form not found" }, { status: 404 });
  }

  const download = req.nextUrl.searchParams.get("download") === "1";
  const filename = "Guest_Consent_Form.pdf";

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
