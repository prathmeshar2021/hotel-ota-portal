import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

/**
 * GET /api/hotel-admin/guests/search?q=<name | phone | id number>
 * Returns matching guests (with their stored ID) so staff can pre-fill check-in
 * details for a returning guest/companion instead of re-typing.
 * Scoped to guests who've stayed at this hotel (as primary guest or companion).
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.hotelId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "HOTEL_ADMIN" && session.user.role !== "HOTEL_STAFF" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ guests: [] });

  const digits = q.replace(/\D/g, "");
  const hotelId = session.user.hotelId;

  const matchOr: Prisma.GuestWhereInput[] = [
    { name: { contains: q, mode: "insensitive" } },
    { idNumber: { contains: q, mode: "insensitive" } },
  ];
  if (digits.length >= 3) matchOr.push({ phone: { contains: digits } });

  const guests = await prisma.guest.findMany({
    where: {
      AND: [
        { OR: matchOr },
        // Guests connected to this hotel (privacy + relevance), plus imported /
        // standalone guests that have no booking history anywhere yet — those
        // belong to no other hotel, so surfacing them here is safe and lets
        // staff pick a returning guest imported from the old system.
        {
          OR: [
            { bookings: { some: { hotelId } } },
            { companionIn: { some: { booking: { hotelId } } } },
            { AND: [{ bookings: { none: {} } }, { companionIn: { none: {} } }] },
          ],
        },
      ],
    },
    select: {
      id: true,
      name: true,
      phone: true,
      idType: true,
      idNumber: true,
      idFrontUrl: true,
      idBackUrl: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 8,
  });

  return NextResponse.json({ guests });
}
