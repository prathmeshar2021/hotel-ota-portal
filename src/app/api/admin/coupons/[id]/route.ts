import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/superAdmin";
import { prisma } from "@/lib/db/prisma";

// PATCH /api/admin/coupons/[id]  body: { isActive: boolean }  → toggle active
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireSuperAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => null);

  const existing = await prisma.coupon.findFirst({
    where: { id, hotelId: ctx.hotelId },
  });
  if (!existing)
    return NextResponse.json({ error: "Coupon not found" }, { status: 404 });

  const coupon = await prisma.coupon.update({
    where: { id },
    data: { isActive: Boolean(body?.isActive) },
  });

  return NextResponse.json({ coupon });
}

// DELETE /api/admin/coupons/[id]  → only if never used
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireSuperAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.coupon.findFirst({
    where: { id, hotelId: ctx.hotelId },
  });
  if (!existing)
    return NextResponse.json({ error: "Coupon not found" }, { status: 404 });

  if (existing.usedCount > 0)
    return NextResponse.json(
      { error: "Cannot delete a coupon that has been used. Deactivate it instead." },
      { status: 409 }
    );

  await prisma.coupon.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
