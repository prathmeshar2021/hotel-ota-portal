export const dynamic = "force-dynamic";

import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import PendingApprovalsClient from "@/components/hotel-admin/PendingApprovalsClient";
import { Prisma } from "@prisma/client";

export default async function PendingApprovalsPage() {
  const session = await auth();
  if (!session?.user?.hotelId) redirect("/auth/staff-login");

  const items = await prisma.adminOtp.findMany({
    where: {
      hotelId: session.user.hotelId,
      status: { in: ["PENDING", "ISSUED"] },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      purpose: true,
      description: true,
      amount: true,
      refId: true,
      actionPayload: true,
      status: true,
      requestedBy: true,
      issuedAt: true,
      createdAt: true,
    },
  });

  const serialized = items.map((o) => ({
    id: o.id,
    purpose: o.purpose as string,
    description: o.description,
    amount: o.amount,
    refId: o.refId,
    actionPayload: o.actionPayload as Prisma.JsonValue,
    status: o.status as string,
    requestedBy: o.requestedBy,
    issuedAt: o.issuedAt?.toISOString() ?? null,
    createdAt: o.createdAt.toISOString(),
  }));

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-8 max-w-3xl mx-auto">
      <PendingApprovalsClient initialItems={serialized} />
    </div>
  );
}
