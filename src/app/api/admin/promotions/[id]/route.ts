import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/superAdmin";
import { prisma } from "@/lib/db/prisma";

// PATCH /api/admin/promotions/[id]  body: { isActive: boolean }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireSuperAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => null);

  const existing = await prisma.promotionScheme.findFirst({
    where: { id, hotelId: ctx.hotelId },
  });
  if (!existing)
    return NextResponse.json({ error: "Promotion not found" }, { status: 404 });

  const promotion = await prisma.promotionScheme.update({
    where: { id },
    data: { isActive: Boolean(body?.isActive) },
  });

  return NextResponse.json({ promotion });
}
