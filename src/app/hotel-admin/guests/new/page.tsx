"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft, UserPlus, User, Phone, Mail, CreditCard, Loader2, Check,
} from "lucide-react";
import IdPhotoUpload from "@/components/hotel-admin/IdPhotoUpload";

const inputCls = "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-blue-400/40 focus:bg-white/8 transition-all";
const labelCls = "block text-xs font-semibold text-white/45 uppercase tracking-wider mb-2";
const selectCls = "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-400/40 transition-all appearance-none cursor-pointer";

const ID_TYPES = [
  { value: "AADHAR", label: "Aadhar Card" },
  { value: "DRIVING_LICENSE", label: "Driving License" },
  { value: "PASSPORT", label: "Passport" },
  { value: "VOTER_ID", label: "Voter ID" },
  { value: "OTHER", label: "Other ID" },
];

export default function NewGuestPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [idType, setIdType] = useState("AADHAR");
  const [idNumber, setIdNumber] = useState("");
  const [idFrontUrl, setIdFrontUrl] = useState("");
  const [idBackUrl, setIdBackUrl] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length !== 10) { toast.error("Phone must be exactly 10 digits"); return; }
    if (name.trim().length < 2) { toast.error("Name is required"); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/hotel-admin/guests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: cleanPhone,
          email: email.trim() || undefined,
          idType: idType || undefined,
          idNumber: idNumber.trim() || undefined,
          idFrontUrl: idFrontUrl || undefined,
          idBackUrl: idBackUrl || undefined,
        }),
      });
      const data = await res.json();

      if (res.status === 409) {
        toast.error("A guest with this phone number already exists");
        return;
      }
      if (!res.ok) {
        toast.error(data.error?.formErrors?.[0] ?? "Failed to register guest");
        return;
      }

      setDone(true);
      toast.success(`${name} registered successfully!`);
      setTimeout(() => router.push(`/hotel-admin/guests/${data.id}`), 1200);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link
          href="/hotel-admin/guests"
          className="text-white/35 hover:text-white/70 p-2 rounded-xl hover:bg-white/5 transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-blue-400" />
            <h1 className="text-xl font-bold text-white">Register New Guest</h1>
          </div>
          <p className="text-white/35 text-sm mt-0.5">Walk-in guest — ID details for hotel records</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white/3 border border-white/8 rounded-2xl p-6 space-y-5">
        {/* Name */}
        <div>
          <label className={labelCls}>Full Name *</label>
          <div className="relative">
            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="As on government ID"
              required
              className={`${inputCls} pl-10`}
            />
          </div>
        </div>

        {/* Phone */}
        <div>
          <label className={labelCls}>Mobile Number *</label>
          <div className="flex">
            <span className="flex items-center gap-1.5 px-3 bg-white/5 border border-white/10 border-r-0 rounded-l-xl text-white/35 text-sm shrink-0">
              <Phone className="w-3.5 h-3.5" /> +91
            </span>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="10-digit mobile number"
              required
              className="flex-1 bg-white/5 border border-white/10 rounded-r-xl px-4 py-3 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-blue-400/40 transition-all"
            />
          </div>
        </div>

        {/* Email */}
        <div>
          <label className={labelCls}>
            Email <span className="normal-case font-normal text-white/20">(optional)</span>
          </label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="guest@email.com"
              className={`${inputCls} pl-10`}
            />
          </div>
        </div>

        {/* Identity section */}
        <div className="border-t border-white/8 pt-5 space-y-4">
          <p className="text-white/30 text-xs uppercase tracking-wider font-semibold">
            Identity Proof
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* ID Type */}
            <div>
              <label className={labelCls}>ID Type</label>
              <select value={idType} onChange={e => setIdType(e.target.value)} className={selectCls}>
                {ID_TYPES.map(t => (
                  <option key={t.value} value={t.value} className="bg-[#0D1B0E]">{t.label}</option>
                ))}
              </select>
            </div>

            {/* ID Number */}
            <div>
              <label className={labelCls}>
                ID Number <span className="normal-case font-normal text-white/20">(optional)</span>
              </label>
              <div className="relative">
                <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                <input
                  value={idNumber}
                  onChange={e => setIdNumber(e.target.value)}
                  placeholder="Enter ID number"
                  className={`${inputCls} pl-10`}
                />
              </div>
            </div>
          </div>

          {/* ID Photos */}
          <IdPhotoUpload
            frontUrl={idFrontUrl}
            backUrl={idBackUrl}
            onFrontChange={setIdFrontUrl}
            onBackChange={setIdBackUrl}
          />
        </div>

        {/* Submit */}
        <div className="flex gap-3 pt-2">
          <Link
            href="/hotel-admin/guests"
            className="flex-1 text-center text-white/40 hover:text-white/70 text-sm font-semibold px-4 py-3 rounded-xl bg-white/5 hover:bg-white/8 transition-all"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting || done}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white font-bold px-6 py-3 rounded-xl transition-all"
          >
            {done ? (
              <><Check className="w-5 h-5" /> Registered!</>
            ) : submitting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Registering…</>
            ) : (
              <><UserPlus className="w-4 h-4" /> Register Guest</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
