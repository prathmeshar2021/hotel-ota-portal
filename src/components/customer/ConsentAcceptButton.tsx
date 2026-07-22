"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, CheckCircle2 } from "lucide-react";

export default function ConsentAcceptButton({ token }: { token: string }) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function accept() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/consent/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to record consent");
      toast.success("Consent recorded. Thank you!");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to record consent");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <label className="flex items-start gap-2 mb-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 w-4 h-4 accent-green-500 shrink-0"
        />
        <span className="text-xs text-white/60 leading-relaxed">
          I have read and agree to the declarations above, and I consent to the processing of my
          personal data as described.
        </span>
      </label>
      <button
        onClick={accept}
        disabled={!agreed || submitting}
        className="flex items-center justify-center gap-2 w-full text-sm font-bold px-4 py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {submitting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <CheckCircle2 className="w-4 h-4" />
        )}
        I Agree & Accept
      </button>
    </div>
  );
}
