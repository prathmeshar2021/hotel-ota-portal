import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { createOtpRequest } from "@/lib/utils/otp";
import type { OtpPurpose } from "@prisma/client";

const VALID_PURPOSES: OtpPurpose[] = [
  "CASH_COLLECTION",
  "EXPENSE_DEBIT",
  "DELETE_BOOKING",
  "DELETE_TRANSACTION",
  "DEPOSIT_DEDUCTION",
  "REFUND",
  "OTHER",
];

// POST /api/hotel-admin/otp/request
// body: { purpose, description, amount?, refId?, actionPayload? }
// Creates a PENDING approval request and returns immediately.
// Admin navigates away; completes the action later in Pending Approvals.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.hotelId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (
    session.user.role !== "HOTEL_ADMIN" &&
    session.user.role !== "HOTEL_STAFF" &&
    session.user.role !== "SUPER_ADMIN"
  )
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const purpose = body?.purpose as OtpPurpose;
  if (!VALID_PURPOSES.includes(purpose))
    return NextResponse.json({ error: "Invalid purpose" }, { status: 400 });
  if (!body?.description?.trim())
    return NextResponse.json({ error: "Description required" }, { status: 400 });

  const otp = await createOtpRequest({
    hotelId: session.user.hotelId,
    purpose,
    description: body.description.trim(),
    amount: body.amount != null ? Number(body.amount) : null,
    refId: body.refId || null,
    requestedBy: session.user.name ?? "Staff",
    actionPayload: body.actionPayload ?? null,
  });

  return NextResponse.json({ otpId: otp.id, status: otp.status }, { status: 201 });
}
