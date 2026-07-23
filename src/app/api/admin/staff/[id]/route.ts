import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireSuperAdmin } from "@/lib/auth/superAdmin";
import { prisma } from "@/lib/db/prisma";
import { generatePassword } from "@/lib/services/staff-credentials";

const PatchSchema = z.object({
  action: z.enum(["reset", "activate", "deactivate"]),
});

/**
 * PATCH /api/admin/staff/[id] — super admin manages an existing staff account.
 *   reset      → regenerate a default password (returned once)
 *   activate   → re-enable login
 *   deactivate → block login (kept for records)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireSuperAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const parsed = PatchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  // Scope to this super admin's hotel.
  const staff = await prisma.hotelStaff.findFirst({
    where: { id, hotelId: ctx.hotelId },
    select: { id: true },
  });
  if (!staff) return NextResponse.json({ error: "Staff not found" }, { status: 404 });

  if (parsed.data.action === "reset") {
    const password = generatePassword();
    const hash = await bcrypt.hash(password, 12);
    await prisma.hotelStaff.update({ where: { id }, data: { password: hash } });
    return NextResponse.json({ success: true, credentials: { password } });
  }

  const isActive = parsed.data.action === "activate";
  await prisma.hotelStaff.update({ where: { id }, data: { isActive } });
  return NextResponse.json({ success: true, isActive });
}
