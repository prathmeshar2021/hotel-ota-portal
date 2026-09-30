import { NextRequest, NextResponse } from "next/server";
import { deliverDailyAccounts } from "@/lib/services/daily-accounts-delivery";
import { isSheetDate, latestClosedSheetDate } from "@/lib/services/daily-accounts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Nightly: sends the day's accounts sheet to the owner by email and WhatsApp.
 *
 * With no date it sends the most recent day that has closed (days close at
 * 11 pm), so it names the right day even when the scheduler runs it late.
 * `?date=YYYY-MM-DD` re-sends a past day; `?dry=1` builds the sheet and reports
 * the figures without sending anything.
 *
 * Same guard as the other cron: Vercel sends CRON_SECRET as a bearer token, and
 * without it configured the endpoint refuses to run rather than being open.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const latest = latestClosedSheetDate();
  const asked = req.nextUrl.searchParams.get("date");
  const dryRun = req.nextUrl.searchParams.get("dry") === "1";
  if (asked !== null && !isSheetDate(asked)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  const date = asked ?? latest;
  // A day still running would go out half-finished and never be sent complete.
  if (!dryRun && date > latest) {
    return NextResponse.json({ error: `${date} has not closed yet — it closes at 11:00 pm` }, { status: 400 });
  }

  try {
    const results = await deliverDailyAccounts({ date, dryRun });
    console.log("[daily-accounts]", JSON.stringify(results));
    return NextResponse.json({ ok: true, date, dryRun, results });
  } catch (e) {
    console.error("[daily-accounts]", e);
    return NextResponse.json({ error: "Could not build the daily sheet" }, { status: 500 });
  }
}
