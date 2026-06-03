import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { parseGommtEmail, type RawEmail } from "@/lib/ota/gommt-parser";

/**
 * Inbound OTA booking-email webhook.
 *
 * GoMMT (MakeMyTrip / Goibibo) has no open API for a single property, so we
 * forward their booking / cancellation emails to an inbound-email service
 * (CloudMailin / Mailgun / SendGrid / Postmark), which POSTs the email here.
 * We parse it and reflect the booking into our own DB so portal availability
 * stays in sync (a confirmed OTA booking reduces sellable capacity; a
 * cancellation releases it).
 *
 * Auth: ?secret=<OTA_EMAIL_WEBHOOK_SECRET> (or x-webhook-secret header).
 */

// Pull a value by any of several possible field names (services differ).
function pick(fields: Record<string, string>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = fields[k.toLowerCase()];
    if (v != null && v !== "") return v;
  }
  return undefined;
}

function flattenJson(obj: unknown, out: Record<string, string>, prefix = "") {
  if (obj == null || typeof obj !== "object") return;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = (prefix ? `${prefix}.${k}` : k).toLowerCase();
    if (v != null && typeof v === "object") {
      flattenJson(v, out, prefix ? `${prefix}.${k}` : k);
      // also index nested leaf by its own name (e.g. headers.subject -> subject)
    } else if (v != null) {
      out[key] = String(v);
      out[k.toLowerCase()] = String(v);
    }
  }
}

async function readEmail(req: NextRequest): Promise<RawEmail> {
  const ct = req.headers.get("content-type") ?? "";
  const fields: Record<string, string> = {};

  if (ct.includes("application/json")) {
    const json = await req.json().catch(() => ({}));
    flattenJson(json, fields);
  } else {
    const fd = await req.formData().catch(() => null);
    if (fd) {
      for (const [k, v] of fd.entries()) {
        if (typeof v === "string") fields[k.toLowerCase()] = v;
      }
    }
  }

  return {
    subject: pick(fields, ["subject", "headers.subject", "message.subject"]),
    from: pick(fields, ["from", "sender", "envelope.from", "fromfull.email", "headers.from"]),
    text: pick(fields, ["text", "plain", "body-plain", "textbody", "stripped-text", "message.text"]),
    html: pick(fields, ["html", "body-html", "htmlbody", "message.html"]),
  };
}

export async function POST(req: NextRequest) {
  // ── auth ──
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret") ?? req.headers.get("x-webhook-secret");
  if (!process.env.OTA_EMAIL_WEBHOOK_SECRET || secret !== process.env.OTA_EMAIL_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const email = await readEmail(req);
  const from = (email.from ?? "").toLowerCase();

  // Only handle GoMMT mail; ack everything else so the service doesn't retry.
  if (!/go-mmt\.com|makemytrip|goibibo/.test(`${from} ${email.subject ?? ""}`)) {
    return NextResponse.json({ ok: true, ignored: "not a GoMMT email" });
  }

  const parsed = parseGommtEmail(email);

  // Resolve hotel (single-property portal; override via env if needed).
  const slug = process.env.OTA_DEFAULT_HOTEL_SLUG ?? "the-urban-escape";
  const hotel =
    (await prisma.hotel.findUnique({ where: { slug } })) ??
    (await prisma.hotel.findFirst());
  if (!hotel) return NextResponse.json({ ok: true, warn: "no hotel" });

  // Helper to write an audit row (reuses AppsheetSyncLog).
  const log = (action: string, status: "SUCCESS" | "FAILED" | "PENDING", extra?: object, bookingId?: string) =>
    prisma.appsheetSyncLog.create({
      data: {
        hotelId: hotel.id,
        bookingId,
        action,
        status: status === "SUCCESS" ? "SUCCESS" : status === "FAILED" ? "FAILED" : "PENDING",
        payload: { subject: email.subject, from: email.from, parsed: parsed.ok ? parsed.data : parsed, ...extra } as object,
        error: parsed.ok ? undefined : parsed.error,
        syncedAt: new Date(),
      },
    }).catch(() => {});

  if (!parsed.ok) {
    await log("ota_email_parse_failed", "FAILED");
    // 200 so the email service doesn't retry-storm; the FAILED log surfaces it.
    return NextResponse.json({ ok: true, parsed: false, error: parsed.error });
  }

  const d = parsed.data;
  const bookingRef = `${d.source}-${d.otaBookingId}`;

  try {
    if (d.eventType === "CANCELLATION") {
      const res = await prisma.booking.updateMany({
        where: { bookingRef },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancellationCharge: d.cancellationCharge ?? 0,
        },
      });
      await log(
        res.count > 0 ? "ota_cancellation" : "ota_cancellation_unmatched",
        res.count > 0 ? "SUCCESS" : "FAILED",
      );
      return NextResponse.json({ ok: true, event: "cancellation", matched: res.count });
    }

    // NEW_BOOKING or MODIFICATION (treat unknown-but-parsed as a booking)
    if (!d.checkIn || !d.checkOut) {
      await log("ota_booking_missing_dates", "FAILED");
      return NextResponse.json({ ok: true, parsed: true, warn: "missing dates" });
    }

    const amount = d.propertyGrossCharges ?? 0;
    const booking = await prisma.booking.upsert({
      where: { bookingRef },
      update: {
        status: "CONFIRMED",
        checkInDate: d.checkIn,
        checkOutDate: d.checkOut,
        noOfNights: d.nights ?? 1,
        noOfPersons: d.guests ?? d.adults ?? 1,
        roomCategory: d.roomCategory ?? "LUXURY_COTTAGE",
        cancelledAt: null,
        cancellationCharge: null,
      },
      create: {
        bookingRef,
        hotel: { connect: { id: hotel.id } },
        source: d.source, // "MMT" | "GOIBIBO" — valid BookingSource values
        status: "CONFIRMED",
        roomCategory: d.roomCategory ?? "LUXURY_COTTAGE",
        checkInDate: d.checkIn,
        checkOutDate: d.checkOut,
        noOfNights: d.nights ?? 1,
        noOfPersons: d.guests ?? d.adults ?? 1,
        roomRent: amount,
        totalAmount: amount,
        specialRequests: `OTA ${d.source} · ${d.roomName ?? ""}${d.pnr ? ` · PNR ${d.pnr}` : ""}`.trim(),
        primaryGuest: { create: { name: d.guestName?.trim() || "OTA Guest" } },
      },
    });

    await log(d.eventType === "MODIFICATION" ? "ota_modification" : "ota_new_booking", "SUCCESS", undefined, booking.id);
    return NextResponse.json({ ok: true, event: d.eventType, bookingRef });
  } catch (err) {
    await log("ota_email_db_error", "FAILED", { message: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ ok: true, parsed: true, error: "db error" });
  }
}
