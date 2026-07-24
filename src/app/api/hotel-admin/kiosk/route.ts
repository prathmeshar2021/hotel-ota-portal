import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import bcrypt from "bcryptjs";
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
  // Kiosk device management is super-admin only.
  if (session.user.role !== "SUPER_ADMIN") {
    return null;
  }
  return { hotelId: session.user.hotelId };
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [devices, hotel] = await Promise.all([
    prisma.kioskDevice.findMany({
      where: { hotelId: admin.hotelId },
      select: { id: true, name: true, isActive: true, pairedAt: true, lastSeenAt: true },
      orderBy: { pairedAt: "desc" },
    }),
    prisma.hotel.findUnique({ where: { id: admin.hotelId }, select: { kioskExitPinHash: true } }),
  ]);
  return NextResponse.json({ devices, exitPinSet: !!hotel?.kioskExitPinHash });
}

/** Set or clear the staff-exit PIN. Body: { pin: "1234" } to set, { pin: "" } to clear. */
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const pin = typeof body?.pin === "string" ? body.pin.trim() : "";

  if (pin && !/^\d{4,8}$/.test(pin)) {
    return NextResponse.json({ error: "PIN must be 4–8 digits." }, { status: 400 });
  }

  await prisma.hotel.update({
    where: { id: admin.hotelId },
    data: { kioskExitPinHash: pin ? await bcrypt.hash(pin, 10) : null },
  });
  return NextResponse.json({ success: true, exitPinSet: !!pin });
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
