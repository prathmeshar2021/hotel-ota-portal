import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { getCategoryMeta } from "@/lib/utils/room-categories";
import { generateConsentPdf, type ConsentPdfData } from "@/lib/services/consent-pdf";
import type { Consent } from "@prisma/client";

/**
 * Idempotently create (or fetch) the Consent record for a booking and mint an
 * unguessable token. The token is the second factor on the public PDF route so
 * an unauthenticated request can't render another booking's form by guessing
 * the (already unguessable) booking id.
 */
export async function ensureConsent(bookingId: string): Promise<Consent> {
  const existing = await prisma.consent.findUnique({ where: { bookingId } });
  if (existing?.consentToken) return existing;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, primaryGuestId: true },
  });
  if (!booking) throw new Error("Booking not found");

  const token = randomUUID();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const pdfUrl = `${appUrl}/api/consent/${booking.id}/pdf?t=${token}`;

  if (existing) {
    return prisma.consent.update({
      where: { bookingId },
      data: { consentToken: token, pdfUrl },
    });
  }

  return prisma.consent.create({
    data: {
      bookingId: booking.id,
      primaryGuestId: booking.primaryGuestId,
      consentToken: token,
      pdfUrl,
      status: "PENDING",
    },
  });
}

/** Assemble the live registration data for a booking into PDF input. */
export async function buildConsentData(bookingId: string): Promise<ConsentPdfData | null> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      hotel: true,
      room: true,
      primaryGuest: true,
      companions: true,
      onlineCheckin: true,
      consent: true,
    },
  });
  if (!booking) return null;

  const roomNo =
    booking.room?.roomNumber ?? getCategoryMeta(booking.roomCategory as never)?.displayName ?? booking.roomCategory;

  const h = booking.hotel;

  return {
    hotel: {
      brand: h.name,
      legalName: h.name,
      gstin: h.gstin,
      addressLines: [h.address, `${h.city}, ${h.state} ${h.pincode}`].filter(Boolean),
      phone: h.phone,
      email: h.email,
    },
    booking: {
      ref: booking.bookingRef,
      roomNo,
      checkIn: booking.checkInDate,
      checkOut: booking.checkOutDate,
      nights: booking.noOfNights,
      persons: booking.noOfPersons,
    },
    primary: {
      name: booking.primaryGuest.name,
      gender: booking.primaryGuest.gender,
      dob: booking.primaryGuest.dateOfBirth,
      nationality: null,
      address: booking.primaryGuest.address,
      phone: booking.primaryGuest.phone ?? booking.guestPhone,
      email: booking.primaryGuest.email,
      occupation: booking.primaryGuest.occupation,
      idType: booking.primaryGuest.idType,
      idNumber: booking.primaryGuest.idNumber,
      comingFrom: booking.onlineCheckin?.comingFrom,
      goingTo: booking.onlineCheckin?.goingTo,
      purpose: booking.onlineCheckin?.purpose,
      vehicleNo: booking.onlineCheckin?.vehicleNo,
    },
    companions: booking.companions.map((c) => ({
      name: c.name,
      relation: c.relation,
      idType: c.idType,
      idNumber: c.idNumber,
    })),
    // A WhatsApp/link acceptance (mode WHATSAPP) is a genuine electronic consent;
    // a PORTAL acceptance is staff attesting a physically-signed copy.
    electronicAcceptedAt:
      booking.consent?.primaryAcceptedAt && booking.consent.mode === "WHATSAPP"
        ? booking.consent.primaryAcceptedAt
        : null,
    paperVerifiedAt:
      booking.consent?.primaryAcceptedAt && booking.consent.mode !== "WHATSAPP"
        ? booking.consent.primaryAcceptedAt
        : null,
  };
}

/** Render the consent form to PDF bytes. Returns null if the booking is gone. */
export async function renderConsentPdf(bookingId: string): Promise<Uint8Array | null> {
  const data = await buildConsentData(bookingId);
  if (!data) return null;
  return generateConsentPdf(data);
}
