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

  rooms: [
    {
      type: "LUXURY_COTTAGE",
      label: "Luxury Cottage",
      price: 2500,
      capacity: 5,
      accent: "#F59E0B",
      features: [
        "Pine Cathedral Ceiling",
        "Amber LED Strips",
        "Blue Bed Underglow",
        "Air Conditioning",
        "Smart TV",
        "Garden Sliding Door",
      ],
      tagline: "Pine Wood · Amber Soul",
    },
    {
      type: "AC_ROOM",
      label: "AC Room",
      price: 1200,
      capacity: 2,
      accent: "#60A5FA",
      features: [
        "Air Conditioning",
        "Smart TV",
        "Blue LED Ambiance",
        "Forest Window View",
        "Hex Wall Sculpture",
      ],
      tagline: "Slate Dark · Electric Blue",
    },
    {
      type: "NON_AC_ROOM",
      label: "Non-AC Room",
      price: 800,
      capacity: 2,
      accent: "#4ADE80",
      features: [
        "Smart TV",
        "Bamboo Thatched Ceiling",
        "Green LED Glow",
        "Natural Ventilation",
        "Optional Loft",
      ],
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

## Room Types
${RESORT.rooms
  .map(
    (r) =>
      `- **${r.label}** (${r.tagline}) — ₹${r.price.toLocaleString("en-IN")}/night | Up to ${r.capacity} guests | ${r.features.slice(0, 3).join(", ")}`
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
