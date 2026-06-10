/**
 * Single source of truth for legal/contact details shown across the public
 * policy pages, the contact page and the footer. Update here if the business
 * details change.
 */
export const BUSINESS = {
  brand: "The Urban Escape",
  legalName: "Saubhagya Mangalam",
  entityType: "Sole Proprietorship",
  gstin: "22AHKPG7852M1Z0",
  addressLines: ["Kohka, Bhilai", "Chhattisgarh, India"],
  city: "Bhilai",
  state: "Chhattisgarh",
  phone: "+91 70006 30016",
  phoneHref: "tel:+917000630016",
  email: "saubhagyamangalam@gmail.com",
  emailHref: "mailto:saubhagyamangalam@gmail.com",
  checkInTime: "12:00 PM",
  checkOutTime: "11:00 AM",
  refundWindow: "5–7 business days",
  // Last reviewed date for the policy documents (keep current on edits).
  policiesUpdated: "10 June 2026",
} as const;

/**
 * Canonical site origin, used for metadata, sitemap and robots.
 * Set NEXT_PUBLIC_SITE_URL to your custom domain in production; otherwise we
 * fall back to the Vercel production URL, then localhost for dev.
 */
export const SITE_URL: string =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");
