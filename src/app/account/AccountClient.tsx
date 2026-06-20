"use client";

import { useState } from "react";
import { Phone, Mail, CheckCircle, Loader2, Edit2, X, GitMerge, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface Guest {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

// ─── Merge flow state ─────────────────────────────────────────────────────────
type MergeStep = "idle" | "prompt" | "otp" | "merging";

interface MergeState {
  step: MergeStep;
  phone: string;
  otp: string;
  error: string;
  sending: boolean;
}

const MERGE_INIT: MergeState = {
  step: "idle",
  phone: "",
  otp: "",
  error: "",
  sending: false,
};

// ─── ContactField ──────────────────────────────────────────────────────────────

function ContactField({
  icon: Icon,
  label,
  currentValue,
  field,
  placeholder,
  inputType,
  pattern,
  onSaved,
  onMergeComplete,
}: {
  icon: React.ElementType;
  label: string;
  currentValue: string | null;
  field: "phone" | "email";
  placeholder: string;
  inputType: string;
  pattern?: string;
  onSaved: (value: string) => void;
  onMergeComplete?: (phone: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [merge, setMerge] = useState<MergeState>(MERGE_INIT);

  function resetAll() {
    setEditing(false);
    setValue("");
    setMerge(MERGE_INIT);
  }

  async function save() {
    const trimmed = value.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const res = await fetch("/api/account/contact", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Phone conflict with merge offer
        if (res.status === 409 && data.canMerge) {
          setMerge({ ...MERGE_INIT, step: "prompt", phone: trimmed });
          return;
        }
        toast.error(data.error ?? "Update failed");
        return;
      }
      toast.success(`${label} updated`);
      onSaved(trimmed);
      resetAll();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function sendMergeOtp() {
    setMerge((m) => ({ ...m, sending: true, error: "" }));
    try {
      const res = await fetch("/api/account/merge/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: merge.phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMerge((m) => ({ ...m, sending: false, error: data.error ?? "Failed to send OTP" }));
        return;
      }
      setMerge((m) => ({ ...m, sending: false, step: "otp", otp: "", error: "" }));
    } catch {
      setMerge((m) => ({ ...m, sending: false, error: "Something went wrong. Please try again." }));
    }
  }

  async function confirmMerge() {
    if (merge.otp.length !== 6) return;
    setMerge((m) => ({ ...m, step: "merging", error: "" }));
    try {
      const res = await fetch("/api/account/merge/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: merge.phone, otp: merge.otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMerge((m) => ({ ...m, step: "otp", error: data.error ?? "Merge failed" }));
        return;
      }
      toast.success("Accounts merged successfully!");
      onMergeComplete?.(merge.phone);
      resetAll();
    } catch {
      setMerge((m) => ({ ...m, step: "otp", error: "Something went wrong. Please try again." }));
    }
  }

  // ── Merge prompt ────────────────────────────────────────────────────────────
  if (merge.step === "prompt") {
    return (
      <div className="glass-card rounded-2xl p-5 border border-amber-500/20">
        <div className="flex items-center gap-2 mb-4">
          <GitMerge className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold text-amber-400/80 uppercase tracking-wider">Merge Account?</span>
        </div>
        <p className="text-white/75 text-sm leading-relaxed mb-1">
          <span className="font-semibold text-white">+91 {merge.phone}</span> is linked to another account.
        </p>
        <p className="text-white/45 text-sm leading-relaxed mb-5">
          Would you like to merge that account into this one? All bookings and data from the other account will be moved here, and the other account will be deleted.
        </p>
        {merge.error && (
          <p className="text-red-400 text-xs mb-3">{merge.error}</p>
        )}
        <div className="flex flex-col gap-2">
          <button
            onClick={sendMergeOtp}
            disabled={merge.sending}
            className="flex items-center justify-center gap-2 text-sm font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black px-4 py-2.5 rounded-xl transition-all"
          >
            {merge.sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            {merge.sending ? "Sending OTP…" : "Yes, send OTP to verify & merge"}
          </button>
          <button
            onClick={resetAll}
            className="text-sm text-white/40 hover:text-white px-4 py-2 rounded-xl hover:bg-white/5 transition-all"
          >
            No, cancel
          </button>
        </div>
      </div>
    );
  }

  // ── OTP entry ───────────────────────────────────────────────────────────────
  if (merge.step === "otp" || merge.step === "merging") {
    const isMerging = merge.step === "merging";
    return (
      <div className="glass-card rounded-2xl p-5 border border-amber-500/20">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold text-amber-400/80 uppercase tracking-wider">Verify OTP</span>
        </div>
        <p className="text-white/55 text-sm mb-4">
          An OTP was sent to <span className="text-white font-semibold">+91 {merge.phone}</span> via WhatsApp. Enter it below to confirm the merge.
        </p>

        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={merge.otp}
          onChange={(e) => setMerge((m) => ({ ...m, otp: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
          placeholder="6-digit OTP"
          autoFocus
          disabled={isMerging}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-center text-xl font-mono tracking-[0.4em] placeholder:text-white/20 focus:outline-none focus:border-amber-400/50 mb-3 disabled:opacity-50"
        />

        {merge.error && (
          <p className="text-red-400 text-xs mb-3">{merge.error}</p>
        )}

        <div className="flex flex-col gap-2">
          <button
            onClick={confirmMerge}
            disabled={merge.otp.length !== 6 || isMerging}
            className="flex items-center justify-center gap-2 text-sm font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black px-4 py-2.5 rounded-xl transition-all"
          >
            {isMerging ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitMerge className="w-4 h-4" />}
            {isMerging ? "Merging accounts…" : "Confirm Merge"}
          </button>
          <div className="flex gap-2">
            <button
              onClick={sendMergeOtp}
              disabled={merge.sending || isMerging}
              className="flex-1 text-xs text-white/35 hover:text-amber-400 py-2 rounded-xl hover:bg-white/5 transition-all"
            >
              Resend OTP
            </button>
            <button
              onClick={resetAll}
              disabled={isMerging}
              className="flex-1 text-xs text-white/35 hover:text-white py-2 rounded-xl hover:bg-white/5 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Normal view / edit ──────────────────────────────────────────────────────
  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-amber-400" />
        <span className="text-xs font-bold text-white/50 uppercase tracking-wider">{label}</span>
      </div>

      {!editing ? (
        <div className="flex items-center justify-between">
          {currentValue ? (
            <span className="text-white font-medium">
              {field === "phone" ? `+91 ${currentValue}` : currentValue}
            </span>
          ) : (
            <span className="text-white/30 italic text-sm">Not added</span>
          )}
          <button
            onClick={() => { setEditing(true); setValue(""); }}
            className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/20 px-3 py-1.5 rounded-lg transition-all"
          >
            <Edit2 className="w-3 h-3" />
            {currentValue ? "Change" : "Add"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            {field === "phone" && (
              <span className="flex items-center px-3 bg-white/5 border border-white/10 rounded-xl text-white/50 text-sm shrink-0">
                +91
              </span>
            )}
            <input
              type={inputType}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              pattern={pattern}
              autoFocus
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/50"
            />
          </div>
          <p className="text-[11px] text-white/35">
            {field === "phone"
              ? "Must be a 10-digit Indian mobile number. If it's linked to another account, you'll get the option to merge."
              : "Must not be linked to any other account."}
          </p>
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving || !value.trim()}
              className="flex items-center gap-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black px-4 py-2 rounded-xl transition-all"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => { setEditing(false); setValue(""); }}
              className="flex items-center gap-1 text-xs text-white/40 hover:text-white px-3 py-2 rounded-xl hover:bg-white/5 transition-all"
            >
              <X className="w-3.5 h-3.5" /> Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AccountClient ─────────────────────────────────────────────────────────────

export default function AccountClient({ guest }: { guest: Guest }) {
  const router = useRouter();
  const [phone, setPhone] = useState(guest.phone);
  const [email, setEmail] = useState(guest.email);

  function handleSaved(field: "phone" | "email", value: string) {
    if (field === "phone") setPhone(value);
    else setEmail(value);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Name — read-only */}
      <div className="glass-card rounded-2xl p-5">
        <p className="text-xs font-bold text-white/50 uppercase tracking-wider mb-2">Name</p>
        <p className="text-white font-medium">{guest.name}</p>
        <p className="text-[11px] text-white/25 mt-1">Name is set during registration and cannot be changed here.</p>
      </div>

      <ContactField
        icon={Phone}
        label="Mobile Number"
        currentValue={phone}
        field="phone"
        placeholder="10-digit number"
        inputType="tel"
        pattern="\d{10}"
        onSaved={(v) => handleSaved("phone", v)}
        onMergeComplete={(v) => { setPhone(v); router.refresh(); }}
      />

      <ContactField
        icon={Mail}
        label="Email Address"
        currentValue={email}
        field="email"
        placeholder="you@example.com"
        inputType="email"
        onSaved={(v) => handleSaved("email", v)}
      />
    </div>
  );
}
