import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/superAdmin";
import { buildSalesReport, renderSalesReportPdf, renderSalesReportXlsx } from "@/lib/services/sales-report";

// GET /api/admin/sales-report?month=YYYY-MM&start=1650
//   → the monthly sales report for the GST advocate, as .xlsx by default so it
//     can be corrected before it is sent on.
//   &format=pdf   to send it as-is
//   &format=json  to read the figures without downloading anything
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

    const name = `Sales_Report_${m[1]}-${m[2]}`;

    if (req.nextUrl.searchParams.get("format") === "pdf") {
      const pdf = renderSalesReportPdf(report);
      return new NextResponse(new Uint8Array(pdf), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${name}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const xlsx = await renderSalesReportXlsx(report);
    return new NextResponse(new Uint8Array(xlsx), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[sales-report]", err);
    return NextResponse.json({ error: "Failed to generate the report" }, { status: 500 });
  }
}
