import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/superAdmin";
import { prisma } from "@/lib/db/prisma";
import type { RoomType } from "@prisma/client";

const VALID_TYPES: RoomType[] = [
  "NON_AC_ROOM",
  "PREMIUM_AC_ROOM",
  "CAVE_AC_ROOM",
  "PINEWOOD_COTTAGE",
  "THEATRE_COTTAGE",
  "LUXURY_COTTAGE",
];

// ─── GET: base prices per category + upcoming date overrides ─────────────────
export async function GET() {
  const ctx = await requireSuperAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rooms = await prisma.room.findMany({
    where: { hotelId: ctx.hotelId, isActive: true },
    select: { id: true, roomType: true, basePrice: true },
  });

  // base price per category (first room of each type)
  const baseByType: Record<string, number> = {};
  const roomIdsByType: Record<string, string[]> = {};
  for (const r of rooms) {
    if (!(r.roomType in baseByType)) baseByType[r.roomType] = r.basePrice;
    (roomIdsByType[r.roomType] ??= []).push(r.id);
  }

  // upcoming / current overrides
  const overridesRaw = await prisma.roomRate.findMany({
    where: {
      roomId: { in: rooms.map((r) => r.id) },
      toDate: { gte: new Date() },
    },
    orderBy: { fromDate: "asc" },
  });

  // collapse per-room overrides into category-level entries (dedupe identical ranges)
  const roomToType = new Map(rooms.map((r) => [r.id, r.roomType]));
  const seen = new Set<string>();
  const overrides = overridesRaw
    .map((o) => ({
      id: o.id,
      roomType: roomToType.get(o.roomId) as string,
      fromDate: o.fromDate.toISOString(),
      toDate: o.toDate.toISOString(),
      price: o.price,
      label: o.label,
    }))
    .filter((o) => {
      const key = `${o.roomType}|${o.fromDate}|${o.toDate}|${o.price}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return NextResponse.json({ baseByType, overrides });
}

// ─── POST: update pricing ────────────────────────────────────────────────────
// Bulk (base price):  { mode: "bulk", roomType, price }
// Date-wise override: { mode: "dates", roomType, price, fromDate, toDate, label? }
export async function POST(req: NextRequest) {
  const ctx = await requireSuperAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const roomType = body.roomType as RoomType;
  const price = Number(body.price);
  if (!VALID_TYPES.includes(roomType))
    return NextResponse.json({ error: "Invalid roomType" }, { status: 400 });
  if (!Number.isFinite(price) || price <= 0)
    return NextResponse.json({ error: "Invalid price" }, { status: 400 });

  const rooms = await prisma.room.findMany({
    where: { hotelId: ctx.hotelId, roomType, isActive: true },
    select: { id: true },
  });
  if (rooms.length === 0)
    return NextResponse.json({ error: "No rooms found for this category" }, { status: 404 });

  if (body.mode === "bulk") {
    await prisma.room.updateMany({
      where: { hotelId: ctx.hotelId, roomType, isActive: true },
      data: { basePrice: price },
    });
    return NextResponse.json({ ok: true, updated: rooms.length });
  }

  if (body.mode === "dates") {
    const fromDate = new Date(body.fromDate);
    const toDate = new Date(body.toDate);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime()))
      return NextResponse.json({ error: "Invalid dates" }, { status: 400 });
    if (toDate < fromDate)
      return NextResponse.json({ error: "End date must be after start date" }, { status: 400 });

    fromDate.setHours(0, 0, 0, 0);
    toDate.setHours(23, 59, 59, 999);

    await prisma.roomRate.createMany({
      data: rooms.map((r) => ({
        roomId: r.id,
        fromDate,
        toDate,
        price,
        label: body.label || null,
      })),
    });
    return NextResponse.json({ ok: true, created: rooms.length });
  }

  return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
}

// ─── DELETE: remove a date override (by category + range) ────────────────────
// query: ?roomType=...&fromDate=ISO&toDate=ISO&price=...
export async function DELETE(req: NextRequest) {
  const ctx = await requireSuperAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const roomType = searchParams.get("roomType") as RoomType | null;
  const fromDate = searchParams.get("fromDate");
  const toDate = searchParams.get("toDate");
  const price = searchParams.get("price");
  if (!roomType || !fromDate || !toDate)
    return NextResponse.json({ error: "Missing params" }, { status: 400 });

  const rooms = await prisma.room.findMany({
    where: { hotelId: ctx.hotelId, roomType, isActive: true },
    select: { id: true },
  });

  await prisma.roomRate.deleteMany({
    where: {
      roomId: { in: rooms.map((r) => r.id) },
      fromDate: new Date(fromDate),
      toDate: new Date(toDate),
      ...(price ? { price: Number(price) } : {}),
    },
  });

  return NextResponse.json({ ok: true });
}
