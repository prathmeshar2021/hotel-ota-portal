import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/superAdmin";
import { generateGstReport } from "@/lib/services/gst-report";

// GET /api/admin/gst-report?month=YYYY-MM  → monthly GST sales report (.xlsx)
export async function GET(req: NextRequest) {
  const ctx = await requireSuperAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const monthParam = req.nextUrl.searchParams.get("month"); // "YYYY-MM"
  const m = /^(\d{4})-(\d{2})$/.exec(monthParam ?? "");
  if (!m) {
    return NextResponse.json({ error: "Invalid month (expected YYYY-MM)" }, { status: 400 });
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) {
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }

  try {
    const { buffer, filename } = await generateGstReport({ hotelId: ctx.hotelId, year, month });
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[gst-report]", err);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}
