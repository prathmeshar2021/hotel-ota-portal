import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
});

/**
 * POST /api/hotel-admin/account/password — a logged-in staff member changes
 * their own password. Verifies the current password before updating.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = ChangePasswordSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { currentPassword, newPassword } = parsed.data;

  // Self-service change targets the staff account the session belongs to.
  const staff = await prisma.hotelStaff.findUnique({
    where: { id: session.user.id },
    select: { id: true, password: true },
  });
  if (!staff) {
    return NextResponse.json(
      { error: "Password change is only available for staff accounts." },
      { status: 400 }
    );
  }

  const valid = await bcrypt.compare(currentPassword, staff.password);
  if (!valid) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }

  const hash = await bcrypt.hash(newPassword, 12);
  await prisma.hotelStaff.update({ where: { id: staff.id }, data: { password: hash } });

  return NextResponse.json({ success: true, message: "Password updated" });
}
