"use client";

/**
 * Client-side kiosk token storage + authenticated fetch. The device token
 * lives in localStorage on the paired tablet and is sent as the
 * `x-kiosk-token` header on every /api/kiosk/* call.
 */

const TOKEN_KEY = "kiosk_device_token";

export function getKioskToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setKioskToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearKioskToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

export function isPaired(): boolean {
  return !!getKioskToken();
}

/** fetch() wrapper that attaches the kiosk token header. */
export async function kioskFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = getKioskToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("x-kiosk-token", token);
  headers.set("Content-Type", "application/json");
  return fetch(input, { ...init, headers });
}
