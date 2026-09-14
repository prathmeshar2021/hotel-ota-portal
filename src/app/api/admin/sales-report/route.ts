import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/superAdmin";
import { buildSalesReport, renderSalesReportPdf } from "@/lib/services/sales-report";

// GET /api/admin/sales-report?month=YYYY-MM&start=1650
//   → the monthly sales report for the GST advocate (.pdf)
//   Add &format=json to read the figures without downloading the file.
export async function GET(req: NextRequest) {
  const ctx = await requireSuperAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const m = /^(\d{4})-(\d{2})$/.exec(req.nextUrl.searchParams.get("month") ?? "");
  if (!m) return NextResponse.json({ error: "Invalid month (expected YYYY-MM)" }, { status: 400 });

  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return NextResponse.json({ error: "Invalid month" }, { status: 400 });

  // The advocate's serial runs across months, so the owner says where this one
  // picks up. Defaults to 1 rather than guessing at their sequence.
  const startSerial = Math.max(1, Number(req.nextUrl.searchParams.get("start")) || 1);

  try {
    const report = await buildSalesReport({ hotelId: ctx.hotelId, year, month, startSerial });

    if (req.nextUrl.searchParams.get("format") === "json") {
      return NextResponse.json({
        monthLabel: report.monthLabel,
        count: report.rows.length,
        totalRent: report.totalRent,
        totalGst: report.totalGst,
        lastSerial: report.rows.length ? report.rows[report.rows.length - 1].serial : startSerial - 1,
      });
    }

    const pdf = renderSalesReportPdf(report);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Sales_Report_${m[1]}-${m[2]}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[sales-report]", err);
    return NextResponse.json({ error: "Failed to generate the report" }, { status: 500 });
  }
}
