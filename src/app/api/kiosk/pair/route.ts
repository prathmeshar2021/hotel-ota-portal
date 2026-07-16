import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";
import { generateKioskToken } from "@/lib/auth/kiosk";
import { enforceRateLimit } from "@/lib/ratelimit";

/**
 * Tablet-side pairing: redeem a 6-digit code (from hotel-admin) for a device
 * token. Single-use + short expiry + rate-limited redemption make brute-forcing
 * the 1,000,000-code space infeasible.
 */

const Schema = z.object({ code: z.string().regex(/^\d{6}$/) });

export async function POST(req: NextRequest) {
  // Hard cap redemption attempts per IP to defeat code guessing.
  const limited = await enforceRateLimit(req, { name: "kiosk-pair", limit: 10, windowSec: 600 });
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter the 6-digit code from the admin panel." }, { status: 400 });
  }

  const pairing = await prisma.kioskPairingCode.findUnique({
    where: { code: parsed.data.code },
  });

  if (!pairing || pairing.usedAt || pairing.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "This code is invalid or has expired. Generate a new one." },
      { status: 400 }
    );
  }

  const { token, tokenHash } = generateKioskToken();

  // Consume the code and create the device atomically.
  const [, device] = await prisma.$transaction([
    prisma.kioskPairingCode.update({
      where: { id: pairing.id },
      data: { usedAt: new Date() },
    }),
    prisma.kioskDevice.create({
      data: { hotelId: pairing.hotelId, name: pairing.name, tokenHash },
      select: { id: true, name: true },
    }),
  ]);

  // Token returned exactly once — the tablet stores it; we only keep the hash.
  return NextResponse.json({ token, device });
}
