import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const RegisterSchema = z.object({
  name: z.string().min(2),
  phone: z.string().regex(/^\d{10}$/, "Must be a 10-digit number"),
  email: z.string().email().optional(),
  password: z.string().min(6),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { name, phone, email, password } = parsed.data;

  const existing = await prisma.guest.findFirst({
    where: { OR: [{ phone }, ...(email ? [{ email }] : [])] },
  });
  if (existing) {
    return NextResponse.json({ error: "An account with this phone/email already exists" }, { status: 409 });
  }

  const hashed = await bcrypt.hash(password, 12);

  await prisma.guest.create({
    data: { name, phone, email, password: hashed },
  });

  return NextResponse.json({ success: true });
}
