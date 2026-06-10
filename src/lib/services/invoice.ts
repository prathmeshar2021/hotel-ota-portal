import { prisma } from "@/lib/db/prisma";
import { generateInvoiceNumber } from "@/lib/utils/booking";
import { getCategoryMeta } from "@/lib/utils/room-categories";
import { BUSINESS } from "@/lib/constants/business";
import { generateInvoicePdf, type InvoicePdfData } from "@/lib/services/invoice-pdf";
import type { GstInvoice } from "@prisma/client";

/**
 * Idempotently create (or fetch) the GST invoice record for a booking.
 * Snapshots the amounts actually charged so the invoice is immutable and always
 * reconciles with what the guest paid.
 */
export async function ensureGstInvoice(bookingId: string): Promise<GstInvoice> {
  const existing = await prisma.gstInvoice.findUnique({ where: { bookingId } });
  if (existing) return existing;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      primaryGuest: { select: { name: true, phone: true } },
      room: { select: { roomNumber: true } },
    },
  });
  if (!booking) throw new Error("Booking not found");

  const roomNo =
    booking.room?.roomNumber ?? getCategoryMeta(booking.roomCategory).displayName;

  return prisma.gstInvoice.create({
    data: {
      bookingId: booking.id,
      invoiceNumber: await generateInvoiceNumber(),
      customerName: booking.primaryGuest.name,
      customerPhone: booking.primaryGuest.phone ?? "",
      customerGstin: booking.guestGstin ?? null,
      roomNo,
      checkIn: booking.checkInDate,
      checkOut: booking.checkOutDate,
      roomRent: booking.roomRent,
      additionalCharges: booking.additionalCharges,
      couponDiscount: booking.couponDiscount,
      taxableAmount: booking.taxableAmount,
      cgst: booking.cgst,
      sgst: booking.sgst,
      totalAmount: booking.totalAmount,
      pdfUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/invoices/${booking.id}/pdf`,
    },
  });
}

/** Build the PDF input from a stored invoice record (derives nights/deposit/rate). */
export function invoiceDataFromRecord(rec: GstInvoice, bookingRef: string): InvoicePdfData {
  const nights = Math.max(
    1,
    Math.round((rec.checkOut.getTime() - rec.checkIn.getTime()) / 86_400_000)
  );
  const deposit = Math.max(0, rec.totalAmount - rec.taxableAmount - rec.cgst - rec.sgst);
  const gstRatePct =
    rec.taxableAmount > 0 ? +(((rec.cgst + rec.sgst) / rec.taxableAmount) * 100).toFixed(2) : 0;

  return {
    invoiceNumber: rec.invoiceNumber,
    invoiceDate: rec.generatedAt,
    seller: {
      name: BUSINESS.brand,
      legalName: BUSINESS.legalName,
      gstin: BUSINESS.gstin,
      addressLines: [...BUSINESS.addressLines],
      phone: BUSINESS.phone,
      email: BUSINESS.email,
    },
    customer: {
      name: rec.customerName,
      phone: rec.customerPhone,
      gstin: rec.customerGstin,
    },
    stay: {
      bookingRef,
      roomNo: rec.roomNo,
      checkIn: rec.checkIn,
      checkOut: rec.checkOut,
      nights,
    },
    amounts: {
      roomRent: rec.roomRent,
      couponDiscount: rec.couponDiscount,
      taxableAmount: rec.taxableAmount,
      cgst: rec.cgst,
      sgst: rec.sgst,
      gstRatePct,
      deposit,
      totalAmount: rec.totalAmount,
    },
  };
}

/** Convenience: ensure the record exists and return its rendered PDF bytes. */
export async function renderBookingInvoicePdf(bookingId: string): Promise<{
  bytes: Uint8Array;
  invoiceNumber: string;
} | null> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { bookingRef: true },
  });
  if (!booking) return null;
  const rec = await ensureGstInvoice(bookingId);
  const bytes = generateInvoicePdf(invoiceDataFromRecord(rec, booking.bookingRef));
  return { bytes, invoiceNumber: rec.invoiceNumber };
}
