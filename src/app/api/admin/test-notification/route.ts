import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/superAdmin";

const GUPSHUP_API_URL = "https://api.gupshup.io/wa/api/v1/msg";

/**
 * POST /api/admin/test-notification
 * Body: { phone?: "10-digit", email?: "address" }
 *
 * Sends a test booking confirmation to the given phone/email.
 * Returns the raw response from each channel so failures are visible.
 * Super-admin only.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireSuperAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { phone, email: emailAddr } = body as { phone?: string; email?: string };

  if (!phone && !emailAddr) {
    return NextResponse.json(
      { error: "Provide at least one of: phone, email" },
      { status: 400 }
    );
  }

  const results: Record<string, unknown> = {};

  // ── WhatsApp via Gupshup ──────────────────────────────────────────────────
  if (phone) {
    try {
      const destination = phone.startsWith("91") ? phone : `91${phone}`;
      const message = JSON.stringify({
        type: "text",
        text:
          `✅ *Test Notification*\n\n` +
          `This is a test message from *The Urban Escape* booking system.\n\n` +
          `If you can read this, WhatsApp notifications are working correctly! 🎉`,
      });
      const formBody = new URLSearchParams({
        channel: "whatsapp",
        source: process.env.GUPSHUP_SOURCE_NUMBER!,
        destination,
        message,
        "src.name": process.env.GUPSHUP_APP_NAME!,
      });
      const res = await fetch(GUPSHUP_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          apikey: process.env.GUPSHUP_API_KEY!,
        },
        body: formBody.toString(),
      });
      const data = await res.json().catch(() => null) ?? await res.text();
      results.whatsapp = { httpStatus: res.status, body: data };
    } catch (e) {
      results.whatsapp = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  // ── Email via Resend ──────────────────────────────────────────────────────
  if (emailAddr) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY!);
      const FROM = process.env.EMAIL_FROM ?? "The Urban Escape <onboarding@resend.dev>";
      const result = await resend.emails.send({
        from: FROM,
        to: emailAddr,
        subject: "Test Notification — The Urban Escape",
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px;background:#fff;">
            <div style="background:#1a3a2a;padding:20px 24px;border-radius:8px 8px 0 0;">
              <h1 style="margin:0;color:#fff;font-size:20px;">The Urban Escape</h1>
            </div>
            <div style="background:#f9f9f9;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e5e5e5;border-top:none;">
              <p style="color:#333;font-size:16px;font-weight:700;margin:0 0 8px;">✅ Test Email Working!</p>
              <p style="color:#555;font-size:14px;margin:0;">
                This is a test email from the hotel booking system. If you received this, email notifications are configured correctly.
              </p>
            </div>
          </div>
        `,
      });
      results.email = result;
    } catch (e) {
      results.email = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  return NextResponse.json(results);
}
