import { NextResponse } from "next/server";
import crypto from "crypto";

/**
 * Server-to-server auth for the `/api/assistant/*` endpoints.
 *
 * These endpoints are called ONLY by the AI voice orchestrator (a trusted backend
 * service), never by a browser. The orchestrator presents a shared secret as
 * `Authorization: Bearer <ASSISTANT_API_KEY>`.
 *
 * `requireAssistantAuth` returns:
 *   • `null`            → authorized, proceed
 *   • a `NextResponse`  → short-circuit the handler (401 / 503)
 *
 * Usage at the top of a handler:
 *   const denied = requireAssistantAuth(req);
 *   if (denied) return denied;
 */
export function requireAssistantAuth(req: Request): NextResponse | null {
  const configured = process.env.ASSISTANT_API_KEY;
  // Fail closed: if no key is configured, refuse every request rather than
  // accidentally exposing an open endpoint.
  if (!configured) {
    console.error(
      "[assistant] ASSISTANT_API_KEY is not set — refusing all assistant requests"
    );
    return NextResponse.json(
      { error: "Assistant API not configured" },
      { status: 503 }
    );
  }

  const header = req.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  const provided = header.startsWith(prefix)
    ? header.slice(prefix.length).trim()
    : "";

  if (!provided || !safeEqual(provided, configured)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/**
 * The single hotel this assistant serves. Locking the assistant to one property
 * via env (rather than trusting a client-supplied hotelId) means a compromised or
 * buggy orchestrator can never read or book against another hotel.
 *
 * Returns the id, or a `NextResponse` (503) when unconfigured.
 */
export function assistantHotelId(): string | NextResponse {
  const id = process.env.ASSISTANT_HOTEL_ID;
  if (!id) {
    console.error("[assistant] ASSISTANT_HOTEL_ID is not set");
    return NextResponse.json(
      { error: "Assistant API not configured" },
      { status: 503 }
    );
  }
  return id;
}

/** Constant-time string compare that tolerates length differences. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  try {
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}
