import ExcelJS from "exceljs";
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
 *  • The rent is the figure the guest was quoted and paid, and GST is inside
 *    it — ₹2,500 is ₹2,380.95 plus ₹119.05 of tax, not ₹2,500 plus ₹125. The
 *    tax is taken from the booking's own stored split wherever there is one, so
 *    this report and the guest's tax invoice can never state different tax for
 *    the same stay.
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

/**
 * What the stay is actually taxed at.
 *
 * Prefers the split already stored on the booking, which is what its invoice
 * prints — so the two documents agree by construction rather than by both
 * happening to recompute the same way. OTA bookings arrive without a split
 * (the channel's mail carries only a gross figure), so those are derived from
 * the same slab logic instead of being reported as tax-free.
 */
function taxOf(b: { totalAmount: number; taxableAmount: number; cgst: number; sgst: number; noOfNights: number }) {
  const stored = +(b.taxableAmount + b.cgst + b.sgst).toFixed(2);
  if (Math.abs(stored - b.totalAmount) <= 0.02 && b.taxableAmount > 0) {
    const gst = +(b.cgst + b.sgst).toFixed(2);
    return { taxable: +b.taxableAmount.toFixed(2), gst, ratePct: rateFor(b.totalAmount / Math.max(1, b.noOfNights)) };
  }
  // Split the gross directly rather than through the price helper: that one
  // snaps to the nearest legal whole-rupee total, which is right when quoting a
  // price but drops the paise off one that already exists — an OTA booking of
  // ₹1,529.10 would report a split adding up to ₹1,529. Dividing the tax back
  // out always reconciles, and matches the formula the workbook carries.
  const ratePct = rateFor(b.totalAmount / Math.max(1, b.noOfNights));
  const taxable = +(b.totalAmount / (1 + ratePct / 100)).toFixed(2);
  return { taxable, gst: +(b.totalAmount - taxable).toFixed(2), ratePct };
}

export interface SalesRow {
  serial: number;
  bookingRef: string;
  checkIn: Date;
  guest: string;
  /** What the guest paid for the room — GST included. */
  rent: number;
  /** The rent less the tax inside it. */
  taxable: number;
  ratePct: number;
  gst: number;
}

