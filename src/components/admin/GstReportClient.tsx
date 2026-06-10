"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, Download, Loader2, Info } from "lucide-react";

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function prevMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 2, 1); // m-1 is this month, m-2 is previous
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function label(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

const SHEETS = [
  ["Summary", "Totals by tax rate + grand totals"],
  ["B2B", "Invoice-level rows for guests with a GSTIN"],
  ["B2C Small", "Unregistered-guest sales summarised by rate"],
  ["Exempt", "Rooms ≤ ₹1,000/night (nil-rated)"],
  ["HSN Summary", "By SAC 996311 and rate"],
  ["Documents", "Invoice/document series issued (GSTR-1 Table 13)"],
  ["Sales Register", "Every booking, line by line — invoiced or not"],
];

export default function GstReportClient({ gstin, legalName }: { gstin: string; legalName: string }) {
  const thisMonth = currentMonth();
  const [month, setMonth] = useState<string>(prevMonth(thisMonth)); // default: last completed month
  const [downloading, setDownloading] = useState(false);

  async function download() {
    setDownloading(true);
    try {
      const res = await fetch(`/api/admin/gst-report?month=${month}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to generate report");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `GST_Report_${month}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`GST report for ${label(month)} downloaded`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate report");
    } finally {
      setDownloading(false);
    }
  }

  const quick = [prevMonth(thisMonth), prevMonth(prevMonth(thisMonth)), prevMonth(prevMonth(prevMonth(thisMonth)))];

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <p className="text-amber-400/70 text-xs font-bold tracking-[0.2em] uppercase mb-1">Owner Console</p>
        <h1 className="text-2xl lg:text-3xl font-bold text-white flex items-center gap-2">
          <FileSpreadsheet className="w-6 h-6 text-emerald-400" /> GST Sales Report
        </h1>
        <p className="text-white/40 text-sm mt-1">
          Generate the monthly sales report for GST filing — exported as an editable Excel file.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 lg:p-6 mb-6">
        <div className="grid sm:grid-cols-2 gap-4 mb-4 text-xs">
          <div className="bg-white/3 border border-white/8 rounded-xl px-4 py-3">
            <p className="text-white/35 uppercase tracking-wider mb-0.5">GSTIN</p>
            <p className="text-white/80 font-mono">{gstin}</p>
          </div>
          <div className="bg-white/3 border border-white/8 rounded-xl px-4 py-3">
            <p className="text-white/35 uppercase tracking-wider mb-0.5">Legal Name</p>
            <p className="text-white/80">{legalName}</p>
          </div>
        </div>

        <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">
          Select month
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="month"
            value={month}
            max={thisMonth}
            onChange={(e) => setMonth(e.target.value)}
            className="bg-white/5 border border-white/12 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-400/50 [color-scheme:dark]"
          />
          <button
            onClick={download}
            disabled={downloading || !month}
            className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-black font-bold px-5 py-2.5 rounded-xl transition-all"
          >
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Download Excel
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          {quick.map((q) => (
            <button
              key={q}
              onClick={() => setMonth(q)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                month === q
                  ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                  : "bg-white/5 border-white/10 text-white/55 hover:text-white"
              }`}
            >
              {label(q)}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5 mb-6">
        <p className="text-white/55 text-sm font-semibold mb-3">The workbook contains</p>
        <div className="space-y-2">
          {SHEETS.map(([name, desc]) => (
            <div key={name} className="flex items-start gap-3 text-sm">
              <span className="text-emerald-400/80 font-semibold min-w-[110px]">{name}</span>
              <span className="text-white/40">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3.5">
          <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-emerald-200/80 text-xs leading-relaxed">
            <span className="font-bold">Every booking in the month is included</span> — you do
            <span className="font-bold"> not</span> need to generate invoice PDFs first. Bookings
            without a generated invoice appear with their booking reference.
            <br />
            <span className="font-bold">Reporting each invoice:</span> for guests who gave a{" "}
            <span className="font-semibold">GSTIN (B2B)</span>, each invoice is listed individually
            in the B2B sheet — that&apos;s how GSTR-1 needs it. For ordinary{" "}
            <span className="font-semibold">unregistered guests (B2C)</span>, GSTR-1 wants a
            <span className="font-semibold"> consolidated rate-wise summary</span>, not invoice-by-invoice
            — that&apos;s the B2C Small sheet.
          </p>
        </div>
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3.5">
          <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-amber-200/80 text-xs leading-relaxed">
            <span className="font-bold">Basis:</span> bookings with check-out in the selected month
            (Confirmed / Checked-in / Checked-out; Cancelled / No-show excluded). The ₹200 refundable
            deposit is excluded from taxable value. Review with your CA (especially advance-payment
            timing) before filing on the GST portal.
          </p>
        </div>
      </div>
    </div>
  );
}
