import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

// GET /api/hotel-admin/otp — list pending/issued OTP requests for this hotel
// Used by the Pending Approvals page so admin can see what's waiting.
export async function GET() {
  const session = await auth();
  if (!session?.user?.hotelId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (
    session.user.role !== "HOTEL_ADMIN" &&
    session.user.role !== "HOTEL_STAFF" &&
    session.user.role !== "SUPER_ADMIN"
  )
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const items = await prisma.adminOtp.findMany({
    where: {
      hotelId: session.user.hotelId,
      status: { in: ["PENDING", "ISSUED"] },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      purpose: true,
      description: true,
      amount: true,
      refId: true,
      actionPayload: true,
      status: true,
      requestedBy: true,
      issuedAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json(items);
}
