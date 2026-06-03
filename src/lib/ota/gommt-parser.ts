/**
 * GoMMT (MakeMyTrip / Goibibo) "Host Voucher" email parser.
 *
 * GoMMT has no open booking API for a single property, so as a stop-gap we
 * parse the booking / cancellation notification emails they send to the
 * property's registered inbox (no-reply@go-mmt.com) and turn them into
 * structured data the portal can act on.
 *
 * This module is intentionally PURE (no DB, no I/O) so it can be unit-tested
 * against saved sample emails. The webhook route does the DB work.
 */

import type { RoomCategoryType } from "@/lib/utils/room-categories";

export type OtaSource = "MMT" | "GOIBIBO";
export type OtaEventType = "NEW_BOOKING" | "CANCELLATION" | "MODIFICATION" | "UNKNOWN";

export interface ParsedGommtEmail {
  source: OtaSource;
  eventType: OtaEventType;
  otaBookingId: string;
  pnr?: string;
  guestName?: string;
  checkIn?: Date;
  checkOut?: Date;
  nights?: number;
  adults?: number;
  children?: number;
  guests?: number;
  roomName?: string;
  roomQty: number;
  roomCategory?: RoomCategoryType;
  propertyGrossCharges?: number;
  payableToProperty?: number;
  cancellationCharge?: number;
  bookingStatus?: string;
  bookedVia?: string;
  propertyName?: string;
}

export interface RawEmail {
  subject?: string | null;
  from?: string | null;
  text?: string | null;
  html?: string | null;
}

export type ParseResult =
  | { ok: true; data: ParsedGommtEmail }
  | { ok: false; error: string; partial?: Partial<ParsedGommtEmail> };

