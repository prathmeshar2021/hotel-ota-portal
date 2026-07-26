import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

/**
 * Shared matching rules for every guest search bar in the admin panel, so a
 * staff member finds the same person whichever screen they're on and however
 * they type it.
 *
 * Real data is messy: names come in any case, some ID numbers are stored
 * grouped ("6808 6196 8588") and some bare, and staff paste phone numbers with
 * "+91", spaces or dashes. All comparisons here are therefore case-insensitive
 * and ignore separators.
 */

/** Digits only — phone numbers are stored bare, so "+91 75871-15157" still matches. */
export function phoneDigits(q: string): string {
  const digits = q.replace(/\D/g, "");
  // Numbers are stored as bare 10 digits, so drop anything pasted in front of
  // them — a "+91" country code or a leading "0" STD prefix.
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** Drop separators and upper-case, so "6808 6196 8588" == "680861968588". */
export function squashId(q: string): string {
  return q.replace(/[\s\-/.]/g, "").toUpperCase();
}

/**
 * Guest ids whose ID number matches once separators and case are ignored.
 * Prisma filters can't normalise the *stored* value, so the comparison runs in
 * SQL — this is what lets a bare "680861968588" find a grouped "6808 6196 8588"
 * (and vice versa). Values are parameterised by the tagged template.
 */
export async function guestIdsByIdNumber(q: string): Promise<string[]> {
  const needle = squashId(q);
  if (needle.length < 3) return [];
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Guest"
    WHERE "idNumber" IS NOT NULL
      AND UPPER(REPLACE(REPLACE(REPLACE("idNumber", ' ', ''), '-', ''), '/', ''))
          LIKE ${"%" + needle + "%"}
    LIMIT 200
  `;
  return rows.map(r => r.id);
}

/**
 * OR-clauses matching a guest by name, email, phone or ID number.
 * Await it once and spread into a Prisma `where`.
 */
export async function guestSearchOr(query: string): Promise<Prisma.GuestWhereInput[]> {
  const term = query.trim();
  if (!term) return [];

  const or: Prisma.GuestWhereInput[] = [
    { name:     { contains: term, mode: "insensitive" } },
    { email:    { contains: term, mode: "insensitive" } },
    { idNumber: { contains: term, mode: "insensitive" } },
  ];

  // Phones are stored as bare digits; only search once we have enough of them.
  const digits = phoneDigits(term);
  if (digits.length >= 3) or.push({ phone: { contains: digits } });

  // Separator-insensitive ID match (handles both storage styles).
  const ids = await guestIdsByIdNumber(term);
  if (ids.length > 0) or.push({ id: { in: ids } });

  return or;
}
