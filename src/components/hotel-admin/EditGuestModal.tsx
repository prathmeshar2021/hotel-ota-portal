"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  X, Pencil, Loader2, User, Phone, Mail, CreditCard, Save,
} from "lucide-react";
import IdPhotoUpload from "./IdPhotoUpload";

interface GuestData {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  idType: string | null;
  idNumber: string | null;
  idFrontUrl: string | null;
  idBackUrl: string | null;
}

const ID_TYPES = [
  { value: "AADHAR", label: "Aadhar Card" },
  { value: "DRIVING_LICENSE", label: "Driving License" },
  { value: "PASSPORT", label: "Passport" },
  { value: "VOTER_ID", label: "Voter ID" },
  { value: "OTHER", label: "Other" },
];

export default function EditGuestModal({ guest }: { guest: GuestData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // form state
  const [name, setName] = useState(guest.name);
  const [phone, setPhone] = useState(guest.phone ?? "");
  const [email, setEmail] = useState(guest.email ?? "");
  const [idType, setIdType] = useState(guest.idType ?? "");
  const [idNumber, setIdNumber] = useState(guest.idNumber ?? "");
  const [idFrontUrl, setIdFrontUrl] = useState(guest.idFrontUrl ?? "");
  const [idBackUrl, setIdBackUrl] = useState(guest.idBackUrl ?? "");

  // reset form to latest guest values whenever modal opens
  useEffect(() => {
    if (open) {
      setName(guest.name);
      setPhone(guest.phone ?? "");
      setEmail(guest.email ?? "");
      setIdType(guest.idType ?? "");
      setIdNumber(guest.idNumber ?? "");
      setIdFrontUrl(guest.idFrontUrl ?? "");
      setIdBackUrl(guest.idBackUrl ?? "");
    }
  }, [open, guest]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim() || name.trim().length < 2) {
      toast.error("Name must be at least 2 characters");
      return;
    }
    if (phone && phone.length !== 10) {
      toast.error("Phone must be exactly 10 digits");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/hotel-admin/guests/${guest.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone || null,
          email: email.trim() || null,
          idType: idType || null,
          idNumber: idNumber.trim() || null,
          idFrontUrl: idFrontUrl || null,
          idBackUrl: idBackUrl || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Failed to update guest");
        return;
      }

      toast.success("Guest profile updated");
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-white/8 hover:bg-white/12 border border-white/10 text-white/70 hover:text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-all"
      >
        <Pencil className="w-4 h-4" />
        Edit Profile
      </button>

      {/* Modal overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => !loading && setOpen(false)}
          />

          {/* Panel */}
          <div className="relative z-10 w-full max-w-lg bg-[#0A1A0D] border border-white/10 rounded-2xl shadow-2xl max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
                  <Pencil className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <h2 className="font-bold text-white text-sm">Edit Guest Profile</h2>
                  <p className="text-white/35 text-xs">{guest.name}</p>
                </div>
              </div>
              <button
                onClick={() => !loading && setOpen(false)}
                disabled={loading}
                className="text-white/30 hover:text-white/70 p-1.5 rounded-lg hover:bg-white/8 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable body */}
            <form onSubmit={handleSave} className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

              {/* ── Name ── */}
              <div>
                <label className="block text-xs font-semibold text-white/45 uppercase tracking-wider mb-2">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    placeholder="Guest full name"
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder:text-white/20 text-sm focus:outline-none focus:border-blue-400/50 transition-all"
                  />
                </div>
              </div>

              {/* ── Phone ── */}
              <div>
                <label className="block text-xs font-semibold text-white/45 uppercase tracking-wider mb-2">
                  Mobile Number
                  {!guest.phone && (
                    <span className="ml-2 text-amber-400 font-normal normal-case tracking-normal">
                      — not set (Google account)
                    </span>
                  )}
                </label>
                <div className="flex">
                  <span className="flex items-center gap-1.5 px-3.5 bg-white/5 border border-white/10 border-r-0 rounded-l-xl text-white/40 text-sm shrink-0">
                    <Phone className="w-3.5 h-3.5" /> +91
                  </span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    placeholder="10-digit number"
                    className="flex-1 bg-white/5 border border-white/10 rounded-r-xl px-4 py-2.5 text-white placeholder:text-white/20 text-sm focus:outline-none focus:border-blue-400/50 transition-all"
                  />
                </div>
              </div>

              {/* ── Email ── */}
              <div>
                <label className="block text-xs font-semibold text-white/45 uppercase tracking-wider mb-2">
                  Email <span className="text-white/25 font-normal normal-case tracking-normal">(optional)</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="guest@example.com"
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder:text-white/20 text-sm focus:outline-none focus:border-blue-400/50 transition-all"
                  />
                </div>
              </div>

              {/* ── ID Details ── */}
              <div className="border-t border-white/8 pt-5">
                <p className="text-xs font-semibold text-white/45 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" /> Government ID
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-white/35 mb-1.5">ID Type</label>
                    <select
                      value={idType}
                      onChange={e => setIdType(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-400/50 transition-all"
                    >
                      <option value="">Select type</option>
                      {ID_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-white/35 mb-1.5">ID Number</label>
                    <input
                      type="text"
                      value={idNumber}
                      onChange={e => setIdNumber(e.target.value.toUpperCase())}
                      placeholder="e.g. 1234 5678 9012"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder:text-white/20 text-sm font-mono focus:outline-none focus:border-blue-400/50 transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* ── ID Photos ── */}
              <div>
                <p className="text-xs font-semibold text-white/45 uppercase tracking-wider mb-3">
                  ID Photos
                </p>
                <IdPhotoUpload
                  frontUrl={idFrontUrl}
                  backUrl={idBackUrl}
                  onFrontChange={setIdFrontUrl}
                  onBackChange={setIdBackUrl}
                />
              </div>
            </form>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-white/8 shrink-0 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => !loading && setOpen(false)}
                disabled={loading}
                className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white/70 text-sm font-semibold transition-all disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 disabled:opacity-60 text-white font-bold text-sm transition-all shadow-lg shadow-blue-500/20"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
