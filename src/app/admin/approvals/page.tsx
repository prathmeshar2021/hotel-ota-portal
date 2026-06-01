import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/superAdmin";
import { prisma } from "@/lib/db/prisma";
import ApprovalsClient, { type OtpItem } from "@/components/admin/ApprovalsClient";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const ctx = await requireSuperAdmin();
  if (!ctx) redirect("/auth/admin-login");

  const [pendingRaw, recentRaw] = await Promise.all([
    prisma.adminOtp.findMany({
      where: { hotelId: ctx.hotelId, status: { in: ["PENDING", "ISSUED"] } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.adminOtp.findMany({
      where: { hotelId: ctx.hotelId, status: { in: ["USED", "REJECTED", "EXPIRED"] } },
      orderBy: { updatedAt: "desc" },
      take: 25,
    }),
  ]);

  const map = (o: (typeof pendingRaw)[number]): OtpItem => ({
    id: o.id,
    purpose: o.purpose,
    description: o.description,
    amount: o.amount,
    refId: o.refId,
    actionPayload: (o.actionPayload as Prisma.JsonValue as Record<string, unknown>) ?? null,
    status: o.status,
    code: o.status === "ISSUED" ? o.code : null,
    requestedBy: o.requestedBy,
    issuedBy: o.issuedBy,
    createdAt: o.createdAt.toISOString(),
  });

  return (
    <ApprovalsClient
      initialPending={pendingRaw.map(map)}
      initialRecent={recentRaw.map(map)}
    />
  );
}
