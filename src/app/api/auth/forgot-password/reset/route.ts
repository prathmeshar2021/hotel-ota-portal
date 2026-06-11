import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { enforceRateLimit } from "@/lib/ratelimit";

const Schema = z.object({
  phone: z.string().regex(/^\d{10}$/),
  otp: z.string().regex(/^\d{6}$/),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const MAX_ATTEMPTS = 5;

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, { name: "pwreset-confirm", limit: 10, windowSec: 600 });
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }
  const { phone, otp, password } = parsed.data;

  const reset = await prisma.passwordReset.findUnique({ where: { phone } });
  if (!reset || reset.expiresAt < new Date()) {
    return NextResponse.json({ error: "Reset code expired. Please request a new one." }, { status: 400 });
  }
  if (reset.attempts >= MAX_ATTEMPTS) {
    await prisma.passwordReset.delete({ where: { phone } }).catch(() => {});
    return NextResponse.json({ error: "Too many incorrect attempts. Please request a new code." }, { status: 429 });
  }

  const valid = await bcrypt.compare(otp, reset.otpHash);
  if (!valid) {
    await prisma.passwordReset.update({ where: { phone }, data: { attempts: { increment: 1 } } });
    return NextResponse.json({ error: "Incorrect reset code." }, { status: 400 });
  }

  // Success — set the new password and consume the reset.
  const hash = await bcrypt.hash(password, 10);
  await prisma.guest.update({ where: { phone }, data: { password: hash } });
  await prisma.passwordReset.delete({ where: { phone } }).catch(() => {});

  return NextResponse.json({ success: true, message: "Password updated. Please sign in." });
}
