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

/** Generate a 6-digit code (pairing codes, OTPs). */
export function generate6DigitCode(): string {
  const n = randomBytes(4).readUInt32BE(0) % 1_000_000;
  return String(n).padStart(6, "0");
}

/** Back-compat alias. */
export const generatePairingCode = generate6DigitCode;

/** High-entropy opaque bearer token (lookup / check-in session ids). */
export function randomToken(): string {
  return randomBytes(24).toString("hex"); // 48 chars
}

/** Mask a guest name for pre-verification display: "Rohit Sharma" → "R•••• Sharma". */
export function maskName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Guest";
  const first = parts[0];
  const masked = first.length <= 1 ? first : first[0] + "•".repeat(Math.min(4, Math.max(1, first.length - 1)));
  return [masked, ...parts.slice(1)].join(" ");
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
