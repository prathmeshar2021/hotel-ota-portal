import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { consumeOtp } from "@/lib/utils/otp";
import { z } from "zod";

const Schema = z.object({
  amount: z.number().positive("Amount must be positive"),
  note: z.string().optional(),
  otpId: z.string(),
  otpCode: z.string(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.hotelId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "HOTEL_ADMIN" && session.user.role !== "HOTEL_STAFF" && session.user.role !== "SUPER_ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const hotelId = session.user.hotelId;
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { amount, note, otpId, otpCode } = parsed.data;

  // Owner OTP approval required for any cash collection (debit of cash)
  const otp = await consumeOtp({
    hotelId,
    otpId,
    code: otpCode,
    purpose: "CASH_COLLECTION",
  });
  if (!otp.ok) return NextResponse.json({ error: otp.error }, { status: 403 });

  const collection = await prisma.cashCollection.create({
    data: {
      hotelId,
      amount,
      note: note || undefined,
      collectedBy: session.user.name ?? "Staff",
    },
  });

  return NextResponse.json({
    success: true,
    id: collection.id,
    amount: collection.amount,
    message: `₹${amount.toLocaleString("en-IN")} cash recorded as collected`,
  });
}
