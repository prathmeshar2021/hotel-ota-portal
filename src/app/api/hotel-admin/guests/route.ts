import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { guestSearchOr } from "@/lib/utils/guest-search";
import { z } from "zod";
import type { Session } from "next-auth";

function adminGuard(session: Session | null) {
  if (!session?.user?.hotelId) return false;
  return (
    session.user.role === "HOTEL_ADMIN" ||
    session.user.role === "HOTEL_STAFF" ||
    session.user.role === "SUPER_ADMIN"
  );
}

// GET /api/hotel-admin/guests?q=search_term
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!adminGuard(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);

  const guests = await prisma.guest.findMany({
    where: { OR: await guestSearchOr(q) },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      idType: true,
      idNumber: true,
      _count: { select: { bookings: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return NextResponse.json(guests);
}

// POST /api/hotel-admin/guests — create a walk-in guest
const CreateGuestSchema = z.object({
  name: z.string().min(2),
  phone: z.string().regex(/^\d{10}$/, "Must be 10 digits"),
  email: z.string().email().optional().or(z.literal("")),
  idType: z.enum(["AADHAR", "DRIVING_LICENSE", "PASSPORT", "VOTER_ID", "OTHER"]).optional(),
  idNumber: z.string().optional(),
  idFrontUrl: z.string().url().optional().or(z.literal("")),
  idBackUrl: z.string().url().optional().or(z.literal("")),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!adminGuard(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = CreateGuestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { name, phone, email, idType, idNumber, idFrontUrl, idBackUrl } = parsed.data;

  const existing = await prisma.guest.findUnique({ where: { phone } });
  if (existing) {
    return NextResponse.json({ error: "A guest with this phone number already exists", existing }, { status: 409 });
  }

  const guest = await prisma.guest.create({
    data: {
      name,
      phone,
      email: email || undefined,
      idType: idType || undefined,
      idNumber: idNumber || undefined,
      idFrontUrl: idFrontUrl || undefined,
      idBackUrl: idBackUrl || undefined,
    },
  });

  return NextResponse.json(guest, { status: 201 });
}
