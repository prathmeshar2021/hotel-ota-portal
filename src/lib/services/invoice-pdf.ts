import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

export interface InvoicePdfData {
  invoiceNumber: string;
  invoiceDate: Date;
  seller: {
    name: string;
    legalName: string;
    gstin: string;
    addressLines: string[];
    phone: string;
    email: string;
  };
  customer: { name: string; phone: string; gstin?: string | null };
  stay: { bookingRef: string; roomNo: string; checkIn: Date; checkOut: Date; nights: number };
  amounts: {
    roomRent: number;
    couponDiscount: number;
    taxableAmount: number;
    cgst: number;
    sgst: number;
    gstRatePct: number; // combined CGST+SGST rate, e.g. 5
    deposit: number;
    totalAmount: number;
  };
}

// jsPDF's built-in fonts don't carry the ₹ glyph, so use "Rs." in the PDF.
const rs = (n: number) => "Rs. " + Math.round(n).toLocaleString("en-IN");

/** Render a GST tax invoice to PDF bytes (works server-side in the Node runtime). */
export function generateInvoicePdf(d: InvoicePdfData): Uint8Array {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const M = 14;
  let y = 18;

  // ── Seller header ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text(d.seller.name, M, y);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("TAX INVOICE", pageW - M, y, { align: "right" });

  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  const sellerLines = [
    d.seller.legalName,
    ...d.seller.addressLines,
    `GSTIN: ${d.seller.gstin}`,
    `${d.seller.phone}  |  ${d.seller.email}`,
  ];
  sellerLines.forEach((line) => {
    doc.text(line, M, y);
    y += 4.5;
  });

  // Invoice meta (right column)
  doc.setTextColor(40);
  doc.setFontSize(9);
  doc.text(`Invoice No:  ${d.invoiceNumber}`, pageW - M, 24, { align: "right" });
  doc.text(`Date:  ${format(d.invoiceDate, "dd MMM yyyy")}`, pageW - M, 28.5, { align: "right" });

  y += 3;
  doc.setDrawColor(220);
  doc.line(M, y, pageW - M, y);
  y += 7;

  // ── Bill To + Stay details (two columns) ──
  const colR = pageW / 2 + 4;
  doc.setFontSize(9.5);
  doc.setTextColor(120);
  doc.setFont("helvetica", "bold");
  doc.text("BILL TO", M, y);
  doc.text("STAY DETAILS", colR, y);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(40);
  let yl = y + 5;
  doc.text(d.customer.name, M, yl);
  yl += 4.5;
  doc.text(`Phone: ${d.customer.phone}`, M, yl);
  if (d.customer.gstin) {
    yl += 4.5;
    doc.text(`GSTIN: ${d.customer.gstin}`, M, yl);
  }

  let yr = y + 5;
  const stayRows = [
    `Booking Ref: ${d.stay.bookingRef}`,
    `Room: ${d.stay.roomNo}`,
    `Check-in:  ${format(d.stay.checkIn, "dd MMM yyyy")}`,
    `Check-out: ${format(d.stay.checkOut, "dd MMM yyyy")}`,
    `Nights: ${d.stay.nights}`,
  ];
  stayRows.forEach((line) => {
    doc.text(line, colR, yr);
    yr += 4.5;
  });

  const tableY = Math.max(yl, yr) + 8;

  // ── Line-items table ──
  const half = +(d.amounts.gstRatePct / 2).toFixed(2); // CGST = SGST = half of combined
  const lineTotal = d.amounts.taxableAmount + d.amounts.cgst + d.amounts.sgst;

  autoTable(doc, {
    startY: tableY,
    head: [["Description", "Taxable Value", `CGST (${half}%)`, `SGST (${half}%)`, "Amount"]],
    body: [
      [
        `Room charges — ${d.stay.nights} night(s)` +
          (d.amounts.couponDiscount > 0 ? `  (after Rs. ${Math.round(d.amounts.couponDiscount).toLocaleString("en-IN")} discount)` : ""),
        rs(d.amounts.taxableAmount),
        rs(d.amounts.cgst),
        rs(d.amounts.sgst),
        rs(lineTotal),
      ],
    ],
    theme: "grid",
    headStyles: { fillColor: [13, 27, 14], textColor: 255, fontSize: 8.5, halign: "right" },
    bodyStyles: { fontSize: 8.5, halign: "right", textColor: 40 },
    columnStyles: { 0: { halign: "left", cellWidth: 70 } },
    margin: { left: M, right: M },
  });

  // ── Totals ──
  // @ts-expect-error — autoTable augments the doc instance at runtime
  let ty: number = (doc.lastAutoTable?.finalY ?? tableY) + 8;
  const labelX = pageW - M - 55;
  const valX = pageW - M;

  const totalRow = (label: string, value: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 11 : 9.5);
    doc.text(label, labelX, ty);
    doc.text(value, valX, ty, { align: "right" });
    ty += bold ? 7 : 5.5;
  };

  doc.setTextColor(40);
  totalRow("Taxable Value", rs(d.amounts.taxableAmount));
  totalRow(`CGST (${half}%)`, rs(d.amounts.cgst));
  totalRow(`SGST (${half}%)`, rs(d.amounts.sgst));
  if (d.amounts.deposit > 0) totalRow("Refundable Deposit (no GST)", rs(d.amounts.deposit));
  doc.setDrawColor(200);
  doc.line(labelX, ty - 2, valX, ty - 2);
  ty += 2;
  totalRow("Grand Total", rs(d.amounts.totalAmount), true);

  // ── Footer ──
  const footY = doc.internal.pageSize.getHeight() - 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(130);
  doc.text("This is a computer-generated invoice and does not require a signature.", M, footY);
  doc.text(
    "The refundable security deposit is not a taxable supply and is refunded at check-out.",
    M,
    footY + 4
  );
  doc.text(`Thank you for staying with ${d.seller.name}.`, M, footY + 8);

  return doc.output("arraybuffer") as unknown as Uint8Array;
}
