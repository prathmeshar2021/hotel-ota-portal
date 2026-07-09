import { BUSINESS, SITE_URL } from "@/lib/constants/business";

/**
 * Local-SEO / AEO constants — single source of truth for the visible FAQ
 * section on the homepage AND the FAQPage JSON-LD markup. Google requires
 * structured-data FAQs to match visible page content, so both consume this.
 */

// Resort geo coordinates (same as the intro fly-in target).
export const GEO = { lat: 21.2145, lng: 81.3503 } as const;

/** Nearby cities we target for local search — shown on-page and in metadata. */
export const NEARBY_CITIES = [
  { city: "Durg",     distance: "≈ 10 km", drive: "about 20 minutes" },
  { city: "Raipur",   distance: "≈ 35 km", drive: "about 45 minutes" },
  { city: "Bilaspur", distance: "≈ 130 km", drive: "about 3 hours" },
] as const;

export const FAQS = [
  {
    q: `Where is ${BUSINESS.brand} located?`,
    a: `${BUSINESS.brand} is a forest-side resort at Kohka, Bhilai, Chhattisgarh — close to Surya Treasure Island Mall. It is about 20 minutes from Durg, 45 minutes from Raipur and around 3 hours from Bilaspur, making it an easy weekend getaway from anywhere in central Chhattisgarh.`,
  },
  {
    q: "How do I book a cottage or room?",
    a: `Book online at ${SITE_URL.replace("https://", "")} with secure payment and instant WhatsApp confirmation, or call/WhatsApp us at ${BUSINESS.phone}. Booking direct always gets you the best rate.`,
  },
  {
    q: "What room types and prices are available?",
    a: "We offer AC luxury cottages (pinewood and theatre-style), premium AC rooms, cave-theme AC rooms and budget non-AC rooms. Prices start around ₹1,200 per night for non-AC rooms and go up to ₹4,500 for the exclusive theatre-style cottage.",
  },
  {
    q: "What are the check-in and check-out times?",
    a: `Standard check-in is ${BUSINESS.checkInTime} and check-out is ${BUSINESS.checkOutTime}. Early check-in and late check-out are available subject to room availability — call us in advance.`,
  },
  {
    q: "Is The Urban Escape good for a weekend trip from Raipur or Durg?",
    a: "Yes — it's one of the closest nature resorts to Raipur, Durg and Bhilai. You can leave after breakfast, be at the resort within an hour from Raipur (20 minutes from Durg), and spend the weekend among pine cottages, gardens and forest views without a long highway drive.",
  },
  {
    q: "What is the cancellation policy?",
    a: "Free cancellation up to 24 hours before check-in. Late cancellations may be charged one night's stay. Refunds are processed in 5–7 business days.",
  },
  {
    q: "Is parking available? Are pets allowed?",
    a: "Free on-site parking and power backup are available for all guests. Pets are not allowed at the property.",
  },
] as const;

/** Keywords targeting the local catchment (Bhilai / Durg / Raipur / Bilaspur). */
export const LOCAL_KEYWORDS = [
  "resort in Bhilai", "resort near Raipur", "resort near Durg",
  "weekend getaway from Raipur", "weekend getaway Bhilai",
  "cottages in Bhilai", "cottage stay Chhattisgarh",
  "best resort in Chhattisgarh", "family resort Bhilai",
  "forest resort near Raipur", "hotel in Bhilai Kohka",
  "resort near Bilaspur", "couple friendly resort Bhilai",
  "theatre cottage Bhilai", "luxury cottage Chhattisgarh",
] as const;
