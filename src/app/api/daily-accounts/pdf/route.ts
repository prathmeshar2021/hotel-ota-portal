import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/ratelimit";
import {
  buildDailyAccounts,
  renderDailyAccountsPdf,
  sheetFilename,
  verifySheetLink,
} from "@/lib/services/daily-accounts";

export const dynamic = "force-dynamic";

/**
 * The daily accounts PDF, for WhatsApp to fetch. Public because WhatsApp
 * downloads the document itself; only a signed link that names this hotel and
 * day, and has not expired, gets the file. Anything else is a plain 404 that
 * reveals nothing.
 */
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, { name: "daily-accounts-pdf", limit: 20, windowSec: 60 });
  if (limited) return limited;

  const q = req.nextUrl.searchParams;
  const link = verifySheetLink({ h: q.get("h"), d: q.get("d"), e: q.get("e"), s: q.get("s") });
  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const sheet = await buildDailyAccounts(link.hotelId, link.date);
    const bytes = renderDailyAccountsPdf(sheet);
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${sheetFilename(sheet)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[daily-accounts pdf]", err);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
