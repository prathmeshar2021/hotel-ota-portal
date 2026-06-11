import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { enforceRateLimit } from "@/lib/ratelimit";

const RegisterSchema = z.object({
  name: z.string().min(2),
  phone: z.string().regex(/^\d{10}$/, "Must be a 10-digit number"),
  email: z.string().email().optional(),
  password: z.string().min(6),
});

export async function POST(req: NextRequest) {
  // Public — rate limit to prevent fake-account spam.
  const limited = await enforceRateLimit(req, { name: "register", limit: 5, windowSec: 300 });
  if (limited) return limited;

  const body = await req.json();
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { name, phone, password } = parsed.data;
  const email = parsed.data.email?.trim().toLowerCase() || undefined;

  // Reuse an existing account (e.g. one created via Google with this email, or a
  // prior phone account) rather than erroring — set the password on it instead.
  const existing = await prisma.guest.findFirst({
    where: { OR: [{ phone }, ...(email ? [{ email }] : [])] },
  });

  const hashed = await bcrypt.hash(password, 12);

  if (existing) {
    if (existing.password) {
      return NextResponse.json(
        { error: "An account with this phone/email already exists. Please sign in." },
        { status: 409 }
      );
    }
    // Account exists without a password (e.g. created via Google or guest
    // checkout) — set the password, then safely link phone/email/name onto it.
    const { linkGuestContact } = await import("@/lib/utils/guest");
    await prisma.guest.update({ where: { id: existing.id }, data: { password: hashed } });
    await linkGuestContact(existing.id, { phone, email, name });
    return NextResponse.json({ success: true });
  }

  await prisma.guest.create({
    data: { name, phone, email, password: hashed },
  });

  return NextResponse.json({ success: true });
}
