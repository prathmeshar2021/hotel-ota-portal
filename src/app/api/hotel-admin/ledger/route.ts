import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { consumeOtp } from "@/lib/utils/otp";
import { z } from "zod";
import { startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, subMonths } from "date-fns";

export type LedgerEntry = {
  id: string;
  entryType: "DEBIT" | "CREDIT";
  category: string;
  description: string | null;
  amount: number;
  mode: "CASH" | "ONLINE" | "MIXED";
  expenseDate: string;
  addedBy: string | null;
  createdAt: string;
};

const CreateSchema = z.object({
  entryType: z.enum(["DEBIT", "CREDIT"]),
  category: z.string().min(1),
  description: z.string().optional(),
  amount: z.number().positive(),
  mode: z.enum(["CASH", "ONLINE"]),
  expenseDate: z.string().optional(), // ISO date string; defaults to now
  // Required only for DEBIT entries (owner-approved)
  otpId: z.string().optional(),
  otpCode: z.string().optional(),
});

// ── GET — list entries ────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.hotelId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "HOTEL_ADMIN" && session.user.role !== "HOTEL_STAFF" && session.user.role !== "SUPER_ADMIN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const hotelId = session.user.hotelId;
    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") ?? "month";
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    const now = new Date();
    let fromDate: Date;
    let toDate: Date = endOfDay(now);

    if (range === "today") {
      fromDate = startOfDay(now);
    } else if (range === "week") {
      fromDate = startOfDay(subDays(now, 6));
    } else if (range === "lastmonth") {
      fromDate = startOfMonth(subMonths(now, 1));
      toDate = endOfMonth(subMonths(now, 1));
    } else if (range === "custom" && fromParam && toParam) {
      fromDate = startOfDay(new Date(fromParam));
      toDate = endOfDay(new Date(toParam));
    } else {
      fromDate = startOfMonth(now);
    }

    const entries = await prisma.hotelExpense.findMany({
      where: {
        hotelId,
        expenseDate: { gte: fromDate, lte: toDate },
      },
      orderBy: { expenseDate: "desc" },
    });

    return NextResponse.json(
      entries.map(e => ({
        id: e.id,
        entryType: e.entryType as "DEBIT" | "CREDIT",
        category: e.category,
        description: e.description,
        amount: e.amount,
        mode: e.mode,
        expenseDate: e.expenseDate.toISOString(),
        addedBy: e.addedBy,
        createdAt: e.createdAt.toISOString(),
      }) satisfies LedgerEntry)
    );
  } catch (err) {
    console.error("[Ledger GET]", err);
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}

// ── POST — create entry ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.hotelId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "HOTEL_ADMIN" && session.user.role !== "HOTEL_STAFF" && session.user.role !== "SUPER_ADMIN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const hotelId = session.user.hotelId;
    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const { entryType, category, description, amount, mode, expenseDate, otpId, otpCode } = parsed.data;

    // Owner OTP approval required for any DEBIT (money going out)
    if (entryType === "DEBIT") {
      if (!otpId || !otpCode)
        return NextResponse.json({ error: "Owner OTP approval required for debits" }, { status: 403 });
      const otp = await consumeOtp({ hotelId, otpId, code: otpCode, purpose: "EXPENSE_DEBIT" });
      if (!otp.ok) return NextResponse.json({ error: otp.error }, { status: 403 });
    }

    const entry = await prisma.hotelExpense.create({
      data: {
        hotelId,
        entryType,
        category,
        description: description || undefined,
        amount,
        mode,
        expenseDate: expenseDate ? new Date(expenseDate) : new Date(),
        addedBy: session.user.name ?? "Staff",
      },
    });

    return NextResponse.json({
      success: true,
      id: entry.id,
      message: `${entryType === "DEBIT" ? "Expense" : "Credit"} of ₹${amount.toLocaleString("en-IN")} recorded`,
    }, { status: 201 });
  } catch (err) {
    console.error("[Ledger POST]", err);
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}

// ── DELETE — remove entry ─────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.hotelId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "HOTEL_ADMIN" && session.user.role !== "SUPER_ADMIN")
      return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    // Verify ownership
    const entry = await prisma.hotelExpense.findFirst({
      where: { id, hotelId: session.user.hotelId },
    });
    if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Owner OTP approval required to delete any ledger entry
    const otpId = searchParams.get("otpId");
    const otpCode = searchParams.get("otpCode");
    if (!otpId || !otpCode)
      return NextResponse.json({ error: "Owner OTP approval required to delete entries" }, { status: 403 });
    const otp = await consumeOtp({
      hotelId: session.user.hotelId,
      otpId,
      code: otpCode,
      purpose: "DELETE_TRANSACTION",
    });
    if (!otp.ok) return NextResponse.json({ error: otp.error }, { status: 403 });

    await prisma.hotelExpense.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Ledger DELETE]", err);
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
