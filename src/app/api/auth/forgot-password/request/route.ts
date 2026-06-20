import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { gupshup } from "@/lib/services/gupshup";
import { email } from "@/lib/services/email";
import { enforceRateLimit } from "@/lib/ratelimit";

const Schema = z.object({ phone: z.string().regex(/^\d{10}$/) });

export async function POST(req: NextRequest) {
  // Tight limit — this sends a WhatsApp message and probes account existence.
  const limited = await enforceRateLimit(req, { name: "pwreset-request", limit: 5, windowSec: 600 });
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  // Always respond the same way, regardless of validity/existence, to avoid
  // leaking which phone numbers have accounts (enumeration).
  const ok = NextResponse.json({
    success: true,
    message: "If an account exists for this number, a reset code has been sent on WhatsApp.",
  });
  if (!parsed.success) return ok;

  const { phone } = parsed.data;
  const guest = await prisma.guest.findUnique({
    where: { phone },
    select: { id: true, name: true, password: true, email: true },
  });
  // Only accounts with a password (phone-login) can reset; Google users have none.
  if (!guest?.password) return ok;

  const otp = String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + 10 * 60_000); // 10 minutes

  await prisma.passwordReset.upsert({
    where: { phone },
    create: { phone, otpHash, expiresAt, attempts: 0 },
    update: { otpHash, expiresAt, attempts: 0 },
  });

  try {
    await gupshup.sendPasswordResetOtp(phone, { otp, name: guest.name });
  } catch (e) {
    console.error("[pwreset] WhatsApp send failed:", e);
  }
  if (guest.email) {
    email.sendPasswordResetOtp(guest.email, { otp, name: guest.name })
      .catch((e) => console.error("[pwreset] Email send failed:", e));
  }

  return ok;
}
