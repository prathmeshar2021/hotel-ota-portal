// ─── Static resort info used by intent handlers + Gemini system prompt ────────

export const RESORT = {
  name: "The Urban Escape",
  tagline: "By Saubhagya Mangalam",
  location: "Kohka, Bhilai, Chhattisgarh",
  phone: "+91 70006 30016",
  email: "saubhagyamangalam@gmail.com",
  googleMaps: "https://maps.app.goo.gl/tm4cHuKkTpe39ymd6",
  checkInTime: "12:00 PM",
  checkOutTime: "11:00 AM",
  hotelSlug: "the-urban-escape-bhilai",

  // The resort has 3 main categories (15 rooms total):
  //   AC Cottages (6) · AC Rooms (5) · Non AC Rooms (4)
  rooms: [
    {
      type: "LUXURY_COTTAGE",
      label: "Luxury Cottage",
      group: "AC Cottages",
      qty: 3,
      price: 3500,
      capacity: 4,
      accent: "#F59E0B",
      features: ["Premium Furnishings", "Private Sit-out", "Amber LED Strips", "Air Conditioning", "Smart TV", "Forest Views"],
      tagline: "Pine Wood · Amber Soul",
    },
    {
      type: "PINEWOOD_COTTAGE",
      label: "Pinewood Cottage",
      group: "AC Cottages",
      qty: 2,
      price: 3000,
      capacity: 4,
      accent: "#86EFAC",
      features: ["Pine Wood Interiors", "Private Sit-out", "Rustic Charm", "Air Conditioning", "Smart TV", "Forest Views"],
      tagline: "Rustic Charm · Pine Nest",
    },
    {
      type: "THEATRE_COTTAGE",
      label: "Theatre Style Cottage",
      group: "AC Cottages",
      qty: 1,
      price: 4500,
      capacity: 4,
      accent: "#FCA5A5",
      features: ["Private Theatre Setup", "Exclusive Cottage", "Premium Bedding", "Air Conditioning", "Smart TV"],
      tagline: "Private Screen · Exclusive Stay",
    },
    {
      type: "PREMIUM_AC_ROOM",
      label: "Deluxe AC Room",
      group: "AC Rooms",
      qty: 3,
      price: 2000,
      capacity: 2,
      accent: "#60A5FA",
      features: ["Air Conditioning", "Premium Furnishings", "Blue LED Ambiance", "Valley Views", "Smart TV", "Modern Design"],
      tagline: "Slate Dark · Electric Blue",
    },
    {
      type: "CAVE_AC_ROOM",
      label: "Cave Theme AC Room",
      group: "AC Rooms",
      qty: 2,
      price: 2200,
      capacity: 2,
      accent: "#A78BFA",
      features: ["Cave Theme Interiors", "Air Conditioning", "Ambient Lighting", "Unique Experience", "Smart TV"],
      tagline: "Stone Soul · Cave Vibes",
    },
    {
      type: "NON_AC_ROOM",
      label: "Non-AC Room",
      group: "Non AC Rooms",
      qty: 4,
      price: 1200,
      capacity: 2,
      accent: "#4ADE80",
      features: ["Natural Ventilation", "Forest Views", "Green LED Glow", "Smart TV", "All Essentials"],
      tagline: "Natural Light · Green Glow",
    },
  ],

  amenities: [
    "Free Parking",
    "24/7 Front Desk",
    "Power Backup",
    "Room Service",
    "Lush Garden",
    "Forest View from Rooms",
    "Online Check-in",
    "WhatsApp Confirmation",
  ],

  policies: {
    cancellation:
      "Free cancellation up to 24 hours before check-in. Late cancellations may be charged for 1 night stay.",
    pets: "Pets are not allowed at the property.",
    extraBed: "Extra bed available on request — charges apply. Please contact us in advance.",
    idProof:
      "Government-issued photo ID mandatory at check-in (Aadhaar, PAN, Passport, or Driving License).",
    gst: "GST applicable as per government norms. Shown separately during booking.",
    earlyCheckin:
      "Early check-in available subject to room availability. Please call us in advance.",
    lateCheckout:
      "Late check-out available subject to room availability. Additional charges may apply.",
  },
} as const;

// ─── Gemini system prompt — restricts AI to resort topics only ─────────────────
export const GEMINI_SYSTEM_PROMPT = `You are **Sangwari** — a warm, friendly AI companion ("sangwari" means friend in Chhattisgarhi 🌿) for "${RESORT.name}", a boutique resort in ${RESORT.location}, India.

## Resort Details
- **Name:** ${RESORT.name}
- **Location:** ${RESORT.location}
- **Contact:** ${RESORT.phone} | ${RESORT.email}
- **Check-in:** ${RESORT.checkInTime} | **Check-out:** ${RESORT.checkOutTime}

## Room Types (15 rooms across 3 categories: AC Cottages · AC Rooms · Non AC Rooms)
${RESORT.rooms
  .map(
    (r) =>
      `- **${r.label}** — ${r.group} | ${r.qty} room(s) | from ₹${r.price.toLocaleString("en-IN")}/night | Up to ${r.capacity} guests | ${r.features.slice(0, 3).join(", ")}`
  )
  .join("\n")}

## Amenities
${RESORT.amenities.join(", ")}

## Key Policies
- Cancellation: ${RESORT.policies.cancellation}
- Pets: ${RESORT.policies.pets}
- ID Proof: ${RESORT.policies.idProof}
- GST: ${RESORT.policies.gst}

## Your Persona
- Your name is Sangwari — mention it naturally if guests ask who you are
- Warm, friendly, and concise (max 2–3 short sentences per reply)
- Always respond in English unless guest writes in another language
- Use simple formatting — avoid large code blocks or tables
- If the question is completely unrelated to the resort, hospitality, or travel in Bhilai/Chhattisgarh, respond:
  "I'm Sangwari, here to help with The Urban Escape. For bookings or any queries, feel free to ask or call us at ${RESORT.phone}! 😊"
- For complex complaints or special requests, always suggest calling ${RESORT.phone}
- Never make up facts about room counts, exact pricing, or policies not listed above`;
