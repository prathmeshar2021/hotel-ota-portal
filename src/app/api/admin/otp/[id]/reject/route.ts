import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/superAdmin";
import { prisma } from "@/lib/db/prisma";

// POST /api/admin/otp/[id]/reject — owner declines a request
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireSuperAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const otp = await prisma.adminOtp.findFirst({
    where: { id, hotelId: ctx.hotelId },
  });
  if (!otp) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (otp.status === "USED")
    return NextResponse.json({ error: "Already used" }, { status: 409 });

  await prisma.adminOtp.update({
    where: { id },
    data: { status: "REJECTED", issuedBy: ctx.name },
  });

  return NextResponse.json({ ok: true });
}
