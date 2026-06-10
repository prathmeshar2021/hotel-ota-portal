import ExcelJS from "exceljs";
import { prisma } from "@/lib/db/prisma";
import { BUSINESS } from "@/lib/constants/business";
import { getCategoryMeta } from "@/lib/utils/room-categories";

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Hotel is in Chhattisgarh (state code 22). Accommodation place-of-supply is the
// hotel location, so every supply is intra-state (CGST + SGST).
const PLACE_OF_SUPPLY = "22-Chhattisgarh";
const SAC_CODE = "996311"; // Room/unit accommodation services
const SAC_DESC = "Accommodation services";
const MONEY = "#,##0.00";

interface Row {
  date: Date;
  invoiceNo: string;
  hasFormalInvoice: boolean;
  guest: string;
  gstin: string | null;
  room: string;
  nights: number;
  source: string;
  roomRent: number;
  discount: number;
  taxable: number;
  ratePct: number; // 0 | 5 | 18
  cgst: number;
  sgst: number;
  deposit: number;
  total: number;
  status: string;
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
  row.height = 18;
  row.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D1B0E" } };
    c.alignment = { vertical: "middle", wrapText: true };
  });
}

export async function generateGstReport(opts: {
  hotelId: string;
  year: number;
  month: number; // 1-12
}): Promise<{ buffer: Buffer; filename: string; rowCount: number }> {
  const { hotelId, year, month } = opts;
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  const bookings = await prisma.booking.findMany({
    where: {
      hotelId,
      status: { in: ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] },
      checkOutDate: { gte: start, lt: end },
    },
    include: {
      primaryGuest: { select: { name: true } },
      room: { select: { roomNumber: true } },
      gstInvoice: { select: { invoiceNumber: true, generatedAt: true } },
    },
    orderBy: { checkOutDate: "asc" },
  });

  const rows: Row[] = bookings.map((b) => {
    const taxable = b.taxableAmount;
    const ratePct = taxable > 0 ? Math.round(((b.cgst + b.sgst) / taxable) * 100) : 0;
    return {
      date: b.gstInvoice?.generatedAt ?? b.checkOutDate,
      invoiceNo: b.gstInvoice?.invoiceNumber ?? b.bookingRef,
      hasFormalInvoice: !!b.gstInvoice,
      guest: b.primaryGuest.name,
      gstin: b.guestGstin?.trim() || null,
      room: b.room?.roomNumber ?? getCategoryMeta(b.roomCategory)?.displayName ?? b.roomCategory,
      nights: b.noOfNights,
      source: b.source,
      roomRent: b.roomRent,
      discount: b.couponDiscount,
      taxable,
      ratePct,
      cgst: b.cgst,
      sgst: b.sgst,
      deposit: b.refundableDeposit,
      total: b.totalAmount,
      status: b.status,
    };
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = BUSINESS.brand;
  wb.created = new Date();

  // ── Summary sheet ──
  const sum = wb.addWorksheet("Summary");
  sum.columns = [{ width: 32 }, { width: 18 }, { width: 16 }, { width: 16 }, { width: 18 }];
  const title = sum.addRow([`${BUSINESS.brand} — GST Sales Report`]);
  title.font = { bold: true, size: 14 };
  sum.addRow([`${MONTHS[month - 1]} ${year}`]).font = { bold: true, size: 11, color: { argb: "FF8A6A00" } };
  sum.addRow([`GSTIN: ${BUSINESS.gstin}`]);
  sum.addRow([`Legal name: ${BUSINESS.legalName} (${BUSINESS.entityType})`]);
  sum.addRow([`Place of supply: ${PLACE_OF_SUPPLY}`]);
  sum.addRow([`Generated: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`]);
  sum.addRow([]);

  const totalTaxable = rows.reduce((s, r) => s + r.taxable, 0);
  const totalCgst = rows.reduce((s, r) => s + r.cgst, 0);
  const totalSgst = rows.reduce((s, r) => s + r.sgst, 0);
  const totalInvoiceValue = rows.reduce((s, r) => s + r.total, 0);

  const totHead = sum.addRow(["Rate", "Invoices", "Taxable Value", "CGST", "SGST"]);
  styleHeader(totHead);
  for (const rate of [0, 5, 18]) {
    const rr = rows.filter((r) => r.ratePct === rate);
    if (rr.length === 0) continue;
    sum.addRow([
      rate === 0 ? "0% (Exempt)" : `${rate}%`,
      rr.length,
      rr.reduce((s, r) => s + r.taxable, 0),
      rr.reduce((s, r) => s + r.cgst, 0),
      rr.reduce((s, r) => s + r.sgst, 0),
    ]);
  }
  const totRow = sum.addRow(["TOTAL", rows.length, totalTaxable, totalCgst, totalSgst]);
  totRow.font = { bold: true };
  sum.addRow([]);
  sum.addRow(["Total Tax (CGST + SGST)", "", totalCgst + totalSgst]).font = { bold: true };
  sum.addRow(["Total Invoice Value (incl. deposit)", "", totalInvoiceValue]).font = { bold: true };
  sum.addRow([]);
  const note = sum.addRow([
    "Basis: bookings with check-out in this month (status Confirmed / Checked-in / Checked-out). " +
      "The ₹ refundable deposit is not a taxable supply and is excluded from taxable value. " +
      "Verify with your CA before filing on the GST portal.",
  ]);
  note.font = { italic: true, size: 9, color: { argb: "FF777777" } };
  sum.getColumn(3).numFmt = MONEY;
  sum.getColumn(4).numFmt = MONEY;
  sum.getColumn(5).numFmt = MONEY;

  // ── B2B sheet (customer has GSTIN) ──
  const b2b = wb.addWorksheet("B2B");
  b2b.columns = [
    { header: "GSTIN of Recipient", key: "gstin", width: 20 },
    { header: "Receiver Name", key: "name", width: 22 },
    { header: "Invoice Number", key: "inv", width: 18 },
    { header: "Invoice Date", key: "date", width: 14 },
    { header: "Invoice Value", key: "val", width: 14 },
    { header: "Place of Supply", key: "pos", width: 16 },
    { header: "Reverse Charge", key: "rc", width: 13 },
    { header: "Invoice Type", key: "type", width: 14 },
    { header: "Rate", key: "rate", width: 8 },
    { header: "Taxable Value", key: "taxable", width: 14 },
    { header: "CGST", key: "cgst", width: 12 },
    { header: "SGST", key: "sgst", width: 12 },
  ];
  styleHeader(b2b.getRow(1));
  rows
    .filter((r) => r.gstin)
    .forEach((r) => {
      b2b.addRow({
        gstin: r.gstin, name: r.guest, inv: r.invoiceNo,
        date: r.date.toISOString().slice(0, 10), val: r.total,
        pos: PLACE_OF_SUPPLY, rc: "N", type: "Regular",
        rate: r.ratePct, taxable: r.taxable, cgst: r.cgst, sgst: r.sgst,
      });
    });
  ["val", "taxable", "cgst", "sgst"].forEach((k) => (b2b.getColumn(k).numFmt = MONEY));

  // ── B2C (Small) summary — unregistered customers, by rate ──
  const b2cs = wb.addWorksheet("B2C Small");
  b2cs.columns = [
    { header: "Type", key: "type", width: 8 },
    { header: "Place of Supply", key: "pos", width: 18 },
    { header: "Rate", key: "rate", width: 8 },
    { header: "Taxable Value", key: "taxable", width: 16 },
    { header: "CGST", key: "cgst", width: 14 },
    { header: "SGST", key: "sgst", width: 14 },
  ];
  styleHeader(b2cs.getRow(1));
  for (const rate of [5, 18]) {
    const rr = rows.filter((r) => !r.gstin && r.ratePct === rate);
    if (rr.length === 0) continue;
    b2cs.addRow({
      type: "OE", pos: PLACE_OF_SUPPLY, rate,
      taxable: rr.reduce((s, r) => s + r.taxable, 0),
      cgst: rr.reduce((s, r) => s + r.cgst, 0),
      sgst: rr.reduce((s, r) => s + r.sgst, 0),
    });
  }
  ["taxable", "cgst", "sgst"].forEach((k) => (b2cs.getColumn(k).numFmt = MONEY));

  // ── Exempt / Nil-rated summary (rooms ≤ ₹1,000/night) ──
  const exemptRows = rows.filter((r) => r.ratePct === 0);
  const exempt = wb.addWorksheet("Exempt");
  exempt.columns = [
    { header: "Description", key: "desc", width: 34 },
    { header: "Nil Rated / Exempt Value", key: "val", width: 24 },
  ];
  styleHeader(exempt.getRow(1));
  exempt.addRow({
    desc: "Exempt accommodation (tariff ≤ ₹1,000/night)",
    val: exemptRows.reduce((s, r) => s + r.taxable, 0),
  });
  exempt.getColumn("val").numFmt = MONEY;

  // ── HSN / SAC summary (Table 12) ──
  const hsn = wb.addWorksheet("HSN Summary");
  hsn.columns = [
    { header: "HSN/SAC", key: "sac", width: 12 },
    { header: "Description", key: "desc", width: 24 },
    { header: "UQC", key: "uqc", width: 8 },
    { header: "Total Qty (nights)", key: "qty", width: 16 },
    { header: "Rate", key: "rate", width: 8 },
    { header: "Total Value", key: "val", width: 16 },
    { header: "Taxable Value", key: "taxable", width: 16 },
    { header: "CGST", key: "cgst", width: 12 },
    { header: "SGST", key: "sgst", width: 12 },
  ];
  styleHeader(hsn.getRow(1));
  for (const rate of [0, 5, 18]) {
    const rr = rows.filter((r) => r.ratePct === rate);
    if (rr.length === 0) continue;
    hsn.addRow({
      sac: SAC_CODE, desc: SAC_DESC, uqc: "OTH",
      qty: rr.reduce((s, r) => s + r.nights, 0),
      rate,
      val: rr.reduce((s, r) => s + r.taxable + r.cgst + r.sgst, 0),
      taxable: rr.reduce((s, r) => s + r.taxable, 0),
      cgst: rr.reduce((s, r) => s + r.cgst, 0),
      sgst: rr.reduce((s, r) => s + r.sgst, 0),
    });
  }
  ["val", "taxable", "cgst", "sgst"].forEach((k) => (hsn.getColumn(k).numFmt = MONEY));

  // ── Detailed sales register ──
  const reg = wb.addWorksheet("Sales Register");
  reg.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "Invoice / Ref", key: "inv", width: 18 },
    { header: "Formal Invoice?", key: "formal", width: 14 },
    { header: "Guest", key: "guest", width: 20 },
    { header: "GSTIN", key: "gstin", width: 18 },
    { header: "Room", key: "room", width: 14 },
    { header: "Nights", key: "nights", width: 8 },
    { header: "Source", key: "source", width: 12 },
    { header: "Room Rent", key: "rent", width: 12 },
    { header: "Discount", key: "disc", width: 12 },
    { header: "Taxable", key: "taxable", width: 12 },
    { header: "Rate %", key: "rate", width: 8 },
    { header: "CGST", key: "cgst", width: 11 },
    { header: "SGST", key: "sgst", width: 11 },
    { header: "Deposit", key: "deposit", width: 11 },
    { header: "Total", key: "total", width: 12 },
    { header: "Status", key: "status", width: 13 },
  ];
  styleHeader(reg.getRow(1));
  rows.forEach((r) => {
    reg.addRow({
      date: r.date.toISOString().slice(0, 10),
      inv: r.invoiceNo,
      formal: r.hasFormalInvoice ? "Yes" : "No",
      guest: r.guest, gstin: r.gstin ?? "—", room: r.room,
      nights: r.nights, source: r.source,
      rent: r.roomRent, disc: r.discount, taxable: r.taxable,
      rate: r.ratePct, cgst: r.cgst, sgst: r.sgst,
      deposit: r.deposit, total: r.total, status: r.status,
    });
  });
  ["rent", "disc", "taxable", "cgst", "sgst", "deposit", "total"].forEach(
    (k) => (reg.getColumn(k).numFmt = MONEY)
  );
  reg.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const filename = `GST_Report_${BUSINESS.brand.replace(/\s+/g, "_")}_${MONTHS[month - 1]}_${year}.xlsx`;
  return { buffer, filename, rowCount: rows.length };
}
