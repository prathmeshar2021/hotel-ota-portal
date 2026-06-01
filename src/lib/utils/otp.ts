import { prisma } from "@/lib/db/prisma";
import type { OtpPurpose } from "@prisma/client";

export const OTP_TTL_MINUTES = 10;

export const OTP_PURPOSE_LABEL: Record<OtpPurpose, string> = {
  CASH_COLLECTION: "Cash collection",
  EXPENSE_DEBIT: "Expense / debit entry",
  DELETE_BOOKING: "Delete booking",
  DELETE_TRANSACTION: "Delete transaction",
  DEPOSIT_DEDUCTION: "Deposit deduction",
  REFUND: "Refund",
  OTHER: "Other",
};

/** 6-digit numeric OTP. */
export function generateOtpCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Create a pending OTP request (admin side). The super admin later issues a code.
 */
export async function createOtpRequest(params: {
  hotelId: string;
  purpose: OtpPurpose;
  description: string;
  amount?: number | null;
  refId?: string | null;
  requestedBy?: string | null;
}) {
  return prisma.adminOtp.create({
    data: {
      hotelId: params.hotelId,
      purpose: params.purpose,
      description: params.description,
      amount: params.amount ?? null,
      refId: params.refId ?? null,
      requestedBy: params.requestedBy ?? null,
      status: "PENDING",
    },
  });
}

/**
 * Atomically validate and consume an issued OTP, then it can never be reused.
 *
 * Checks: belongs to hotel, status ISSUED, code matches, not expired, and
 * (when supplied) purpose + refId match the action being performed.
 *
 * @returns `{ ok: true }` on success, else `{ ok: false, error }`.
 */
export async function consumeOtp(params: {
  hotelId: string;
  otpId: string;
  code: string;
  purpose?: OtpPurpose;
  refId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const otp = await prisma.adminOtp.findFirst({
    where: { id: params.otpId, hotelId: params.hotelId },
  });

  if (!otp) return { ok: false, error: "Approval request not found" };
  if (otp.status === "USED") return { ok: false, error: "This OTP has already been used" };
  if (otp.status === "REJECTED") return { ok: false, error: "This request was rejected by the owner" };
  if (otp.status === "PENDING")
    return { ok: false, error: "Awaiting owner approval — no OTP issued yet" };
  if (otp.status === "EXPIRED" || (otp.expiresAt && otp.expiresAt < new Date()))
    return { ok: false, error: "OTP has expired. Please request a new one." };
  if (otp.status !== "ISSUED") return { ok: false, error: "OTP is not valid" };
  if (params.purpose && otp.purpose !== params.purpose)
    return { ok: false, error: "OTP does not match this action" };
  if (params.refId && otp.refId && otp.refId !== params.refId)
    return { ok: false, error: "OTP does not match this transaction" };
  if (!otp.code || otp.code !== params.code.trim())
    return { ok: false, error: "Incorrect OTP" };

  // Atomic consume: only succeeds if still ISSUED
  const updated = await prisma.adminOtp.updateMany({
    where: { id: otp.id, status: "ISSUED" },
    data: { status: "USED", usedAt: new Date() },
  });
  if (updated.count === 0)
    return { ok: false, error: "OTP could not be consumed (already used)" };

  return { ok: true };
}
