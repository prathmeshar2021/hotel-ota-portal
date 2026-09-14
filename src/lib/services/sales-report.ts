import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { prisma } from "@/lib/db/prisma";
import { BUSINESS } from "@/lib/constants/business";
import { MONTHS } from "@/lib/services/gst-report";

/**
 * The monthly sales report the owner sends to the GST advocate.
 *
 * Deliberately a like-for-like replacement for the sheet that has been sent by
 * hand until now — same columns, same order, same totals line — so the advocate
 * receives what they already know how to read.
 *
 * Two things follow that sheet rather than the rest of this codebase:
 *
 *  • GST is charged ON the rent, not extracted from it. ₹2,500 at 5% is ₹125
 *    here, where a tax invoice from this system would read ₹119.05 on a taxable
 *    value of ₹2,380.95. That is the filing practice the hotel has used, so
 *    changing it would put a break in their return history — but it does mean
 *    the two documents state different tax on the same stay.
 *
 *  • The serial in the first column is the advocate's running number, not this
 *    system's booking reference. It continues across months, so the caller says
 *    where the month starts.
 */

/** ≤₹1,000 a night is exempt; above that, 5% up to ₹7,500, then 18%. */
function rateFor(rentPerNight: number): number {
  if (rentPerNight <= 1000) return 0;
  if (rentPerNight <= 7500) return 5;
  return 18;
}

export interface SalesRow {
  serial: number;
  bookingRef: string;
  checkIn: Date;
  guest: string;
  rent: number;
  ratePct: number;
  gst: number;
}

export interface SalesReport {
  rows: SalesRow[];
  totalRent: number;
  totalGst: number;
  monthLabel: string;
}

export async function buildSalesReport(params: {
  hotelId: string;
  year: number;
  month: number; // 1-12
  startSerial: number;
}): Promise<SalesReport> {
  const from = new Date(Date.UTC(params.year, params.month - 1, 1));
  const to = new Date(Date.UTC(params.year, params.month, 1));

  const bookings = await prisma.booking.findMany({
    where: {
      hotelId: params.hotelId,
      checkInDate: { gte: from, lt: to },
      // A stay that never happened is not a sale. Everything else counts,
      // including OTA bookings — the hotel supplied the room either way.
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
    },
    select: {
      bookingRef: true, checkInDate: true, totalAmount: true, noOfNights: true,
      primaryGuest: { select: { name: true } },
    },
    // The advocate reads it as a diary, so it runs in stay order. The reference
    // breaks ties, keeping the numbering stable between two runs of the report.
    orderBy: [{ checkInDate: "asc" }, { bookingRef: "asc" }],
  });

  let totalRent = 0;
  let totalGst = 0;
  const rows = bookings.map((b, i) => {
    const rent = +b.totalAmount.toFixed(2);
    // The slab is set by the nightly rate, but the tax is charged on the whole
    // stay — a two-night booking at ₹900 a night is exempt, not taxed at 5%
    // because the total crossed ₹1,000.
    const ratePct = rateFor(rent / Math.max(1, b.noOfNights));
    const gst = +(rent * ratePct / 100).toFixed(2);
    totalRent += rent;
    totalGst += gst;
    return {
      serial: params.startSerial + i,
      bookingRef: b.bookingRef,
      checkIn: b.checkInDate,
      guest: b.primaryGuest.name,
      rent,
      ratePct,
      gst,
    };
  });

  return {
    rows,
    totalRent: +totalRent.toFixed(2),
    totalGst: +totalGst.toFixed(2),
    monthLabel: `${MONTHS[params.month - 1].toUpperCase()} ${params.year}`,
  };
}

/** Dates print as dd/mm/yy, as the hand-made sheet does. */
function ddmmyy(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${String(d.getUTCFullYear()).slice(2)}`;
}

const inr = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** Totals always carry both paise, so a month ending in .10 never reads ".1". */
const inrTotal = (n: number) =>
  Number.isInteger(n)
    ? n.toLocaleString("en-IN")
    : n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function renderSalesReportPdf(report: SalesReport): ArrayBuffer {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(`SALES REPORT - ${report.monthLabel}`, 14, 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(110);
  doc.text(`${BUSINESS.legalName}  ·  GSTIN ${BUSINESS.gstin}`, 14, 21);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 25,
    head: [["Booking NO", "Checkin DT", "name", "Final rent", "GST (%)", "GST(Rs)"]],
    body: report.rows.map(r => [
      String(r.serial),
      ddmmyy(r.checkIn),
      r.guest,
      inr(r.rent),
      `${r.ratePct}%`,
      r.gst === 0 ? "0" : inr(r.gst),
    ]),
    foot: [["", "", "TOTAL(Rs) :", inrTotal(report.totalRent), "", inrTotal(report.totalGst)]],
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.4, textColor: 20, lineColor: [200, 200, 200] },
    headStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: "bold", fontSize: 8 },
    footStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: "bold", fontSize: 8 },
    columnStyles: {
      // 182mm across, which is exactly A4 between the default 14mm margins —
      // the name column takes whatever the five numeric ones do not need.
      0: { cellWidth: 22, halign: "left" },
      1: { cellWidth: 22 },
      2: { cellWidth: 68 },
      3: { cellWidth: 26, halign: "right" },
      4: { cellWidth: 18, halign: "center" },
      5: { cellWidth: 26, halign: "right" },
    },
    // A page number in the same place the old sheet carried one.
    didDrawPage: data => {
      const page = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.text(String(page), data.settings.margin.left, doc.internal.pageSize.getHeight() - 8);
    },
  });

  return doc.output("arraybuffer");
}
