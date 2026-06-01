/**
 * Room category definitions for the hotel.
 *
 * Two-level hierarchy:
 *   Main category (group)  →  Sub-category (bookable RoomCategoryType)
 *
 *   AC Cottages   → Pinewood Cottage, Luxury Cottage, Theatre Style Cottage
 *   AC Rooms      → Deluxe AC Room, Cave Theme AC Room
 *   Non AC Rooms  → Non-AC Room (no sub-categories)
 *
 * Customers drill into a main category, pick a sub-category, and book it.
 * Admin assigns a physical room number after the booking is made.
 */

export type RoomCategoryType =
  | "NON_AC_ROOM"
  | "PREMIUM_AC_ROOM"
  | "CAVE_AC_ROOM"
  | "PINEWOOD_COTTAGE"
  | "THEATRE_COTTAGE"
  | "LUXURY_COTTAGE";

export type CategoryGroup = "AC Cottages" | "AC Rooms" | "Non AC Rooms";

export interface CategoryMeta {
  displayName: string;
  shortName: string;
  description: string;
  accentColor: string;
  accentGradient: string;
  ledColor: string;
  totalRooms: number;
  maxGuests: number;
  group: CategoryGroup;
  sortOrder: number;
}

/** Sub-category (bookable) definitions */
export const CATEGORY_META: Record<RoomCategoryType, CategoryMeta> = {
  NON_AC_ROOM: {
    displayName: "Non-AC Room",
    shortName: "Non-AC",
    description: "Comfortable, naturally ventilated rooms with forest views and all basic amenities.",
    accentColor: "#4ADE80",
    accentGradient: "from-green-950/60",
    ledColor: "via-green-400/60",
    totalRooms: 4,
    maxGuests: 2,
    group: "Non AC Rooms",
    sortOrder: 1,
  },
  PREMIUM_AC_ROOM: {
    displayName: "Deluxe AC Room",
    shortName: "Deluxe AC",
    description: "Modern air-conditioned rooms with premium furnishings and scenic valley views.",
    accentColor: "#60A5FA",
    accentGradient: "from-blue-950/60",
    ledColor: "via-blue-400/60",
    totalRooms: 3,
    maxGuests: 2,
    group: "AC Rooms",
    sortOrder: 2,
  },
  CAVE_AC_ROOM: {
    displayName: "Cave Theme AC Room",
    shortName: "Cave AC",
    description: "Unique cave-inspired interiors with air conditioning — a truly one-of-a-kind experience.",
    accentColor: "#A78BFA",
    accentGradient: "from-purple-950/60",
    ledColor: "via-purple-400/60",
    totalRooms: 2,
    maxGuests: 2,
    group: "AC Rooms",
    sortOrder: 3,
  },
  PINEWOOD_COTTAGE: {
    displayName: "Pinewood Cottage",
    shortName: "Pinewood",
    description: "Cozy cottages nestled among pine trees with a warm, rustic charm and private sit-out.",
    accentColor: "#86EFAC",
    accentGradient: "from-emerald-900/60",
    ledColor: "via-emerald-400/60",
    totalRooms: 2,
    maxGuests: 4,
    group: "AC Cottages",
    sortOrder: 4,
  },
  THEATRE_COTTAGE: {
    displayName: "Theatre Style Cottage",
    shortName: "Theatre",
    description: "Exclusive private cottage with a theatre-style entertainment setup — ideal for a special getaway.",
    accentColor: "#FCA5A5",
    accentGradient: "from-rose-950/60",
    ledColor: "via-rose-400/60",
    totalRooms: 1,
    maxGuests: 4,
    group: "AC Cottages",
    sortOrder: 5,
  },
  LUXURY_COTTAGE: {
    displayName: "Luxury Cottage",
    shortName: "Luxury",
    description: "Our finest cottages with premium furnishings, private sit-outs and breathtaking forest views.",
    accentColor: "#F59E0B",
    accentGradient: "from-amber-950/60",
    ledColor: "via-amber-400/60",
    totalRooms: 3,
    maxGuests: 4,
    group: "AC Cottages",
    sortOrder: 6,
  },
};

// All sub-category types in display order
export const ALL_CATEGORY_TYPES: RoomCategoryType[] = [
  "NON_AC_ROOM",
  "PREMIUM_AC_ROOM",
  "CAVE_AC_ROOM",
  "PINEWOOD_COTTAGE",
  "THEATRE_COTTAGE",
  "LUXURY_COTTAGE",
];

export function getCategoryMeta(type: string): CategoryMeta {
  return (
    CATEGORY_META[type as RoomCategoryType] ?? {
      displayName: type.replace(/_/g, " "),
      shortName: type,
      description: "",
      accentColor: "#F59E0B",
      accentGradient: "from-amber-950/60",
      ledColor: "via-amber-400/60",
      totalRooms: 0,
      maxGuests: 2,
      group: "Non AC Rooms" as CategoryGroup,
      sortOrder: 99,
    }
  );
}

/** Convert category type to URL slug: "LUXURY_COTTAGE" → "luxury-cottage" */
export function categoryToSlug(type: RoomCategoryType): string {
  return type.toLowerCase().replace(/_/g, "-");
}

