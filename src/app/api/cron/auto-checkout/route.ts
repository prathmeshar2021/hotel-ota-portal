import { NextRequest, NextResponse } from "next/server";
import { autoCheckoutOverdue } from "@/lib/services/auto-checkout";

export const dynamic = "force-dynamic";

/**
 * Scheduled sweep that closes stays nobody checked out, so the room board stops
 * showing a guest from weeks ago as the current occupant.
 *
 * Run hourly. Vercel Cron sends an Authorization header built from CRON_SECRET;
 * we require it so this can't be triggered by anyone who finds the URL. Without
 * CRON_SECRET set the endpoint refuses to run rather than defaulting to open.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 503 }
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await autoCheckoutOverdue();
    if (result.closed.length > 0) {
      console.log("[auto-checkout] closed:", result.closed);
    }
    return NextResponse.json({
      ok: true,
      scanned: result.scanned,
      closed: result.closed.length,
      bookings: result.closed,
    });
  } catch (e) {
    console.error("[auto-checkout]", e);
    return NextResponse.json({ error: "Sweep failed" }, { status: 500 });
  }
}
