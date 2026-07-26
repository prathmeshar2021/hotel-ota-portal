"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck, Download, Loader2, Send, Printer, CheckCircle2, PenLine } from "lucide-react";

interface Props {
  bookingId: string;
  guestPhone?: string | null;
  /** Pre-existing token (if a consent record already exists) and accepted state. */
  consentToken?: string | null;
  acceptedAt?: string | null;
  /** Staff member who verified a signed copy (null for electronic acceptance). */
  verifiedByName?: string | null;
}

export default function ConsentFormButton({ bookingId, guestPhone, consentToken, acceptedAt, verifiedByName }: Props) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(consentToken ?? null);
  const [accepted, setAccepted] = useState<boolean>(!!acceptedAt);
  const [verifier, setVerifier] = useState<string | null>(verifiedByName ?? null);
  const [preparing, setPreparing] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const pdfHref = (t: string) => `/api/consent/${bookingId}/pdf?t=${encodeURIComponent(t)}&download=1`;

  async function ensureToken(): Promise<string | null> {
    if (token) return token;
    const res = await fetch(`/api/hotel-admin/bookings/${bookingId}/consent`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to prepare consent form");
    setToken(data.token);
    return data.token as string;
  }

  async function prepareAndOpen() {
    setPreparing(true);
    try {
      const t = await ensureToken();
      if (t) window.open(pdfHref(t), "_blank", "noopener");
      toast.success("Consent form ready to print");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to prepare consent form");
    } finally {
      setPreparing(false);
    }
  }

  async function sendWhatsApp() {
    setSending(true);
    try {
      const res = await fetch(`/api/hotel-admin/bookings/${bookingId}/consent/send`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");
      // ensure token is set so the Download button appears too
      if (!token) await ensureToken().catch(() => {});
      toast.success(data.message ?? "Consent form sent on WhatsApp");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send consent form");
    } finally {
      setSending(false);
    }
  }

  async function confirmSigned() {
    setConfirming(true);
    try {
      const res = await fetch(`/api/hotel-admin/bookings/${bookingId}/consent/confirm`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to confirm");
      setAccepted(true);
      if (data.verifiedByName) setVerifier(data.verifiedByName);
      // The server finishes the check-in in the same call when nothing else is
      // outstanding, so say what actually happened rather than assuming.
      toast.success(data.message ?? "Consent confirmed");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to confirm consent");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/3 p-3">
      <div className="flex items-center gap-2 text-xs text-white/55 mb-2.5">
        <ShieldCheck className="w-3.5 h-3.5 text-green-400 shrink-0" />
        <span>Guest registration & consent form</span>
        {accepted && (
          <span className="ml-auto flex items-center gap-1 text-green-400">
            <CheckCircle2 className="w-3.5 h-3.5" /> Confirmed
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={prepareAndOpen}
          disabled={preparing}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-white/5 border border-white/12 text-white/70 hover:bg-white/10 hover:text-white transition-all disabled:opacity-50"
        >
          {preparing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : token ? (
            <Download className="w-3.5 h-3.5" />
          ) : (
            <Printer className="w-3.5 h-3.5" />
          )}
          {token ? "Download PDF" : "Print for signature"}
        </button>
        <button
          onClick={sendWhatsApp}
          disabled={sending || !guestPhone}
          title={!guestPhone ? "Guest has no phone number" : "Send consent form on WhatsApp"}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white transition-all disabled:opacity-50"
        >
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Send on WhatsApp
        </button>
      </div>

      {/* Staff attestation for the printed-signature path. Hidden once confirmed
          (electronically by the guest, or here). */}
      {!accepted && (
        <button
          onClick={confirmSigned}
          disabled={confirming}
          className="w-full mt-2 flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-white/5 border border-dashed border-white/20 text-white/70 hover:bg-white/10 hover:text-white transition-all disabled:opacity-50"
        >
          {confirming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PenLine className="w-3.5 h-3.5" />}
          Mark signed copy received
        </button>
      )}

      <p className="text-[10px] text-white/30 mt-2 leading-relaxed">
        {accepted
          ? `Consent confirmed${verifier ? ` by ${verifier}` : ""}.`
          : "Print & take the guest's signature (then mark it received), or send on WhatsApp for the guest to accept. Marking the signed copy received completes the check-in."}
      </p>
    </div>
  );
}
