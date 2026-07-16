import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireKiosk, isKioskError } from "@/lib/auth/kiosk";
import { enforceRateLimit } from "@/lib/ratelimit";

/**
 * Staff exit gate. Validates the exit PIN before the tablet leaves kiosk mode.
 * The PIN is a soft gate (it stops a guest wandering out of the kiosk) — the
 * real protection is that /hotel-admin requires a staff login. When no PIN is
 * configured, the gate passes through.
 *
 * Phase 6 will make this a per-device PIN set from the admin panel; for now it
 * reads KIOSK_EXIT_PIN.
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

  const configured = process.env.KIOSK_EXIT_PIN;
  if (configured && parsed.data.pin !== configured) {
    return NextResponse.json({ error: "Wrong PIN" }, { status: 401 });
  }

  return NextResponse.json({ success: true });
}
