export const dynamic = "force-dynamic";

import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import Link from "next/link";
import { MessageCircle, ChevronRight, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default async function AdminSupportPage() {
  const session = await auth();
  if (
    !session?.user?.hotelId ||
    !["HOTEL_ADMIN", "HOTEL_STAFF", "SUPER_ADMIN"].includes(session.user.role)
  ) {
    redirect("/admin/login");
  }

  const threads = await prisma.supportThread.findMany({
    where: { hotelId: session.user.hotelId },
    include: {
      guest: { select: { name: true, phone: true, email: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
  });

  const unreadCounts = await prisma.supportMessage.groupBy({
    by: ["threadId"],
    where: {
      thread: { hotelId: session.user.hotelId },
      senderRole: "CUSTOMER",
      isRead: false,
    },
    _count: { id: true },
  });
  const unreadMap = Object.fromEntries(unreadCounts.map((r) => [r.threadId, r._count.id]));

  return (
    <div className="min-h-screen bg-[#0D1B0E] p-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Customer Support</h1>
          <p className="text-white/40 text-sm mt-1">
            {threads.length} conversation{threads.length !== 1 ? "s" : ""}
          </p>
        </div>

        {threads.length === 0 ? (
          <div className="text-center py-24">
            <MessageCircle className="w-12 h-12 text-white/10 mx-auto mb-4" />
            <p className="text-white/40">No support conversations yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {threads.map((t) => {
              const unread = unreadMap[t.id] ?? 0;
              const latest = t.messages[0];
              return (
                <Link
                  key={t.id}
                  href={`/admin/hotel-admin/support/${t.id}`}
                  className="flex items-center gap-4 glass-card glass-card-hover rounded-2xl px-5 py-4 transition-all"
                >
                  <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-semibold text-white text-sm truncate">{t.guest.name}</p>
                      {t.status === "CLOSED" && (
                        <span className="text-[10px] font-semibold bg-white/8 text-white/30 border border-white/10 px-2 py-0.5 rounded-full shrink-0">
                          Closed
                        </span>
                      )}
                      {unread > 0 && (
                        <span className="text-[10px] font-bold bg-amber-500 text-black px-2 py-0.5 rounded-full shrink-0">
                          {unread} new
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/35 truncate">
                      {latest
                        ? `${latest.senderRole === "CUSTOMER" ? t.guest.name.split(" ")[0] : "You"}: ${latest.body}`
                        : "No messages yet"}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {latest && (
                      <span className="text-[10px] text-white/25">
                        {formatDistanceToNow(new Date(latest.createdAt), { addSuffix: true })}
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-white/20" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
