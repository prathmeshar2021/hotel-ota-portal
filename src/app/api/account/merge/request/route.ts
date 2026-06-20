import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { gupshup } from "@/lib/services/gupshup";
import { email } from "@/lib/services/email";
import bcrypt from "bcryptjs";
import { z } from "zod";

const Schema = z.object({
  phone: z.string().regex(/^\d{10}$/, "Invalid phone number"),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "CUSTOMER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const { phone } = parsed.data;

  // Confirm the phone still belongs to a different account.
  const otherGuest = await prisma.guest.findUnique({
    where: { phone },
    select: { id: true, name: true, email: true },
  });
  if (!otherGuest || otherGuest.id === session.user.id) {
    return NextResponse.json({ error: "Account not found for this number" }, { status: 404 });
  }

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + 10 * 60_000);

  await prisma.passwordReset.upsert({
    where: { phone },
    create: { phone, otpHash, expiresAt, attempts: 0 },
    update: { otpHash, expiresAt, attempts: 0 },
  });

  // Send OTP to the phone being claimed (proves ownership).
  try {
    await gupshup.sendPasswordResetOtp(phone, { otp, name: otherGuest.name });
  } catch (e) {
    console.error("[merge] WhatsApp OTP failed:", e);
  }
  if (otherGuest.email) {
    email.sendPasswordResetOtp(otherGuest.email, { otp, name: otherGuest.name })
      .catch((e) => console.error("[merge] Email OTP failed:", e));
  }

  return NextResponse.json({ success: true });
}
