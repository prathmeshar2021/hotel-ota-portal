import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/superAdmin";
import { prisma } from "@/lib/db/prisma";
import { generateOtpCode } from "@/lib/utils/otp";

// POST /api/admin/otp/[id]/issue — owner issues a permanent code for a request
// OTPs no longer expire; they are valid until used or rejected.
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

  const updated = await prisma.adminOtp.update({
    where: { id },
    data: {
      code,
      status: "ISSUED",
      issuedBy: ctx.name,
      issuedAt: new Date(),
      expiresAt: null, // no expiry
    },
  });

  return NextResponse.json({ id: updated.id, code });
}