/** Convert URL slug to category type: "luxury-cottage" → "LUXURY_COTTAGE" */
export function slugToCategory(slug: string): RoomCategoryType {
  return slug.toUpperCase().replace(/-/g, "_") as RoomCategoryType;
}

/** Map of physical room numbers per category (admin-facing) */
export const CATEGORY_ROOMS: Record<RoomCategoryType, string[]> = {
  NON_AC_ROOM:      ["101", "102", "103", "104"],
  PREMIUM_AC_ROOM:  ["201", "202", "203"],
  CAVE_AC_ROOM:     ["Cave1", "Cave2"],
  PINEWOOD_COTTAGE: ["Cottage3", "Cottage4"],
  THEATRE_COTTAGE:  ["Cottage2"],
  LUXURY_COTTAGE:   ["Cottage1", "Cottage5", "Cottage6"],
};

/**
 * Photo galleries per sub-category. Files live in /public/rooms/<slug>/.
 * First image is used as the card / hero thumbnail.
 */
export const CATEGORY_IMAGES: Record<RoomCategoryType, string[]> = {
  NON_AC_ROOM:      ["/rooms/non-ac/1.jpg", "/rooms/non-ac/2.jpg", "/rooms/non-ac/3.jpg", "/rooms/non-ac/4.jpg"],
  PREMIUM_AC_ROOM:  ["/rooms/deluxe-ac/1.jpg", "/rooms/deluxe-ac/2.jpg", "/rooms/deluxe-ac/3.jpg", "/rooms/deluxe-ac/4.jpg"],
  CAVE_AC_ROOM:     ["/rooms/cave-ac/1.jpg", "/rooms/cave-ac/2.jpg"],
  PINEWOOD_COTTAGE: ["/rooms/pinewood/1.jpg", "/rooms/pinewood/2.jpg"],
  THEATRE_COTTAGE:  ["/rooms/theatre/1.jpg", "/rooms/theatre/2.jpg"],
  LUXURY_COTTAGE:   ["/rooms/luxury/1.jpg", "/rooms/luxury/2.jpg", "/rooms/luxury/3.jpg"],
};

/** Returns the gallery for a category, or an empty array. */
export function getCategoryImages(type: string): string[] {
  return CATEGORY_IMAGES[type as RoomCategoryType] ?? [];
}

// ─── MAIN CATEGORIES (the 3 top-level groups customers drill into) ─────────────

export type MainCategoryKey = "AC_COTTAGES" | "AC_ROOMS" | "NON_AC_ROOMS";

export interface MainCategoryMeta {
  key: MainCategoryKey;
  displayName: CategoryGroup;
  tagline: string;
  description: string;
  accentColor: string;
  ledColor: string;          // hex for inline styles
  heroImage: string;         // representative cover image
  subcategories: RoomCategoryType[];
  totalRooms: number;
  sortOrder: number;
}

export const MAIN_CATEGORIES: Record<MainCategoryKey, MainCategoryMeta> = {
  AC_COTTAGES: {
    key: "AC_COTTAGES",
    displayName: "AC Cottages",
    tagline: "Pine Wood · Private Sit-outs",
    description: "Six handcrafted air-conditioned cottages — pinewood charm, luxury finishes and a private theatre cottage.",
    accentColor: "#F59E0B",
    ledColor: "#F59E0B",
    heroImage: "/rooms/luxury/1.jpg",
    subcategories: ["PINEWOOD_COTTAGE", "LUXURY_COTTAGE", "THEATRE_COTTAGE"],
    totalRooms: 6,
    sortOrder: 1,
  },
  AC_ROOMS: {
    key: "AC_ROOMS",
    displayName: "AC Rooms",
    tagline: "Cool Comfort · Modern Design",
    description: "Five air-conditioned rooms — deluxe modern rooms and our signature cave-themed stays.",
    accentColor: "#60A5FA",
    ledColor: "#3B82F6",
    heroImage: "/rooms/deluxe-ac/1.jpg",
    subcategories: ["PREMIUM_AC_ROOM", "CAVE_AC_ROOM"],
    totalRooms: 5,
    sortOrder: 2,
  },
  NON_AC_ROOMS: {
    key: "NON_AC_ROOMS",
    displayName: "Non AC Rooms",
    tagline: "Natural Breeze · Forest Views",
    description: "Four naturally ventilated rooms with forest views and all the essential comforts.",
    accentColor: "#4ADE80",
    ledColor: "#22C55E",
    heroImage: "/rooms/non-ac/1.jpg",
    subcategories: ["NON_AC_ROOM"],
    totalRooms: 4,
    sortOrder: 3,
  },
};

export const ALL_MAIN_CATEGORIES: MainCategoryMeta[] = Object.values(MAIN_CATEGORIES).sort(
  (a, b) => a.sortOrder - b.sortOrder
);

/** Which main category a sub-category belongs to. */
export function getMainCategoryForType(type: RoomCategoryType): MainCategoryMeta {
  return (
    ALL_MAIN_CATEGORIES.find((m) => m.subcategories.includes(type)) ??
    MAIN_CATEGORIES.NON_AC_ROOMS
  );
}