// ── helpers ────────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&rsquo;|&apos;/gi, "'")
    .replace(/&#8377;|&#x20b9;/gi, "₹") // ₹
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

/** Very small HTML→text: keep structure as newlines, drop tags, decode entities. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\/\s*(p|div|tr|td|th|li|h[1-6]|table)\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  );
}

/** Normalise to lines with collapsed intra-line whitespace. */
function normalize(text: string): string {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

function money(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Map an OTA room/rate name to our internal category.
 *
 * GoMMT cottage names (full, as they appear in the booking mail — the shortened
 * forms without the "King Bed … Forest View" bed description map the same way):
 *   • "Deluxe Cottage King Bed with Bunk Bed Forest View"               → LUXURY_COTTAGE   (cottages 1, 5, 6)
 *   • "Deluxe Cottage King Bed with Home Theater and Bunk Bed Forest View" → THEATRE_COTTAGE (cottage 2)
 *   • "Deluxe Pinewood Cottage King Bed with Bunk Bed Forest View"      → PINEWOOD_COTTAGE (cottages 3, 4)
 *
 * Order matters: the two distinguishing keywords ("pinewood", "home theater")
 * are checked before the plain-"cottage" fallback so a "Deluxe Cottage" with
 * neither keyword lands on LUXURY_COTTAGE.
 *
 * AC rooms: GoMMT lists every AC room under a single name "Deluxe AC Rooms"
 * (no separate Cave listing), so any "… AC Room …" maps to PREMIUM_AC_ROOM.
 * Non-AC rooms are NOT listed on GoMMT, so they never arrive via this channel.
 */
export function mapOtaRoomName(name: string | undefined): RoomCategoryType | undefined {
  if (!name) return undefined;
  const n = name.toLowerCase();
  // Cottages — most specific keyword first.
  if (n.includes("pinewood")) return "PINEWOOD_COTTAGE";
  if (n.includes("home theater") || n.includes("home theatre") || n.includes("theatre") || n.includes("theater"))
    return "THEATRE_COTTAGE";
  if (n.includes("luxury")) return "LUXURY_COTTAGE";
  if (n.includes("cottage")) return "LUXURY_COTTAGE"; // plain "Deluxe Cottage …"
  // AC rooms — all GoMMT AC rooms share the name "Deluxe AC Rooms".
  if (n.includes("ac room") || n.includes("deluxe ac")) return "PREMIUM_AC_ROOM";
  return undefined;
}

function parseDate(day: string, mon: string, yr: string): Date | undefined {
  const m = MONTHS[mon.slice(0, 3).toLowerCase()];
  if (m === undefined) return undefined;
  const year = yr.length === 2 ? 2000 + Number(yr) : Number(yr);
  const d = Number(day);
  if (!Number.isFinite(year) || !Number.isFinite(d)) return undefined;
  // UTC midnight — consistent with how portal bookings store check-in/out
  return new Date(Date.UTC(year, m, d));
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

// ── main ─────────────────────────────────────────────────────────────────────

export function parseGommtEmail(email: RawEmail): ParseResult {
  const subject = (email.subject ?? "").trim();
  const from = (email.from ?? "").toLowerCase();

  // Body: prefer plain text; fall back to stripped HTML.
  const rawBody =
    email.text && email.text.trim().length > 40
      ? email.text
      : email.html
        ? htmlToText(email.html)
        : (email.text ?? "");
  const body = normalize(rawBody);
  const hay = `${subject}\n${body}`;

  // Source
  const source: OtaSource = /goibibo/i.test(hay) && !/makemytrip|make my trip/i.test(hay)
    ? "GOIBIBO"
    : "MMT";

  // Event type — subject is the most reliable signal
  let eventType: OtaEventType = "UNKNOWN";
  if (/cancellation received|booking cancelled|cancelled/i.test(subject)) eventType = "CANCELLATION";
  else if (/new booking received|new booking|booking received|booking confirmation/i.test(subject)) eventType = "NEW_BOOKING";
  else if (/modif|amend|date change|reschedul/i.test(subject)) eventType = "MODIFICATION";
  // body fallbacks
  if (eventType === "UNKNOWN") {
    if (/booking status\s*\n?\s*cancelled/i.test(body)) eventType = "CANCELLATION";
    else if (/booking status\s*\n?\s*confirmed/i.test(body)) eventType = "NEW_BOOKING";
  }

  // Booking ID — subject usually ends with it; body has a labelled field too.
  const otaBookingId =
    (subject.match(/\b([A-Z]{2}\d{8,})\b/) ?? [])[1] ??
    (body.match(/booking id\s*[:\-]?\s*\n?\s*([A-Z0-9]{8,})/i) ?? [])[1] ??
    (body.match(/\b([A-Z]{2}\d{8,})\b/) ?? [])[1];

  if (!otaBookingId) {
    return { ok: false, error: "Could not find OTA booking id", partial: { source, eventType, roomQty: 1 } };
  }

  // PNR
  const pnr = (body.match(/\bpnr\b\s*[:\-]?\s*\n?\s*([0-9]{5,})/i) ?? [])[1];

  // Guest name — first non-empty line after the label
  const guestName = (body.match(/primary guest details\s*\n+\s*([^\n]+)/i) ?? [])[1]?.trim();

  // Dates — scan from CHECK-IN section; first two date tokens = in / out
  const dateRe = /(\d{1,2})\s+([A-Za-z]{3,})\s+'?(\d{2,4})/g;
  const ckIdx = body.search(/check-?in/i);
  const dateScope = ckIdx >= 0 ? body.slice(ckIdx) : body;
  const dates: Date[] = [];
  for (const m of dateScope.matchAll(dateRe)) {
    const d = parseDate(m[1], m[2], m[3]);
    if (d) dates.push(d);
    if (dates.length >= 2) break;
  }
  const checkIn = dates[0];
  const checkOut = dates[1];

  // Nights — explicit "(N Night)" wins, else computed
  const nightsExplicit = (body.match(/\((\d+)\s*nights?\)/i) ?? [])[1];
  const nights = nightsExplicit
    ? Number(nightsExplicit)
    : checkIn && checkOut
      ? daysBetween(checkIn, checkOut)
      : undefined;

  // Guests
  const adults = Number((body.match(/(\d+)\s*adult/i) ?? [])[1] ?? 0) || undefined;
  const children = Number((body.match(/(\d+)\s*child/i) ?? [])[1] ?? 0) || undefined;
  const guests = (adults ?? 0) + (children ?? 0) || undefined;

  // Room — "1 x <name>"
  const roomMatch = body.match(/(\d+)\s*x\s*([^\n]+)/i);
  const roomQty = roomMatch ? Number(roomMatch[1]) || 1 : 1;
  const roomName = roomMatch?.[2]?.trim();
  const roomCategory = mapOtaRoomName(roomName);

  // Money
  const propertyGrossCharges = money(
    (body.match(/property gross charges[^\d]{0,24}([\d,]+(?:\.\d+)?)/i) ?? [])[1]
  );
  const payableToProperty = money(
    (body.match(/payable to property[^\d]{0,24}([\d,]+(?:\.\d+)?)/i) ?? [])[1]
  );
  const cancellationCharge = money(
    (body.match(/cancellation charges?[^\d]{0,40}([\d,]+(?:\.\d+)?)/i) ?? [])[1]
  );

  const bookingStatus = (body.match(/booking status\s*\n?\s*([A-Za-z ]+)/i) ?? [])[1]?.trim();
  const bookedVia = (body.match(/booked via\s*\n?\s*([A-Za-z ]+)/i) ?? [])[1]?.trim();
  const propertyName = (body.match(/^(the urban escape[^\n,]*)/im) ?? [])[1]?.trim();

  return {
    ok: true,
    data: {
      source,
      eventType,
      otaBookingId,
      pnr,
      guestName,
      checkIn,
      checkOut,
      nights,
      adults,
      children,
      guests,
      roomName,
      roomQty,
      roomCategory,
      propertyGrossCharges,
      payableToProperty,
      cancellationCharge,
      bookingStatus,
      bookedVia,
      propertyName,
    },
  };
}
