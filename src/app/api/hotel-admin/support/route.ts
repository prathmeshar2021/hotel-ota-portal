import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

// GET — list all support threads for this hotel, newest first, with unread count.
export async function GET() {
  const session = await auth();
  if (!session?.user?.hotelId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (
    session.user.role !== "HOTEL_ADMIN" &&
    session.user.role !== "HOTEL_STAFF" &&
    session.user.role !== "SUPER_ADMIN"
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const threads = await prisma.supportThread.findMany({
    where: { hotelId: session.user.hotelId },
    include: {
      guest: { select: { name: true, phone: true, email: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1, // latest preview
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Count unread customer messages per thread.
  const unreadCounts = await prisma.supportMessage.groupBy({
    by: ["threadId"],
    where: {
      thread: { hotelId: session.user.hotelId },
      senderRole: "CUSTOMER",
      isRead: false,
    },
    _count: { id: true },
  });
  const unreadMap = Object.fromEntries(
    unreadCounts.map((r) => [r.threadId, r._count.id])
  );

  return NextResponse.json(
    threads.map((t) => ({
      id: t.id,
      status: t.status,
      guestName: t.guest.name,
      guestPhone: t.guest.phone,
      guestEmail: t.guest.email,
      latestMessage: t.messages[0] ?? null,
      unreadCount: unreadMap[t.id] ?? 0,
      updatedAt: t.updatedAt,
    }))
  );
}
