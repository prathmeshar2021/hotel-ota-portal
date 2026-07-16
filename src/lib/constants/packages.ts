import { BUSINESS } from "@/lib/constants/business";

/**
 * Occasion packages — what nearby weekend guests (couples & groups) actually
 * buy. Stay prices anchor to the real nightly room rates; add-ons (dinner
 * setups, decorations, bonfire) are arranged over WhatsApp so pricing stays
 * flexible without fabricating numbers on the site.
 */

const WA_NUMBER = BUSINESS.phoneHref.replace("tel:+", ""); // 917000630016

export function waLink(message: string) {
  return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(message)}`;
}

export interface OccasionPackage {
  id: string;
  name: string;
  tagline: string;
  audience: string;          // who it's for — shown as a chip
  image: string;
  accent: string;
  stayFrom: number;          // anchor: real nightly rate of the room it uses
  stayFromLabel: string;     // e.g. "/night" or "/room/night"
  includes: string[];
  waMessage: string;
}

export const PACKAGES: OccasionPackage[] = [
  {
    id: "romantic-weekend",
    name: "Romantic Weekend for Two",
    tagline: "A private cottage, forest quiet, and nobody to disturb you",
    audience: "Couples",
    image: "/rooms/luxury/1.jpg",
    accent: "#F59E0B",
    stayFrom: 3000,
    stayFromLabel: "/night",
    includes: [
      "Private AC cottage with sit-out",
      "Candle-light dinner setup at your cottage",
      "Room decoration on request",
      "Late checkout, subject to availability",
    ],
    waMessage:
      "Hi! I'd like to plan a Romantic Weekend for Two at The Urban Escape. Please share details and pricing.",
  },
  {
    id: "theatre-night",
    name: "Private Theatre Night",
    tagline: "Your own big screen — movies in bed, all night",
    audience: "Couples · Small groups",
    image: "/rooms/theatre/1.jpg",
    accent: "#FCA5A5",
    stayFrom: 4500,
    stayFromLabel: "/night",
    includes: [
      "Exclusive theatre-style cottage",
      "Watch your own movies on the big screen",
      "Birthday / anniversary decoration on request",
      "Up to 4 guests",
    ],
    waMessage:
      "Hi! I want to book the Private Theatre Night at The Urban Escape. Please share details and pricing.",
  },
  {
    id: "group-getaway",
    name: "Group Weekend Getaway",
    tagline: "Book cottages together — the lawn is yours for the evening",
    audience: "Friends · Family groups",
    image: "/rooms/pinewood/1.jpg",
    accent: "#86EFAC",
    stayFrom: 2000,
    stayFromLabel: "/room/night",
    includes: [
      "2–4 cottages & rooms side by side",
      "Bonfire evening with music",
      "BBQ / group meals arranged on request",
      "Free parking for all vehicles",
    ],
    waMessage:
      "Hi! We're planning a Group Weekend Getaway at The Urban Escape. Please share details and pricing.",
  },
  {
    id: "celebrations",
    name: "Celebrations & Surprises",
    tagline: "Birthdays, anniversaries, proposals — we set it up before you arrive",
    audience: "Any occasion",
    image: "/rooms/luxury/2.jpg",
    accent: "#A78BFA",
    stayFrom: 2000,
    stayFromLabel: "/night",
    includes: [
      "Balloon & light decoration in your room",
      "Cake arranged for the moment",
      "Photo-friendly setups around the resort",
      "Add to any room or cottage stay",
    ],
    waMessage:
      "Hi! I'd like to arrange a surprise celebration at The Urban Escape. Please share decoration options and pricing.",
  },
];
