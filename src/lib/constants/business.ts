/**
 * Single source of truth for legal/contact details shown across the public
 * policy pages, the contact page and the footer. Update here if the business
 * details change.
 */
export const BUSINESS = {
  brand: "The Urban Escape",
  legalName: "Saubhagya Mangalam",
  entityType: "Sole Proprietorship",
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
