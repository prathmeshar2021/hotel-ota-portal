import { randomInt } from "crypto";

/**
 * Helpers for provisioning a hotel-staff login. The generated user id is stored
 * in HotelStaff.email (the login identifier) and is deliberately short and
 * memorable — a bare first name, numbered only on collision (rahul, rahul2, …) —
 * so less technical staff can type it easily. The password is shown to the super
 * admin once at creation; the staff member changes it themselves afterwards.
 */

// Lowercase + digits only, ambiguous characters (0/o, 1/l/i) excluded, so a
// handed-over password is easy to type and can't be misread.
const PW_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function generatePassword(len = 6): string {
  let out = "";
  for (let i = 0; i < len; i++) out += PW_ALPHABET[randomInt(PW_ALPHABET.length)];
  return out;
}

/** Slug the first name into a simple lowercase handle: "José Díaz" → "jose". */
export function baseUserId(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  const slug = first
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return slug || "staff";
}

/**
 * Candidate login id for the Nth attempt: the bare first name first, then
 * name2, name3, … so the shortest memorable id that's still unique wins.
 */
export function buildUserId(name: string, attempt: number): string {
  const base = baseUserId(name);
  return attempt === 0 ? base : `${base}${attempt + 1}`;
}
