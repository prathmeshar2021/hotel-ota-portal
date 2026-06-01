import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/superAdmin";
import { prisma } from "@/lib/db/prisma";
import { gupshup } from "@/lib/services/gupshup";
import { discountLabel } from "@/lib/utils/coupon";

// POST /api/admin/coupons/[id]/send  body: { phone: string, guestName?: string }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireSuperAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const phoneRaw: string = body?.phone ?? "";
  const phone = phoneRaw.replace(/\D/g, "");
  if (phone.length < 10)
    return NextResponse.json({ error: "Enter a valid phone number" }, { status: 400 });

  const coupon = await prisma.coupon.findFirst({
    where: { id, hotelId: ctx.hotelId },
    include: { promotion: { select: { name: true } } },
  });
  if (!coupon)
    return NextResponse.json({ error: "Coupon not found" }, { status: 404 });

  try {
    await gupshup.sendCoupon(phone, {
      code: coupon.code,
      hotelName: ctx.hotelName,
      discountLabel: discountLabel(coupon.discountType, coupon.discountValue),
      expiry: coupon.expiryDate
        ? coupon.expiryDate.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : undefined,
      guestName: body?.guestName || undefined,
      note: coupon.promotion?.name || coupon.label || undefined,
    });
  } catch (err) {
    console.error("Coupon WhatsApp send failed:", err);
    return NextResponse.json(
      { error: "Failed to send WhatsApp message" },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