export interface SalesReport {
  rows: SalesRow[];
  totalRent: number;
  totalTaxable: number;
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
      taxableAmount: true, cgst: true, sgst: true,
      primaryGuest: { select: { name: true } },
    },
    // The advocate reads it as a diary, so it runs in stay order. The reference
    // breaks ties, keeping the numbering stable between two runs of the report.
    orderBy: [{ checkInDate: "asc" }, { bookingRef: "asc" }],
  });

  let totalRent = 0;
  let totalTaxable = 0;
  let totalGst = 0;
  const rows = bookings.map((b, i) => {
    const rent = +b.totalAmount.toFixed(2);
    const { taxable, gst, ratePct } = taxOf(b);
    totalRent += rent;
    totalTaxable += taxable;
    totalGst += gst;
    return {
      serial: params.startSerial + i,
      bookingRef: b.bookingRef,
      checkIn: b.checkInDate,
      guest: b.primaryGuest.name,
      rent,
      taxable,
      ratePct,
      gst,
    };
  });

  return {
    rows,
    totalRent: +totalRent.toFixed(2),
    totalTaxable: +totalTaxable.toFixed(2),
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
  doc.text(`${BUSINESS.legalName}  ·  GSTIN ${BUSINESS.gstin}  ·  rent shown is inclusive of GST`, 14, 21);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 25,
    // Taxable sits beside the rent because the tax is inside it now — without
    // that column the advocate would have to back it out of every line.
    head: [["Booking NO", "Checkin DT", "name", "Final rent", "Taxable", "GST (%)", "GST(Rs)"]],
    body: report.rows.map(r => [
      String(r.serial),
      ddmmyy(r.checkIn),
      r.guest,
      inr(r.rent),
      inr(r.taxable),
      `${r.ratePct}%`,
      r.gst === 0 ? "0" : inr(r.gst),
    ]),
    foot: [["", "", "TOTAL(Rs) :", inrTotal(report.totalRent), inrTotal(report.totalTaxable), "", inrTotal(report.totalGst)]],
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.4, textColor: 20, lineColor: [200, 200, 200] },
    headStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: "bold", fontSize: 8 },
    footStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: "bold", fontSize: 8 },
    columnStyles: {
      // 182mm across, which is exactly A4 between the default 14mm margins —
      // the name column takes whatever the six numeric ones do not need.
      0: { cellWidth: 20, halign: "left" },
      1: { cellWidth: 20 },
      2: { cellWidth: 54 },
      3: { cellWidth: 24, halign: "right" },
      4: { cellWidth: 24, halign: "right" },
      5: { cellWidth: 16, halign: "center" },
      6: { cellWidth: 24, halign: "right" },
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


/**
 * The same report as a workbook, so the owner can correct a name or a rent
 * before it goes on.
 *
 * The GST column and both totals are formulas rather than fixed numbers: edit a
 * rent and the tax and the totals follow. That matters here — the whole point
 * of sending Excel is that the sheet gets adjusted, and a hand-edited rent
 * sitting beside a stale tax figure is how a wrong return gets filed.
 */
export async function renderSalesReportXlsx(report: SalesReport): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = BUSINESS.legalName;
  wb.created = new Date();
  const ws = wb.addWorksheet(report.monthLabel, {
    views: [{ state: "frozen", ySplit: 4 }],
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  ws.columns = [
    { key: "serial", width: 12 },
    { key: "date", width: 13 },
    { key: "name", width: 34 },
    { key: "rent", width: 14 },
    { key: "taxable", width: 14 },
    { key: "rate", width: 10 },
    { key: "gst", width: 14 },
  ];

  const title = ws.addRow([`SALES REPORT - ${report.monthLabel}`]);
  title.font = { bold: true, size: 13 };
  ws.mergeCells("A1:G1");

  const sub = ws.addRow([`${BUSINESS.legalName}  ·  GSTIN ${BUSINESS.gstin}  ·  rent shown is inclusive of GST`]);
  sub.font = { size: 9, color: { argb: "FF666666" } };
  ws.mergeCells("A2:G2");

  ws.addRow([]);

  const head = ws.addRow(["Booking NO", "Checkin DT", "name", "Final rent", "Taxable", "GST (%)", "GST(Rs)"]);
  head.font = { bold: true, size: 10 };
  head.eachCell(c => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEBEBEB" } };
    c.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
  });

  const firstDataRow = head.number + 1;
  for (const r of report.rows) {
    const row = ws.addRow([
      r.serial,
      // A real date, so the column sorts and filters as one; displayed the way
      // the hand-made sheet shows it.
      new Date(Date.UTC(r.checkIn.getUTCFullYear(), r.checkIn.getUTCMonth(), r.checkIn.getUTCDate())),
      r.guest,
      r.rent,
      // The tax is inside the rent, so the taxable value is the rent divided
      // back out and the tax is what remains. Both stay formulas, so correcting
      // a rent carries the split with it.
      { formula: `ROUND(D${ws.rowCount + 1}/(1+F${ws.rowCount + 1}),2)`, result: r.taxable },
      r.ratePct / 100,
      { formula: `ROUND(D${ws.rowCount + 1}-E${ws.rowCount + 1},2)`, result: r.gst },
    ]);
    row.eachCell(c => {
      c.border = { top: { style: "hair" }, left: { style: "hair" }, bottom: { style: "hair" }, right: { style: "hair" } };
    });
  }
  const lastDataRow = ws.rowCount;

  const total = ws.addRow([
    null, null, "TOTAL(Rs) :",
    { formula: `SUM(D${firstDataRow}:D${lastDataRow})`, result: report.totalRent },
    { formula: `SUM(E${firstDataRow}:E${lastDataRow})`, result: report.totalTaxable },
    null,
    { formula: `SUM(G${firstDataRow}:G${lastDataRow})`, result: report.totalGst },
  ]);
  total.font = { bold: true };
  total.eachCell(c => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEBEBEB" } };
    c.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
  });

  ws.getColumn("date").numFmt = "dd/mm/yy";
  ws.getColumn("rent").numFmt = "#,##0.00";
  ws.getColumn("taxable").numFmt = "#,##0.00";
  ws.getColumn("gst").numFmt = "#,##0.00";
  ws.getColumn("rate").numFmt = "0%";
  ws.getColumn("rate").alignment = { horizontal: "center" };
  ws.getCell(`C${total.number}`).alignment = { horizontal: "right" };

  // Filters over the data so the owner can pull out one date or guest quickly.
  ws.autoFilter = { from: `A${head.number}`, to: `G${lastDataRow}` };

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}
