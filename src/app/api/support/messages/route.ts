import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";

const SendSchema = z.object({
  threadId: z.string(),
  body: z.string().min(1).max(2000),
});

// POST — customer sends a message.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "CUSTOMER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = SendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // Verify the thread belongs to this guest.
  const thread = await prisma.supportThread.findFirst({
    where: { id: parsed.data.threadId, guestId: session.user.id },
    select: { id: true, status: true },
  });
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }
  if (thread.status === "CLOSED") {
    return NextResponse.json({ error: "This conversation is closed" }, { status: 400 });
  }

  const guest = await prisma.guest.findUnique({
    where: { id: session.user.id },
    select: { name: true },
  });

  const message = await prisma.supportMessage.create({
    data: {
      threadId: parsed.data.threadId,
      senderRole: "CUSTOMER",
      senderName: guest?.name ?? "Guest",
      body: parsed.data.body,
    },
  });

  // Bump thread updatedAt so the admin list sorts correctly.
  await prisma.supportThread.update({
    where: { id: parsed.data.threadId },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json(message, { status: 201 });
}

// GET — poll for new messages after a given timestamp.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "CUSTOMER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const threadId = searchParams.get("threadId");
  const after = searchParams.get("after"); // ISO timestamp

  if (!threadId) {
    return NextResponse.json({ error: "threadId required" }, { status: 400 });
  }

  // Verify ownership.
  const thread = await prisma.supportThread.findFirst({
    where: { id: threadId, guestId: session.user.id },
    select: { id: true },
  });
  if (!thread) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const messages = await prisma.supportMessage.findMany({
    where: {
      threadId,
      ...(after ? { createdAt: { gt: new Date(after) } } : {}),
    },
    orderBy: { createdAt: "asc" },
  });

  // Mark newly polled staff messages as read.
  const unreadIds = messages
    .filter((m) => m.senderRole === "STAFF" && !m.isRead)
    .map((m) => m.id);
  if (unreadIds.length > 0) {
    await prisma.supportMessage.updateMany({
      where: { id: { in: unreadIds } },
      data: { isRead: true },
    });
  }

  return NextResponse.json(messages);
}
