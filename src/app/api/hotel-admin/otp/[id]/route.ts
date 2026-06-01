import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

// GET /api/hotel-admin/otp/[id] — poll a single request's status
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.hotelId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (
    session.user.role !== "HOTEL_ADMIN" &&
    session.user.role !== "HOTEL_STAFF" &&
    session.user.role !== "SUPER_ADMIN"
  )
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const otp = await prisma.adminOtp.findFirst({
    where: { id, hotelId: session.user.hotelId },
    select: { id: true, status: true, purpose: true },
  });
  if (!otp) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ id: otp.id, status: otp.status });
}
