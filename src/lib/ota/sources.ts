import type { BookingSource } from "@prisma/client";

/**
 * OTA channels whose bookings are PREPAID to the OTA (the guest pays the
 * platform, never the hotel directly). Their money must be kept out of the
 * hotel's own cash/online statements and shown in the dedicated GoMMT finance
 * view instead.
 */
export const OTA_PREPAID_SOURCES: BookingSource[] = ["MMT", "GOIBIBO"];

export function isOtaPrepaid(source: string): boolean {
  return source === "MMT" || source === "GOIBIBO";
}

export function otaSourceLabel(source: string): string {
  switch (source) {
    case "MMT": return "MakeMyTrip";
    case "GOIBIBO": return "Goibibo";
    default: return source;
  }
}
