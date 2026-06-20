import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";

function isAdmin(role: string) {
  return ["HOTEL_ADMIN", "HOTEL_STAFF", "SUPER_ADMIN"].includes(role);
}

// GET — full thread (initial load) or incremental poll when ?after=ISO is provided.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const session = await auth();
  if (!session?.user?.hotelId || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { threadId } = await params;
  const after = new URL(req.url).searchParams.get("after");

  const thread = await prisma.supportThread.findFirst({
    where: { id: threadId, hotelId: session.user.hotelId },
    select: { id: true },
  });
  if (!thread) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Incremental poll — return only new messages.
  if (after) {
    const newer = await prisma.supportMessage.findMany({
      where: { threadId, createdAt: { gt: new Date(after) } },
      orderBy: { createdAt: "asc" },
    });
    await prisma.supportMessage.updateMany({
      where: { threadId, senderRole: "CUSTOMER", isRead: false },
      data: { isRead: true },
    });
    return NextResponse.json(newer);
  }

  // Full load.
  const full = await prisma.supportThread.findFirst({
    where: { id: threadId, hotelId: session.user.hotelId },
    include: {
      guest: { select: { name: true, phone: true, email: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  await prisma.supportMessage.updateMany({
    where: { threadId, senderRole: "CUSTOMER", isRead: false },
    data: { isRead: true },
  });
  return NextResponse.json(full);
}

// PATCH — toggle thread status (OPEN ↔ CLOSED).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const session = await auth();
  if (!session?.user?.hotelId || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { threadId } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = z.object({ status: z.enum(["OPEN", "CLOSED"]) }).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const thread = await prisma.supportThread.findFirst({
    where: { id: threadId, hotelId: session.user.hotelId },
    select: { id: true },
  });
  if (!thread) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.supportThread.update({
    where: { id: threadId },
    data: { status: parsed.data.status },
  });

  return NextResponse.json({ success: true });
}
