import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { requireKiosk, isKioskError } from "@/lib/auth/kiosk";
import { enforceRateLimit } from "@/lib/ratelimit";

/**
 * Staff exit gate. Validates the exit PIN before the tablet leaves kiosk mode.
 * The PIN is a soft gate (it stops a guest wandering out of the kiosk) — the
 * real protection is that /hotel-admin requires a staff login.
 *
 * PIN precedence: the hotel's configured PIN (set in the admin kiosk page) →
 * the KIOSK_EXIT_PIN env fallback → pass-through when neither is set.
 */

const Schema = z.object({ pin: z.string().min(1).max(12) });

export async function POST(req: NextRequest) {
  const ctx = await requireKiosk(req);
  if (isKioskError(ctx)) return ctx;

  const limited = await enforceRateLimit(req, { name: "kiosk-exit", limit: 10, windowSec: 300 });
  if (limited) return limited;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "PIN required" }, { status: 400 });
  }

  const hotel = await prisma.hotel.findUnique({
    where: { id: ctx.hotelId },
    select: { kioskExitPinHash: true },
  });

  if (hotel?.kioskExitPinHash) {
    const ok = await bcrypt.compare(parsed.data.pin, hotel.kioskExitPinHash);
    if (!ok) return NextResponse.json({ error: "Wrong PIN" }, { status: 401 });
    return NextResponse.json({ success: true });
  }

  const envPin = process.env.KIOSK_EXIT_PIN;
  if (envPin && parsed.data.pin !== envPin) {
    return NextResponse.json({ error: "Wrong PIN" }, { status: 401 });
  }

  return NextResponse.json({ success: true });
}
