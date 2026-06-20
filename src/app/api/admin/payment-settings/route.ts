import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/superAdmin";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";

const Schema = z.object({
  allowPayAtHotel: z.boolean(),
  allowPartialPay: z.boolean(),
});

export async function GET() {
  const ctx = await requireSuperAdmin();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const hotel = await prisma.hotel.findUnique({
    where: { id: ctx.hotelId },
    select: { allowPayAtHotel: true, allowPartialPay: true },
  });

  if (!hotel) return NextResponse.json({ error: "Hotel not found" }, { status: 404 });

  return NextResponse.json(hotel);
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireSuperAdmin();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const hotel = await prisma.hotel.update({
    where: { id: ctx.hotelId },
    data: parsed.data,
    select: { allowPayAtHotel: true, allowPartialPay: true },
  });

  return NextResponse.json(hotel);
}
