"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Loader2, X, Clock } from "lucide-react";

export type OtpPurpose =
  | "CASH_COLLECTION"
  | "EXPENSE_DEBIT"
  | "DELETE_BOOKING"
  | "DELETE_TRANSACTION"
  | "DEPOSIT_DEDUCTION"
  | "REFUND"
  | "OTHER";

interface OtpGateProps {
  open: boolean;
  onClose: () => void;
  purpose: OtpPurpose;
  description: string;
  amount?: number;
  refId?: string;
  /** Runs the actual privileged action with the verified OTP. Throw to keep open. */
  onConfirm: (otpId: string, code: string) => Promise<void>;
  title?: string;
}

/**
 * Owner-approval gate. Creates a pending OTP request, waits for the owner to
 * issue a code in the Super Admin → Approvals queue, then accepts the code and
 * runs the privileged action via `onConfirm`.
 */
export default function OtpGate({
  open,
  onClose,
  purpose,
  description,
  amount,
  refId,
  onConfirm,
  title = "Owner Approval Required",
}: OtpGateProps) {
  const [otpId, setOtpId] = useState<string | null>(null);
  const [status, setStatus] = useState<"requesting" | "pending" | "issued" | "error">(
    "requesting"
  );
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const requestedRef = useRef(false);

  // Create the request once when the modal opens
  useEffect(() => {
    if (!open) {
      requestedRef.current = false;
      setOtpId(null);
      setStatus("requesting");
      setCode("");
      return;
    }
    if (requestedRef.current) return;
    requestedRef.current = true;

    (async () => {
      try {
        const res = await fetch("/api/hotel-admin/otp/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ purpose, description, amount, refId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to request approval");
        setOtpId(data.otpId);
        setStatus("pending");
      } catch (e) {
        setStatus("error");
        toast.error(e instanceof Error ? e.message : "Failed to request approval");
      }
    })();
  }, [open, purpose, description, amount, refId]);

  // Poll for the owner issuing the code
  useEffect(() => {
    if (!open || !otpId || status === "issued") return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/hotel-admin/otp/${otpId}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "ISSUED") setStatus("issued");
        else if (data.status === "REJECTED") {
          toast.error("The owner rejected this request");
          onClose();
        } else if (data.status === "EXPIRED") {
          toast.error("OTP expired — please try again");
          onClose();
        }
      } catch {
        /* silent */
      }
    }, 4000);
    return () => clearInterval(t);
  }, [open, otpId, status, onClose]);

  async function submit() {
    if (!otpId) return;
    if (code.trim().length < 4) {
      toast.error("Enter the OTP from the owner");
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(otpId, code.trim());
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-[#0d0a04] border border-amber-500/20 rounded-3xl p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/30 hover:text-white p-1 rounded-lg hover:bg-white/5"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center mb-4">
          <ShieldCheck className="w-6 h-6 text-amber-400" />
        </div>
        <h2 className="text-lg font-bold text-white mb-1">{title}</h2>
        <p className="text-white/45 text-sm mb-1">{description}</p>
        {amount != null && (
          <p className="text-amber-300 font-bold text-sm mb-4">
            ₹{amount.toLocaleString("en-IN")}
          </p>
        )}

        {status === "requesting" && (
          <div className="flex items-center gap-2 text-white/50 text-sm py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Requesting approval…
          </div>
        )}

        {status === "pending" && (
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 my-4 text-center">
            <Clock className="w-5 h-5 text-amber-400 mx-auto mb-2 animate-pulse" />
            <p className="text-white/70 text-sm font-medium">Waiting for owner approval…</p>
            <p className="text-white/35 text-xs mt-1">
              Ask the owner to issue an OTP from their Approvals screen.
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="bg-red-500/8 border border-red-500/20 rounded-xl p-4 my-4 text-center">
            <p className="text-red-300 text-sm">Couldn&apos;t request approval. Close and retry.</p>
          </div>
        )}

        {(status === "issued" || status === "pending") && (
          <div className="mt-4">
            <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">
              Enter OTP from owner
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-center text-xl tracking-[0.4em] font-mono placeholder:tracking-normal placeholder:text-base placeholder:text-white/25 focus:outline-none focus:border-amber-400/50"
            />
            <button
              onClick={submit}
              disabled={submitting}
              className="w-full mt-3 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-black font-bold py-3 rounded-xl transition-all"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Confirm
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
