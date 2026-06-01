// ─── Coupon code generation helpers ──────────────────────────────────────────

// Avoid ambiguous characters (0/O, 1/I/L) for easy verbal/written sharing.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomChars(len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

/** Normalize an arbitrary keyword into an uppercase A-Z0-9 slug for use in codes. */
export function normalizeKeyword(keyword: string): string {
  return keyword
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
}

/**
 * Build a coupon code. Optional prefix/keyword is prepended, followed by a
 * random suffix to guarantee practical uniqueness.
 *
 * Examples:
 *   generateCouponCode()                 → "TUE-7KQP4M"
 *   generateCouponCode("SUMMER")         → "SUMMER-3XR9TK"
 *   generateCouponCode("DIWALI", 4)      → "DIWALI-9QP2"
 */
export function generateCouponCode(keyword?: string, suffixLen = 6): string {
  const base = keyword ? normalizeKeyword(keyword) : "TUE";
  return `${base}-${randomChars(suffixLen)}`;
}

/** Human-friendly discount label, e.g. "₹200 off" or "15% off". */
export function discountLabel(
  discountType: "FLAT" | "PERCENT",
  value: number
): string {
  return discountType === "PERCENT"
    ? `${value}% off`
    : `₹${value.toLocaleString("en-IN")} off`;
}
