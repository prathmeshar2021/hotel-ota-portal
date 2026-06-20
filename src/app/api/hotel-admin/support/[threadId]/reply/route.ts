import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { email } from "@/lib/services/email";
import { z } from "zod";

const Schema = z.object({ body: z.string().min(1).max(2000) });

// POST — staff sends a reply in a support thread.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const session = await auth();
  if (
    !session?.user?.hotelId ||
    !["HOTEL_ADMIN", "HOTEL_STAFF", "SUPER_ADMIN"].includes(session.user.role)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { threadId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const thread = await prisma.supportThread.findFirst({
    where: { id: threadId, hotelId: session.user.hotelId },
    include: { guest: { select: { name: true, email: true } } },
  });
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }
  if (thread.status === "CLOSED") {
    return NextResponse.json({ error: "Thread is closed" }, { status: 400 });
  }

  const staffName = session.user.name ?? "Hotel Team";

  const message = await prisma.supportMessage.create({
    data: {
      threadId,
      senderRole: "STAFF",
      senderName: staffName,
      body: parsed.data.body,
    },
  });

  await prisma.supportThread.update({
    where: { id: threadId },
    data: { updatedAt: new Date() },
  });

  // Email the guest if they have an email address.
  if (thread.guest.email) {
    email.sendSupportReply(thread.guest.email, {
      guestName: thread.guest.name,
      staffName,
      message: parsed.data.body,
    }).catch((e) => console.error("[Email] Support reply notification failed:", e));
  }

  return NextResponse.json(message, { status: 201 });
}
