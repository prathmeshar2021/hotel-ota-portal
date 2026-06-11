import { prisma } from "@/lib/db/prisma";

/** Normalise an email for storage/matching (emails are case-insensitive). */
export function normalizeEmail(email?: string | null): string | undefined {
  const e = email?.trim().toLowerCase();
  return e || undefined;
}

/**
 * Link contact identifiers onto a guest's single account.
 *
 * Whenever a guest provides an email/phone/name (e.g. while booking or checking
 * in), fill in any of those fields that are still missing on their account — so
 * the same account becomes reachable by BOTH phone-login and Google-login, and
 * both identifiers show up everywhere we use the guest.
 *
 * A field is skipped when another guest already holds that unique value (we
 * don't auto-merge two existing accounts — that would need reassigning bookings).
 */
export async function linkGuestContact(
  guestId: string,
  details: { email?: string | null; phone?: string | null; name?: string | null }
): Promise<void> {
  const guest = await prisma.guest.findUnique({
    where: { id: guestId },
    select: { id: true, email: true, phone: true, name: true },
  });
  if (!guest) return;

  const data: { email?: string; phone?: string; name?: string } = {};

  const email = normalizeEmail(details.email);
  if (email && !guest.email) {
    const taken = await prisma.guest.findFirst({
      where: { email, NOT: { id: guestId } },
      select: { id: true },
    });
    if (!taken) data.email = email;
  }

  const phone = details.phone?.replace(/\D/g, "");
  if (phone && phone.length === 10 && !guest.phone) {
    const taken = await prisma.guest.findFirst({
      where: { phone, NOT: { id: guestId } },
      select: { id: true },
    });
    if (!taken) data.phone = phone;
  }

  const name = details.name?.trim();
  if (name && (!guest.name || guest.name.toLowerCase() === "guest")) {
    data.name = name;
  }

  if (Object.keys(data).length > 0) {
    await prisma.guest.update({ where: { id: guestId }, data });
  }
}
