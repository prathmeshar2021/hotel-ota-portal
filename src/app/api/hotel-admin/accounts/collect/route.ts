import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { recordStaffAction } from "@/lib/services/staff-action";
import { z } from "zod";

const Schema = z.object({
  amount: z.number().positive("Amount must be positive"),
  note: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.hotelId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "HOTEL_ADMIN" && session.user.role !== "HOTEL_STAFF" && session.user.role !== "SUPER_ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const hotelId = session.user.hotelId;
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    const msgs = [...parsed.error.flatten().formErrors, ...Object.values(parsed.error.flatten().fieldErrors).flat()];
    return NextResponse.json({ error: msgs[0] ?? "Invalid request" }, { status: 400 });
  }

  const { amount, note } = parsed.data;

  const collection = await prisma.cashCollection.create({
    data: {
      hotelId,
      amount,
      note: note || undefined,
      collectedBy: session.user.name ?? "Staff",
    },
  });

  // No approval code to wait for — the owner is told instead, and it is kept in
  // the activity log for them to review whenever they like.
  await recordStaffAction({
    hotelId,
    kind: "CASH_COLLECTION",
    summary: `₹${amount.toLocaleString("en-IN")} in cash was taken out of the till.`,
    amount,
    refType: "collection",
    refId: collection.id,
    reason: note || undefined,
    actorId: session.user.id,
    actorName: session.user.name ?? session.user.email ?? "Staff",
    actorRole: session.user.role ?? "HOTEL_STAFF",
  });

  return NextResponse.json({
    success: true,
    id: collection.id,
    amount: collection.amount,
    message: `₹${amount.toLocaleString("en-IN")} cash recorded as collected`,
  });
}
