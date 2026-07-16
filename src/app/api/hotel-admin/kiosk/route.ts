import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { generatePairingCode } from "@/lib/auth/kiosk";

/**
 * Hotel-admin management of reception kiosk devices.
 *   GET  → list paired devices for the admin's hotel
 *   POST → generate a short-lived pairing code for a new device
 * Restricted to HOTEL_ADMIN / SUPER_ADMIN (staff cannot pair kiosks).
 */

const PAIR_CODE_TTL_MIN = 10;

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.hotelId) return null;
  if (session.user.role !== "HOTEL_ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return null;
  }
  return { hotelId: session.user.hotelId };
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const devices = await prisma.kioskDevice.findMany({
    where: { hotelId: admin.hotelId },
    select: { id: true, name: true, isActive: true, pairedAt: true, lastSeenAt: true },
    orderBy: { pairedAt: "desc" },
  });
  return NextResponse.json({ devices });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === "string" && body.name.trim()
    ? body.name.trim().slice(0, 60)
    : "Reception Kiosk";

  // Generate a unique 6-digit code (retry on the vanishingly rare collision).
  let code = generatePairingCode();
  for (let i = 0; i < 5; i++) {
    const clash = await prisma.kioskPairingCode.findUnique({ where: { code } });
    if (!clash) break;
    code = generatePairingCode();
  }

  const expiresAt = new Date(Date.now() + PAIR_CODE_TTL_MIN * 60_000);
  await prisma.kioskPairingCode.create({
    data: { hotelId: admin.hotelId, name, code, expiresAt },
  });

  return NextResponse.json({ code, name, expiresAt, ttlMinutes: PAIR_CODE_TTL_MIN });
}
