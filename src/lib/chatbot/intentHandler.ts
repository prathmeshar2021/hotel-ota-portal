import { RESORT } from "./resortData";

// ─── Intent types ──────────────────────────────────────────────────────────────
export type Intent =
  | "GREETING"
  | "ROOM_INFO"
  | "PRICING"
  | "AVAILABILITY"
  | "BOOKING"
  | "AMENITIES"
  | "LOCATION"
  | "CHECKIN_CHECKOUT"
  | "CANCELLATION"
  | "CONTACT"
  | "UNKNOWN";

export type ResponseAction =
  | { type: "DATE_PICKER" }
  | { type: "SHOW_ROOMS" }
  | { type: "BOOKING_LINK"; url: string; label: string };

export interface BotResponse {
  text: string;
  quickReplies?: string[];
  action?: ResponseAction;
}

// ─── Keyword-based intent classifier ──────────────────────────────────────────
export function classifyIntent(message: string): Intent {
  const m = message.toLowerCase().trim();

  // Greetings — must be short and match greeting words
  if (/^(hi|hello|hey|howdy|hola|namaste|namaskar|good\s+(morning|evening|night|afternoon))[\s!.]*$/.test(m))
    return "GREETING";
  if (/\b(hi|hello|hey)\b/.test(m) && m.length < 15) return "GREETING";

  // Human / contact escalation
  if (/\b(contact|phone|call|whatsapp|email|talk to human|speak to|agent|support|help desk|staff)\b/.test(m))
    return "CONTACT";

  // Booking intent
  if (/\b(book|reserve|reservation|make a booking|i want to book|book now|book a room|book a cottage)\b/.test(m))
    return "BOOKING";

  // Availability
  if (/\b(available|availability|any room|vacant|free room|check dates|check if)\b/.test(m))
    return "AVAILABILITY";

  // Pricing
  if (/\b(price|rate|cost|charges|how much|tariff|fee|pricing|rates|afford)\b/.test(m))
    return "PRICING";

  // Room info
  if (/\b(room|rooms|cottage|cottages|suite|accommodation|type|option|stay|bed)\b/.test(m))
    return "ROOM_INFO";

  // Amenities
  if (/\b(amenity|amenities|facility|facilities|pool|spa|parking|wifi|wi-fi|restaurant|gym|garden|service|power backup|breakfast)\b/.test(m))
    return "AMENITIES";

  // Location
  if (/\b(location|address|where|direction|directions|reach|map|navigate|bhilai|raipur|chhattisgarh|how to come|how to get)\b/.test(m))
    return "LOCATION";

  // Check-in / check-out
  if (/\b(check.?in|check.?out|timing|arrival time|departure|early check|late check|when can i)\b/.test(m))
    return "CHECKIN_CHECKOUT";

  // Cancellation / policies
  if (/\b(cancel|cancellation|refund|policy|policies|pet|extra bed|id proof|gst|tax)\b/.test(m))
    return "CANCELLATION";

  return "UNKNOWN";
}

// ─── Rule-based response generator ────────────────────────────────────────────
export function getRuleBasedResponse(intent: Intent): BotResponse | null {
  switch (intent) {
    // ── Greeting ───────────────────────────────────────────────────────────────
    case "GREETING":
      return {
        text: `👋 Welcome to **${RESORT.name}**!\n\nI'm your resort assistant — happy to help with room information, availability, pricing, and bookings. What can I do for you?`,
        quickReplies: ["View Rooms & Rates", "Check Availability", "Amenities", "Location", "Contact Us"],
      };

    // ── Room info ──────────────────────────────────────────────────────────────
    case "ROOM_INFO":
      return {
        text: `🏡 We have **3 unique room types**, each with its own personality:\n\n${RESORT.rooms
          .map(
            (r) =>
              `**${r.label}** · _${r.tagline}_\n👥 Up to ${r.capacity} guests · ${r.features.slice(0, 3).join(" · ")}`
          )
          .join("\n\n")}\n\nWould you like to check availability for your dates?`,
        quickReplies: ["Check Availability", "View Pricing", "Book Now"],
      };

    // ── Pricing ────────────────────────────────────────────────────────────────
    case "PRICING":
      return {
        text: `💰 **Room Rates:**\n\n${RESORT.rooms
          .map(
            (r) =>
              `**${r.label}** — ₹${r.price.toLocaleString("en-IN")}/night\n👥 Up to ${r.capacity} guest${r.capacity > 1 ? "s" : ""}`
          )
          .join("\n\n")}\n\n_GST extra. Best rates guaranteed when you book directly with us!_`,
        quickReplies: ["Check Availability", "Book Now", "Amenities"],
      };

    // ── Availability / Booking — show date picker ───────────────────────────────
    case "AVAILABILITY":
    case "BOOKING":
      return {
        text: "📅 Great! Let's find the perfect room for you.\n\nPlease select your **check-in** and **check-out** dates:",
        action: { type: "DATE_PICKER" },
      };

    // ── Amenities ──────────────────────────────────────────────────────────────
    case "AMENITIES":
      return {
        text: `✨ **Resort Amenities:**\n\n${RESORT.amenities.map((a) => `• ${a}`).join("\n")}\n\nEvery room also features signature ambient LED mood lighting — a truly immersive experience. 🌿`,
        quickReplies: ["View Rooms", "Check Availability", "Contact Us"],
      };

    // ── Location ───────────────────────────────────────────────────────────────
    case "LOCATION":
      return {
        text: `📍 **Address:** ${RESORT.location}\n\nWe're nestled in lush greenery just outside Bhilai city — close to the hustle, yet feels like a completely different world.\n\n🗺️ [Open in Google Maps](${RESORT.googleMaps})`,
        quickReplies: ["Check Availability", "Contact Us", "View Rooms"],
      };

    // ── Check-in / Check-out ───────────────────────────────────────────────────
    case "CHECKIN_CHECKOUT":
      return {
        text: `🕐 **Check-in:** ${RESORT.checkInTime}\n🕚 **Check-out:** ${RESORT.checkOutTime}\n\n_Early check-in / late check-out available subject to room availability — please call us in advance._\n\n📋 Valid government-issued ID required at check-in (Aadhaar, PAN, Passport, or Driving License).`,
        quickReplies: ["Book Now", "Cancellation Policy", "Contact Us"],
      };

    // ── Cancellation & Policies ────────────────────────────────────────────────
    case "CANCELLATION":
      return {
        text: `📋 **Policies:**\n\n🔄 **Cancellation:** ${RESORT.policies.cancellation}\n\n🐾 **Pets:** ${RESORT.policies.pets}\n\n🪪 **ID Proof:** ${RESORT.policies.idProof}\n\n🛏️ **Extra Bed:** ${RESORT.policies.extraBed}\n\n💸 **GST:** ${RESORT.policies.gst}`,
        quickReplies: ["Book Now", "Contact Us", "View Rooms"],
      };

    // ── Contact ────────────────────────────────────────────────────────────────
    case "CONTACT":
      return {
        text: `📞 **Contact Us:**\n\n📱 **Phone / WhatsApp:** ${RESORT.phone}\n📧 **Email:** ${RESORT.email}\n📍 **Location:** ${RESORT.location}\n\n_Our front desk is available 24/7. For quick bookings, you can also use this chat!_`,
        quickReplies: ["Book Now", "View Rooms", "Check Availability"],
      };

    // ── Unknown — caller must fallback to Gemini ────────────────────────────────
    case "UNKNOWN":
      return null;

    default:
      return null;
  }
}
