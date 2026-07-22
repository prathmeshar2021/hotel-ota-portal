import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { enforceRateLimit } from "@/lib/ratelimit";

/**
 * Public endpoint the guest hits from the secure link to record electronic
 * acceptance of the registration & consent form (paperless check-in). Keyed by
 * the per-consent token — no session required, since the guest is not a
 * portal-authenticated user at this point.
 */
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, { name: "consent-accept", limit: 10, windowSec: 60 });
  if (limited) return limited;

  let token: string | undefined;
  try {
    ({ token } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const consent = await prisma.consent.findFirst({
    where: { consentToken: token },
    select: { id: true, primaryAcceptedAt: true },
  });
  if (!consent) {
    return NextResponse.json({ error: "Consent form not found" }, { status: 404 });
  }

  // Idempotent — re-accepting keeps the original timestamp. mode WHATSAPP marks
  // this as a genuine electronic acceptance by the guest (vs a paper signature).
  if (!consent.primaryAcceptedAt) {
    await prisma.consent.update({
      where: { id: consent.id },
      data: { status: "ACCEPTED", mode: "WHATSAPP", primaryAcceptedAt: new Date() },
    });
  }

  return NextResponse.json({ success: true });
}
