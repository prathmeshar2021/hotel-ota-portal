import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/superAdmin";
import { prisma } from "@/lib/db/prisma";
import { defaultCapacity } from "@/lib/utils/inventory";
import type { RoomType } from "@prisma/client";

const VALID_TYPES: RoomType[] = [
  "NON_AC_ROOM",
  "PREMIUM_AC_ROOM",
  "CAVE_AC_ROOM",
  "PINEWOOD_COTTAGE",
  "THEATRE_COTTAGE",
  "LUXURY_COTTAGE",
];

function eachDate(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  while (d <= end) {
    out.push(new Date(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

// ─── GET: default capacities + upcoming inventory overrides ──────────────────
export async function GET() {
  const ctx = await requireSuperAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const overridesRaw = await prisma.roomInventory.findMany({
    where: { hotelId: ctx.hotelId, date: { gte: today } },
    orderBy: { date: "asc" },
  });

  const overrides = overridesRaw.map((o) => ({
    id: o.id,
    roomType: o.roomType,
    date: o.date.toISOString().slice(0, 10),
    units: o.units,
    note: o.note,
  }));

  return NextResponse.json({ overrides });
}

// ─── POST: set inventory ─────────────────────────────────────────────────────
// Date range bulk: { roomType, units, fromDate, toDate, note? }
// Single date:     { roomType, units, date, note? }
export async function POST(req: NextRequest) {
  const ctx = await requireSuperAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const roomType = body.roomType as RoomType;
  const units = Number(body.units);
  if (!VALID_TYPES.includes(roomType))
    return NextResponse.json({ error: "Invalid roomType" }, { status: 400 });
  if (!Number.isInteger(units) || units < 0)
    return NextResponse.json({ error: "Units must be a non-negative whole number" }, { status: 400 });

  const fromStr = body.fromDate ?? body.date;
  const toStr = body.toDate ?? body.date;
  if (!fromStr || !toStr)
    return NextResponse.json({ error: "Provide a date or date range" }, { status: 400 });

  const from = new Date(fromStr);
  const to = new Date(toStr);
  if (isNaN(from.getTime()) || isNaN(to.getTime()))
    return NextResponse.json({ error: "Invalid dates" }, { status: 400 });
  if (to < from)
    return NextResponse.json({ error: "End date must be after start date" }, { status: 400 });

  const dates = eachDate(from, to);
  if (dates.length > 366)
    return NextResponse.json({ error: "Range too large (max 1 year)" }, { status: 400 });

  await prisma.$transaction(
    dates.map((date) =>
      prisma.roomInventory.upsert({
        where: { hotelId_roomType_date: { hotelId: ctx.hotelId, roomType, date } },
        create: { hotelId: ctx.hotelId, roomType, date, units, note: body.note || null },
        update: { units, note: body.note || null },
      })
    )
  );

  return NextResponse.json({ ok: true, count: dates.length, default: defaultCapacity(roomType) });
}

// ─── DELETE: remove an override (revert to default) ──────────────────────────
// query: ?id=...  OR  ?roomType=...&date=YYYY-MM-DD
export async function DELETE(req: NextRequest) {
  const ctx = await requireSuperAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (id) {
    await prisma.roomInventory.deleteMany({ where: { id, hotelId: ctx.hotelId } });
    return NextResponse.json({ ok: true });
  }

  const roomType = searchParams.get("roomType") as RoomType | null;
  const date = searchParams.get("date");
  if (!roomType || !date)
    return NextResponse.json({ error: "Provide id or roomType+date" }, { status: 400 });

  await prisma.roomInventory.deleteMany({
    where: { hotelId: ctx.hotelId, roomType, date: new Date(date) },
  });
  return NextResponse.json({ ok: true });
}
