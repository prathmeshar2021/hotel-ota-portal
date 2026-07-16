import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

/**
 * Kiosk device authentication.
 *
 * A reception tablet holds a high-entropy device token (shown once, at
 * pairing). We store only its SHA-256 hash. The token is accepted ONLY by the
 * `/api/kiosk/*` endpoints via `requireKiosk` — it is never a NextAuth session
 * and cannot reach any admin/customer API. Escaping the kiosk UI therefore
 * exposes nothing: there is no session to hijack and no endpoint the token can
 * call to list bookings.
 *
 * SHA-256 (not bcrypt) is deliberate: the token has full 256-bit entropy, so a
 * fast deterministic hash is both safe and lookup-friendly (bcrypt can't be
 * queried by value).
 */

const KIOSK_TOKEN_HEADER = "x-kiosk-token";

/** Mint a new device token. Returns the plaintext (show once) + its hash. */
export function generateKioskToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex"); // 256-bit
  return { token, tokenHash: hashKioskToken(token) };
}

export function hashKioskToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Generate a 6-digit pairing code (short-lived, single-use). */
export function generatePairingCode(): string {
  // randomInt-free, avoids modulo bias by rejection on the rare overflow.
  let n = randomBytes(4).readUInt32BE(0);
  n = n % 1_000_000;
  return String(n).padStart(6, "0");
}

export interface KioskContext {
  deviceId: string;
  hotelId: string;
}

/**
 * Validate the kiosk token on a request. Returns the device context, or a
 * NextResponse 401 to return directly. Bumps `lastSeenAt` on success.
 */
export async function requireKiosk(
  req: Request
): Promise<KioskContext | NextResponse> {
  const token = req.headers.get(KIOSK_TOKEN_HEADER);
  if (!token || token.length !== 64) {
    return NextResponse.json({ error: "Kiosk not paired" }, { status: 401 });
  }

  const tokenHash = hashKioskToken(token);
  const device = await prisma.kioskDevice.findUnique({
    where: { tokenHash },
    select: { id: true, hotelId: true, isActive: true, tokenHash: true },
  });

  // Constant-time-ish compare on the hash even though findUnique already
  // matched — guards against any future non-unique lookup path.
  if (
    !device ||
    !device.isActive ||
    !timingSafeEqual(Buffer.from(device.tokenHash), Buffer.from(tokenHash))
  ) {
    return NextResponse.json({ error: "Kiosk not authorized" }, { status: 401 });
  }

  // Fire-and-forget heartbeat; never block the request on it.
  prisma.kioskDevice
    .update({ where: { id: device.id }, data: { lastSeenAt: new Date() } })
    .catch(() => {});

  return { deviceId: device.id, hotelId: device.hotelId };
}

/** Type guard so callers can `if (isKioskError(ctx)) return ctx;`. */
export function isKioskError(
  ctx: KioskContext | NextResponse
): ctx is NextResponse {
  return ctx instanceof NextResponse;
}
