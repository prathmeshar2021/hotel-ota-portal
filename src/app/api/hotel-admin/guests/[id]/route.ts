import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
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

const UpdateGuestSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").optional(),
  phone: z
    .string()
    .regex(/^\d{10}$/, "Must be a 10-digit number")
    .optional()
    .nullable(),
  email: z.string().email("Invalid email").optional().or(z.literal("")).nullable(),
  idType: z
    .enum(["AADHAR", "DRIVING_LICENSE", "PASSPORT", "VOTER_ID", "OTHER"])
    .optional()
    .nullable(),
  idNumber: z.string().optional().nullable(),
  idFrontUrl: z.string().url().optional().or(z.literal("")).nullable(),
  idBackUrl: z.string().url().optional().or(z.literal("")).nullable(),
});

interface Params { id: string }

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const session = await auth();
  if (!adminGuard(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const guest = await prisma.guest.findUnique({ where: { id } });
  if (!guest) {
    return NextResponse.json({ error: "Guest not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = UpdateGuestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { name, phone, email, idType, idNumber, idFrontUrl, idBackUrl } = parsed.data;

  // Check phone uniqueness if being changed
  if (phone && phone !== guest.phone) {
    const conflict = await prisma.guest.findUnique({ where: { phone } });
    if (conflict) {
      return NextResponse.json(
        { error: "Another guest with this phone number already exists" },
        { status: 409 }
      );
    }
  }

  const updated = await prisma.guest.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(phone !== undefined && { phone: phone ?? null }),
      ...(email !== undefined && { email: email || null }),
      ...(idType !== undefined && { idType: idType ?? null }),
      ...(idNumber !== undefined && { idNumber: idNumber || null }),
      ...(idFrontUrl !== undefined && { idFrontUrl: idFrontUrl || null }),
      ...(idBackUrl !== undefined && { idBackUrl: idBackUrl || null }),
    },
  });

  return NextResponse.json(updated);
}
