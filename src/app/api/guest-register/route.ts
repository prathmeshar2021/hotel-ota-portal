import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";

/**
 * POST /api/guest-register  —  PUBLIC (no auth)
 *
 * Backs the reception self-registration form (a QR at the desk opens /register).
 * Accepts one or more guests registering together (e.g. a couple/family), and
 * saves EACH as its own independent Guest record — never linked as companions —
 * so every person is searchable on their own later. Staff can then find and add
 * any of them to a booking without re-typing, clearing the reception queue.
 *
 * Keyed by phone (unique): a returning guest who re-submits updates their own
 * record rather than erroring. Email is only written when it's free (unique).
 * Phone + ID are required for every guest; all phones in one batch must differ.
 */
const GuestSchema = z.object({
  name:       z.string().trim().min(2, "a full name is required"),
  phone:      z.string().regex(/^\d{10}$/, "a valid 10-digit phone number is required"),
  email:      z.string().trim().email("a valid email is required").optional().or(z.literal("")),
  gender:     z.enum(["MALE", "FEMALE", "OTHER"]),
  idType:     z.enum(["AADHAR", "DRIVING_LICENSE", "PASSPORT", "VOTER_ID", "OTHER"]),
  idNumber:   z.string().trim().min(3, "an ID number is required"),
  idFrontUrl: z.string().url("an ID front upload is required"),
  idBackUrl:  z.string().url("an ID back upload is required"),
});

const RegisterSchema = z.object({
  guests: z.array(GuestSchema).min(1, "Add at least one guest").max(10, "Too many guests in one batch"),
}).superRefine((val, ctx) => {
  // Every guest in a batch must use a distinct phone number.
  const seen = new Set<string>();
  val.guests.forEach((g, i) => {
    if (seen.has(g.phone)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["guests", i, "phone"], message: "each guest needs a different phone number" });
    }
    seen.add(g.phone);
  });
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const gi = typeof issue?.path?.[1] === "number" ? (issue.path[1] as number) : null;
    const msg = gi !== null ? `Guest ${gi + 1}: ${issue?.message}` : (issue?.message ?? "Please check the form");
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const names: string[] = [];
  for (const d of parsed.data.guests) {
    // Find any existing guest with this phone so a re-submit updates, not duplicates.
    const existing = await prisma.guest.findUnique({
      where: { phone: d.phone },
      select: { id: true },
    });

    // email is @unique — only write it when no *other* guest already owns it.
    const email = d.email ? d.email.toLowerCase() : "";
    let safeEmail: string | undefined;
    if (email) {
      const clash = await prisma.guest.findFirst({
        where: { email, ...(existing ? { NOT: { id: existing.id } } : {}) },
        select: { id: true },
      });
      if (!clash) safeEmail = email;
    }

    const data = {
      name:       d.name,
      gender:     d.gender,
      idType:     d.idType,
      idNumber:   d.idNumber,
      idFrontUrl: d.idFrontUrl,
      idBackUrl:  d.idBackUrl,
      ...(safeEmail ? { email: safeEmail } : {}),
    };

    if (existing) {
      await prisma.guest.update({ where: { id: existing.id }, data });
    } else {
      await prisma.guest.create({ data: { phone: d.phone, ...data } });
    }
    names.push(d.name);
  }

  return NextResponse.json({ ok: true, count: names.length, names });
}
