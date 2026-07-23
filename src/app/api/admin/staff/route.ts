import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireSuperAdmin } from "@/lib/auth/superAdmin";
import { prisma } from "@/lib/db/prisma";
import { buildUserId, generatePassword } from "@/lib/services/staff-credentials";

const CreateStaffSchema = z.object({
  name: z.string().trim().min(2, "Staff name is required"),
  idPhotoUrl: z.string().url().optional().or(z.literal("")),
});

/**
 * POST /api/admin/staff — super admin provisions a new staff account.
 * Generates a login user id + default password (returned once), and stores an
 * optional ID document. Super-admin only.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireSuperAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = CreateStaffSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { name, idPhotoUrl } = parsed.data;

  // Pick the shortest memorable, still-unique login id: rahul, rahul2, rahul3 …
  let userId = "";
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = buildUserId(name, attempt);
    const clash = await prisma.hotelStaff.findUnique({ where: { email: candidate } });
    if (!clash) {
      userId = candidate;
      break;
    }
  }
  if (!userId) {
    return NextResponse.json({ error: "Could not generate a unique user id — try again" }, { status: 500 });
  }

  const password = generatePassword();
  const hash = await bcrypt.hash(password, 12);

  const staff = await prisma.hotelStaff.create({
    data: {
      hotelId: ctx.hotelId,
      name,
      email: userId,
      password: hash,
      role: "HOTEL_STAFF",
      idPhotoUrl: idPhotoUrl || null,
    },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
  });

  // Return the plaintext password exactly once so the super admin can hand it over.
  return NextResponse.json({ success: true, staff, credentials: { userId, password } }, { status: 201 });
}
