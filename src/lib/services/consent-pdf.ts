import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { fmtIST } from "@/lib/utils/datetime";

/**
 * Guest Registration & Consent Form.
 *
 * Serves two legal purposes on one page:
 *  1. The guest register hotels must maintain (name, address, ID, arrival/
 *     departure, coming-from/going-to, purpose, vehicle, accompanying persons)
 *     for police/municipal compliance.
 *  2. A Digital Personal Data Protection Act, 2023 notice + consent for the
 *     collection, processing and lawful sharing of the guest's personal data.
 *
 * Rendered server-side to PDF bytes. Printed for a wet signature at the desk,
 * or sent on WhatsApp / a secure link for paperless electronic acceptance.
 */

const ID_LABELS: Record<string, string> = {
  AADHAR: "Aadhaar Card",
  DRIVING_LICENSE: "Driving License",
  PASSPORT: "Passport",
  VOTER_ID: "Voter ID",
  OTHER: "Other ID",
};

const GENDER_LABELS: Record<string, string> = {
  MALE: "Male",
  FEMALE: "Female",
  OTHER: "Other",
};

export interface ConsentPdfData {
  hotel: {
    brand: string;
    legalName: string;
    gstin?: string | null;
    addressLines: string[];
    phone: string;
    email: string;
  };
  booking: {
    ref: string;
    roomNo: string;
    checkIn: Date;
    checkOut: Date;
    nights: number;
    persons: number;
  };
  primary: {
    name: string;
    gender?: string | null;
    dob?: Date | null;
    nationality?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    occupation?: string | null;
    idType?: string | null;
    idNumber?: string | null;
    comingFrom?: string | null;
    goingTo?: string | null;
    purpose?: string | null;
    vehicleNo?: string | null;
  };
  companions: {
    name: string;
    relation?: string | null;
    idType?: string | null;
    idNumber?: string | null;
  }[];
  /** Set only when the guest genuinely accepted electronically via WhatsApp/link. */
  electronicAcceptedAt?: Date | null;
  /** Set when staff confirmed a physically-signed copy was received. */
  paperVerifiedAt?: Date | null;
  /** Name of the staff member who verified the signed copy. */
  verifiedByName?: string | null;
}

const dash = (v?: string | null) => (v && String(v).trim() ? String(v).trim() : "—");

