import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";

const Schema = z.discriminatedUnion("field", [
  z.object({
    field: z.literal("phone"),
    value: z.string().regex(/^\d{10}$/, "Enter a valid 10-digit phone number"),
  }),
  z.object({
    field: z.literal("email"),
    value: z.string().email("Enter a valid email address").transform((v) => v.trim().toLowerCase()),
  }),
]);

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "CUSTOMER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { field, value } = parsed.data;

  // Check uniqueness — reject if another guest already owns this contact detail.
  const conflict = await prisma.guest.findFirst({
    where: { [field]: value, NOT: { id: session.user.id } },
    select: { id: true },
  });
  if (conflict) {
    return NextResponse.json(
      { error: `This ${field === "phone" ? "mobile number" : "email address"} is already linked to another account.` },
      { status: 409 }
    );
  }

  await prisma.guest.update({
    where: { id: session.user.id },
    data: { [field]: value },
  });

  return NextResponse.json({ success: true });
}
