import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "CUSTOMER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const guest = await prisma.guest.findUnique({
    where: { id: session.user.id },
    select: { name: true, phone: true, email: true },
  });
  if (!guest) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(guest);
}