export function generateConsentPdf(d: ConsentPdfData): Uint8Array {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 14;
  const colR = pageW / 2 + 2;
  let y = 16;

  // ── Hotel header ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(20);
  doc.text(d.hotel.brand, M, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(90);
  let hy = y + 5;
  const headerLines = [
    d.hotel.legalName,
    ...d.hotel.addressLines,
    d.hotel.gstin ? `GSTIN: ${d.hotel.gstin}` : null,
    `${d.hotel.phone}  |  ${d.hotel.email}`,
  ].filter(Boolean) as string[];
  headerLines.forEach((line) => {
    doc.text(line, M, hy);
    hy += 3.8;
  });

  // Title (right)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20);
  doc.text("GUEST REGISTRATION", pageW - M, y, { align: "right" });
  doc.text("& CONSENT FORM", pageW - M, y + 5, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(120);
  doc.text(`Printed: ${fmtIST(new Date(), "dd MMM yyyy, hh:mm a")}`, pageW - M, y + 10, {
    align: "right",
  });

  y = hy + 2;
  doc.setDrawColor(210);
  doc.line(M, y, pageW - M, y);
  y += 6;

  // ── Section heading helper ──
  const sectionHeading = (label: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(255);
    doc.setFillColor(20, 40, 22);
    doc.rect(M, y - 3.6, pageW - 2 * M, 5.2, "F");
    doc.text(label, M + 2, y);
    doc.setTextColor(40);
    y += 5.5;
  };

  // labelled field: "Label: value" — x is column start, w is column width
  const field = (label: string, value: string, x: number, yy: number, w: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(70);
    const labelW = doc.getTextWidth(label + ": ");
    doc.text(`${label}:`, x, yy);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30);
    const lines = doc.splitTextToSize(value, w - labelW - 1);
    doc.text(lines, x + labelW, yy);
    return lines.length;
  };

  // ── A. Stay details ──
  sectionHeading("A.  STAY DETAILS");
  const colW = (pageW - 2 * M) / 2 - 2;
  field("Booking Ref", d.booking.ref, M, y, colW);
  field("Room", d.booking.roomNo, colR, y, colW);
  y += 4.6;
  field("Check-in", format(d.booking.checkIn, "dd MMM yyyy"), M, y, colW);
  field("Check-out", format(d.booking.checkOut, "dd MMM yyyy"), colR, y, colW);
  y += 4.6;
  field("No. of Nights", String(d.booking.nights), M, y, colW);
  field("Total Guests", String(d.booking.persons), colR, y, colW);
  y += 6.5;

  // ── B. Primary guest ──
  sectionHeading("B.  PRIMARY GUEST DETAILS");
  field("Name", dash(d.primary.name), M, y, colW);
  field("Gender", d.primary.gender ? GENDER_LABELS[d.primary.gender] ?? dash(d.primary.gender) : "—", colR, y, colW);
  y += 4.6;
  field("Nationality", dash(d.primary.nationality) === "—" ? "Indian" : dash(d.primary.nationality), M, y, colW);
  field("Date of Birth", d.primary.dob ? format(d.primary.dob, "dd MMM yyyy") : "—", colR, y, colW);
  y += 4.6;
  const addrLines = field("Address", dash(d.primary.address), M, y, pageW - 2 * M);
  y += 4.6 * Math.max(1, addrLines);
  field("Phone", dash(d.primary.phone), M, y, colW);
  field("Email", dash(d.primary.email), colR, y, colW);
  y += 4.6;
  field("Occupation", dash(d.primary.occupation), M, y, colW);
  field(
    "ID Proof",
    d.primary.idType
      ? `${ID_LABELS[d.primary.idType] ?? d.primary.idType} — ${dash(d.primary.idNumber)}`
      : "—",
    colR,
    y,
    colW,
  );
  y += 4.6;
  field("Coming From", dash(d.primary.comingFrom), M, y, colW);
  field("Going To", dash(d.primary.goingTo), colR, y, colW);
  y += 4.6;
  field("Purpose of Visit", dash(d.primary.purpose), M, y, colW);
  field("Vehicle No.", dash(d.primary.vehicleNo), colR, y, colW);
  y += 6.5;

  // ── C. Accompanying guests ──
  sectionHeading("C.  ACCOMPANYING GUEST(S)");
  if (d.companions.length) {
    autoTable(doc, {
      startY: y,
      head: [["#", "Name", "Relation", "ID Proof", "ID Number"]],
      body: d.companions.map((c, i) => [
        String(i + 1),
        dash(c.name),
        dash(c.relation),
        c.idType ? ID_LABELS[c.idType] ?? c.idType : "—",
        dash(c.idNumber),
      ]),
      theme: "grid",
      headStyles: { fillColor: [40, 60, 42], textColor: 255, fontSize: 7.5 },
      bodyStyles: { fontSize: 7.5, textColor: 40 },
      columnStyles: { 0: { cellWidth: 8, halign: "center" } },
      margin: { left: M, right: M },
    });
    // @ts-expect-error — autoTable augments the doc instance at runtime
    y = (doc.lastAutoTable?.finalY ?? y) + 6;
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text("No accompanying guests declared.", M + 1, y);
    y += 6;
  }

  // ── D. Declaration & consent ──
  sectionHeading("D.  DECLARATION & CONSENT");
  const declarations = [
    "I declare that the information furnished above is true and correct, and that I have been allotted the accommodation stated above.",
    "I consent to the collection and processing of my personal data (including identity-proof details) by the hotel for guest registration, safety and security, billing and legal compliance, in accordance with the Digital Personal Data Protection Act, 2023.",
    "I consent to the hotel sharing this information with the police and other government or statutory authorities as and when required under applicable law.",
    "I agree to abide by the hotel's rules, policies and check-out time, and I am responsible for the conduct of all accompanying guests listed above.",
    "I understand my data will be retained only as long as necessary for the above purposes or as required by law, and that I may withdraw consent or raise a grievance by contacting the hotel (withdrawal will not affect processing already carried out or required by law).",
    "The hotel is not responsible for the loss of cash, jewellery or valuables not deposited at the reception.",
  ];
  doc.setFontSize(7.6);
  declarations.forEach((text, i) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(40);
    doc.text(`${i + 1}.`, M + 1, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(55);
    const lines = doc.splitTextToSize(text, pageW - 2 * M - 6);
    doc.text(lines, M + 6, y);
    y += lines.length * 3.5 + 1.4;
  });

  y += 2;

  // ── Acceptance / signatures ──
  // Only a genuine electronic acceptance (WhatsApp / secure link) replaces the
  // wet signatures with an e-acceptance stamp. A printed copy — even one whose
  // physical signature was later logged by staff — always shows signature lines.
  if (d.electronicAcceptedAt) {
    doc.setFillColor(235, 247, 236);
    doc.setDrawColor(160, 200, 165);
    doc.roundedRect(M, y - 3.5, pageW - 2 * M, 12, 1.2, 1.2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(30, 110, 45);
    doc.text(
      `Accepted electronically by the primary guest on ${fmtIST(d.electronicAcceptedAt, "dd MMM yyyy, hh:mm a")}.`,
      M + 3,
      y + 1.6,
    );
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(70, 120, 80);
    doc.text(
      "Valid under the Information Technology Act, 2000 (Sec. 10A) and the DPDP Act, 2023. " +
        "Physical signatures not required for electronic acceptance.",
      M + 3,
      y + 5.4,
      { maxWidth: pageW - 2 * M - 6 },
    );
  } else {
    // Wet-signature block: primary guest + every accompanying guest signs.
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(50);
    doc.text("Signatures", M, y);
    y += 6;

    const signers = ["Primary Guest — " + dash(d.primary.name)].concat(
      d.companions.map((c, i) => `Guest ${i + 2} — ${dash(c.name)}`),
    );
    const sigColW = (pageW - 2 * M) / 2;
    const lineLen = sigColW - 12;
    doc.setDrawColor(120);
    signers.forEach((label, i) => {
      const col = i % 2;
      const x = M + col * sigColW;
      if (col === 0 && i > 0) y += 13; // new row before the left column
      const lineY = y + 8;
      doc.line(x, lineY, x + lineLen, lineY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(70);
      doc.text(label, x, lineY + 3.5, { maxWidth: lineLen });
    });
    // advance past the last row
    y += 13;

    // Office use / staff verification line.
    const officeY = y + 8;
    doc.setDrawColor(120);
    doc.line(M, officeY, M + lineLen, officeY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(70);
    doc.text("For Office Use — ID Verified / Staff Signature", M, officeY + 3.5);

    if (d.paperVerifiedAt) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(6.8);
      doc.setTextColor(30, 110, 45);
      const verifier = d.verifiedByName?.trim() ? d.verifiedByName.trim() : "staff";
      doc.text(
        `Signed copy received & verified by ${verifier} on ${fmtIST(d.paperVerifiedAt, "dd MMM yyyy, hh:mm a")}.`,
        colR,
        officeY + 3.5,
        { maxWidth: pageW / 2 - M },
      );
    }
  }

  // ── Footer ──
  const footY = pageH - 10;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(6.5);
  doc.setTextColor(140);
  doc.text(
    "Foreign nationals must additionally complete Form C under the Registration of Foreigners Rules, 1992. " +
      "This is a guest register cum data-protection consent record.",
    M,
    footY,
    { maxWidth: pageW - 2 * M },
  );

  return doc.output("arraybuffer") as unknown as Uint8Array;
}
