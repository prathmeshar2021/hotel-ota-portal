/**
 * Server-side enforcement of the hotel's customer-facing payment options.
 *
 * The booking pages hide "Pay at Hotel" and "Pay Partial" when the owner has
 * switched them off, but hiding a button is not enforcement — the booking API
 * is public, and a request can carry any payMode it likes. Without this check
 * the owner's setting only ever held in the browser, so a booking could still
 * be created with nothing paid.
 */

import { prisma } from "@/lib/db/prisma";

export type PayMode = "PAY_NOW" | "PAY_PARTIAL" | "PAY_AT_HOTEL";

/**
 * Returns the payMode to actually use, or an error message if the guest asked
 * for one this hotel doesn't offer. PAY_NOW is always allowed — a hotel can
 * never be worse off for being paid in full up front.
 */
export async function resolvePayMode(
  hotelId: string,
  requested: PayMode
): Promise<{ ok: true; payMode: PayMode } | { ok: false; error: string }> {
  if (requested === "PAY_NOW") return { ok: true, payMode: requested };

  const hotel = await prisma.hotel.findUnique({
    where: { id: hotelId },
    select: { allowPayAtHotel: true, allowPartialPay: true },
  });
  if (!hotel) return { ok: false, error: "Hotel not found" };

  if (requested === "PAY_AT_HOTEL" && !hotel.allowPayAtHotel) {
    return { ok: false, error: "This property requires payment online to confirm a booking." };
  }
  if (requested === "PAY_PARTIAL" && !hotel.allowPartialPay) {
    return { ok: false, error: "This property requires the full amount to be paid online." };
  }
  return { ok: true, payMode: requested };
}
