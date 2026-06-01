import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/superAdmin";
import { prisma } from "@/lib/db/prisma";
import { generateOtpCode, OTP_TTL_MINUTES } from "@/lib/utils/otp";

// POST /api/admin/otp/[id]/issue — owner issues a 10-min code for a request
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

  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  const updated = await prisma.adminOtp.update({
    where: { id },
    data: {
      code,
      status: "ISSUED",
      issuedBy: ctx.name,
      issuedAt: new Date(),
      expiresAt,
    },
  });

  return NextResponse.json({
    id: updated.id,
    code,
    expiresAt: expiresAt.toISOString(),
  });
}
