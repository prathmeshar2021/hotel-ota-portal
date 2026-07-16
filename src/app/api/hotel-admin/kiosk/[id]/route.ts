import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";

/**
 * Deactivate (revoke) a kiosk device. A revoked device's token is rejected by
 * requireKiosk on the very next request — instantly killing a lost/stolen
 * tablet. Restricted to HOTEL_ADMIN / SUPER_ADMIN.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.hotelId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "HOTEL_ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Scope the update to the admin's own hotel so one hotel can't revoke
  // another's device.
  const result = await prisma.kioskDevice.updateMany({
    where: { id, hotelId: session.user.hotelId },
    data: { isActive: false },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
