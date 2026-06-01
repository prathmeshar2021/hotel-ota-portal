import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/superAdmin";
import { prisma } from "@/lib/db/prisma";

// GET /api/admin/otp — pending queue + recent history for the super-admin approvals page
export async function GET() {
  const ctx = await requireSuperAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [pending, recent] = await Promise.all([
    prisma.adminOtp.findMany({
      where: { hotelId: ctx.hotelId, status: { in: ["PENDING", "ISSUED"] } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.adminOtp.findMany({
      where: { hotelId: ctx.hotelId, status: { in: ["USED", "REJECTED", "EXPIRED"] } },
      orderBy: { updatedAt: "desc" },
      take: 25,
    }),
  ]);

  const map = (o: (typeof pending)[number]) => ({
    id: o.id,
    purpose: o.purpose,
    description: o.description,
    amount: o.amount,
    refId: o.refId,
    actionPayload: o.actionPayload, // included so super admin can see booking ref etc.
    status: o.status,
    code: o.status === "ISSUED" ? o.code : null,
    requestedBy: o.requestedBy,
    issuedBy: o.issuedBy,
    createdAt: o.createdAt.toISOString(),
  });

  return NextResponse.json({
    pending: pending.map(map),
    recent: recent.map(map),
  });
}
