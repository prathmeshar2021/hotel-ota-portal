import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import {
  buildDailyAccounts,
  isSheetDate,
  renderDailyAccountsPdf,
  sheetFilename,
  todayIST,
} from "@/lib/services/daily-accounts";

export const dynamic = "force-dynamic";

/**
 * The daily accounts sheet for any day, for the desk to download — the same
 * PDF the owner is sent at night. Today's can be taken before 11 pm; it then
 * stops at the present moment and says so on the page.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.hotelId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "HOTEL_ADMIN" && role !== "HOTEL_STAFF" && role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const date = req.nextUrl.searchParams.get("date") ?? todayIST();
  if (!isSheetDate(date)) return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  if (date > todayIST()) return NextResponse.json({ error: "That day has not started yet" }, { status: 400 });

  try {
    const sheet = await buildDailyAccounts(session.user.hotelId, date);
    const bytes = renderDailyAccountsPdf(sheet);
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${sheetFilename(sheet)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[daily-sheet]", err);
    return NextResponse.json({ error: "Could not build the sheet" }, { status: 500 });
  }
}
