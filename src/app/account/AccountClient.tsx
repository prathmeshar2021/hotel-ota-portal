"use client";

import { useState } from "react";
import { Phone, Mail, CheckCircle, Loader2, Edit2, X } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface Guest {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

function ContactField({
  icon: Icon,
  label,
  currentValue,
  field,
  placeholder,
  inputType,
  pattern,
  onSaved,
}: {
  icon: React.ElementType;
  label: string;
  currentValue: string | null;
  field: "phone" | "email";
  placeholder: string;
  inputType: string;
  pattern?: string;
  onSaved: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

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
        toast.error(data.error ?? "Update failed");
        return;
      }
      toast.success(`${label} updated`);
      onSaved(trimmed);
      setEditing(false);
      setValue("");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

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
              ? "Must be a 10-digit Indian mobile number not already linked to another account."
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

export default function AccountClient({ guest }: { guest: Guest }) {
  const router = useRouter();
  const [phone, setPhone] = useState(guest.phone);
  const [email, setEmail] = useState(guest.email);

  function handleSaved(field: "phone" | "email", value: string) {
    if (field === "phone") setPhone(value);
    else setEmail(value);
    // Refresh server data so navbar/session reflects the change
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Name — read-only (set at registration or via Google) */}
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
