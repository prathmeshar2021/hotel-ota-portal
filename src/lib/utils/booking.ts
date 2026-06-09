import { prisma } from "@/lib/db/prisma";

// Re-export pure calculations so server-side callers can keep using this file.
export {
  calculateGST,
  computeTotals,
  applyCoupon,
  universalDiscountAmount,
  discountedNightlyPrice,
  resolveBookingDiscount,
} from "./booking-calc";
export type { UniversalDiscount } from "./booking-calc";

import type { UniversalDiscount } from "./booking-calc";

/**
 * Fetch the active hotel-wide marketing discount for a hotel, or null.
 * Server-only (touches the DB). Pure math lives in booking-calc.ts.
 */
export async function getUniversalDiscount(
  hotelId: string
): Promise<UniversalDiscount | null> {
  const c = await prisma.coupon.findFirst({
    where: {
      hotelId,
      isUniversal: true,
      isActive: true,
      OR: [{ expiryDate: null }, { expiryDate: { gte: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
  });
  if (!c) return null;
  return {
    id: c.id,
    code: c.code,
    label: c.label,
    discountType: c.discountType,
    discountValue: c.discountValue,
    maxDiscount: c.maxDiscount,
  };
}

// Booking ref: BK-YYYYMMDD-XXXX (e.g. BK-20240523-0042)
export async function generateBookingRef(): Promise<string> {
  const date = new Date();
  const dateStr =
    date.getFullYear().toString() +
    (date.getMonth() + 1).toString().padStart(2, "0") +
    date.getDate().toString().padStart(2, "0");

  const count = await prisma.booking.count();
  const seq = (count + 1).toString().padStart(4, "0");
  return `BK-${dateStr}-${seq}`;
}

// GST invoice number: INV-YYYY-XXXX
export async function generateInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.gstInvoice.count();
  const seq = (count + 1).toString().padStart(4, "0");
  return `INV-${year}-${seq}`;
}

