import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const Schema = z.object({
  phone: z.string().regex(/^\d{10}$/),
  otp: z.string().length(6),
});

const MAX_ATTEMPTS = 5;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "CUSTOMER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const currentId = session.user.id;

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { phone, otp } = parsed.data;

  // --- Verify OTP ---
  const record = await prisma.passwordReset.findUnique({ where: { phone } });
  if (!record) {
    return NextResponse.json({ error: "No OTP was sent to this number. Please request again." }, { status: 400 });
  }
  if (record.expiresAt < new Date()) {
    return NextResponse.json({ error: "OTP has expired. Please request a new one." }, { status: 400 });
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: "Too many incorrect attempts. Please request a new OTP." }, { status: 429 });
  }

  const valid = await bcrypt.compare(otp, record.otpHash);
  if (!valid) {
    await prisma.passwordReset.update({ where: { phone }, data: { attempts: { increment: 1 } } });
    const remaining = MAX_ATTEMPTS - record.attempts - 1;
    return NextResponse.json(
      { error: `Incorrect OTP. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.` },
      { status: 400 }
    );
  }

  // OTP is correct — find the other account.
  const otherGuest = await prisma.guest.findUnique({
    where: { phone },
    select: { id: true },
  });
  if (!otherGuest || otherGuest.id === currentId) {
    // Phone was already moved (e.g. race condition) — clean up and succeed.
    await prisma.passwordReset.delete({ where: { phone } }).catch(() => {});
    return NextResponse.json({ success: true });
  }
  const otherId = otherGuest.id;

  // --- Merge in a transaction ---
  await prisma.$transaction(async (tx) => {
    // 1. SupportThread: unique([hotelId, guestId]) requires special handling.
    //    If both accounts have a thread at the same hotel, move the messages
    //    into the current account's thread and delete the duplicate.
    const otherThreads = await tx.supportThread.findMany({
      where: { guestId: otherId },
    });
    for (const ot of otherThreads) {
      const currentThread = await tx.supportThread.findUnique({
        where: { hotelId_guestId: { hotelId: ot.hotelId, guestId: currentId } },
      });
      if (currentThread) {
        await tx.supportMessage.updateMany({
          where: { threadId: ot.id },
          data: { threadId: currentThread.id },
        });
        await tx.supportThread.delete({ where: { id: ot.id } });
      } else {
        await tx.supportThread.update({
          where: { id: ot.id },
          data: { guestId: currentId },
        });
      }
    }

    // 2. Migrate all other relations.
    await tx.booking.updateMany({
      where: { primaryGuestId: otherId },
      data: { primaryGuestId: currentId },
    });
    await tx.bookingCompanion.updateMany({
      where: { guestId: otherId },
      data: { guestId: currentId },
    });
    await tx.onlineCheckin.updateMany({
      where: { guestId: otherId },
      data: { guestId: currentId },
    });
    await tx.consent.updateMany({
      where: { primaryGuestId: otherId },
      data: { primaryGuestId: currentId },
    });
    await tx.consent.updateMany({
      where: { secondaryGuestId: otherId },
      data: { secondaryGuestId: currentId },
    });
    await tx.review.updateMany({
      where: { guestId: otherId },
      data: { guestId: currentId },
    });

    // 3. Clear unique fields on the other account before deletion.
    await tx.guest.update({
      where: { id: otherId },
      data: { phone: null, email: null },
    });

    // 4. Claim the phone number on the current account.
    await tx.guest.update({
      where: { id: currentId },
      data: { phone },
    });

    // 5. Delete the now-empty other account.
    await tx.guest.delete({ where: { id: otherId } });

    // 6. Clean up the OTP record.
    await tx.passwordReset.delete({ where: { phone } });
  });

  return NextResponse.json({ success: true });
}
