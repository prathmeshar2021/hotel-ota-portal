"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Loader2, Upload, CheckCircle, CreditCard, User, Phone, Mail,
  X, FileText, ShieldCheck, UserPlus, Trash2, Plus,
} from "lucide-react";
import { pdfToImage } from "@/lib/utils/id-photo";

type IdType = "AADHAR" | "DRIVING_LICENSE" | "PASSPORT" | "VOTER_ID" | "OTHER";
type Gender = "MALE" | "FEMALE" | "OTHER";

interface GuestEntry {
  name: string; phone: string; email: string; gender: Gender;
  idType: IdType; idNumber: string; idFrontUrl: string; idBackUrl: string;
}

const ID_TYPES: { value: IdType; label: string }[] = [
  { value: "AADHAR", label: "Aadhar Card" },
  { value: "DRIVING_LICENSE", label: "Driving License" },
  { value: "PASSPORT", label: "Passport" },
  { value: "VOTER_ID", label: "Voter ID" },
  { value: "OTHER", label: "Other ID" },
];
const GENDERS: { value: Gender; label: string }[] = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
];

const blankGuest = (): GuestEntry => ({
  name: "", phone: "", email: "", gender: "MALE",
  idType: "AADHAR", idNumber: "", idFrontUrl: "", idBackUrl: "",
});

const inputCls =
  "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/60 focus:bg-white/8 transition-all";
const labelCls = "block text-xs font-semibold text-white/70 uppercase tracking-wider mb-2";
const optLabelCls = "block text-xs font-semibold text-white/45 uppercase tracking-wider mb-2";
const selectCls =
  "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-amber-400/60 transition-all appearance-none cursor-pointer";

function Req() { return <span className="text-amber-400 ml-0.5">*</span>; }

/** One ID upload box — accepts a photo or a PDF (rendered as an image). */
function UploadBox({
  label, url, busy, onFile, onClear,
}: {
  label: string; url: string; busy: boolean;
  onFile: (f: File) => void; onClear: () => void;
}) {
  return (
    <div>
      <label className={labelCls}>{label} <Req /></label>
      {url ? (
        <div className="relative border border-white/15 rounded-xl overflow-hidden h-32 bg-black/20 group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={label} className="w-full h-full object-contain" />
          <button type="button" onClick={onClear}
            className="absolute top-2 right-2 bg-black/70 border border-white/20 rounded-full p-1 hover:bg-red-500/50 transition-all">
            <X className="w-3.5 h-3.5 text-white" />
          </button>
          <label className="absolute inset-0 flex items-end justify-center pb-2 cursor-pointer opacity-0 group-hover:opacity-100 transition-all">
            <span className="text-[10px] text-white/70 bg-black/60 px-2 py-0.5 rounded-full">tap to replace</span>
            <input type="file" accept="image/*,application/pdf" className="hidden"
              onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-amber-400/30 hover:border-amber-400/60 hover:bg-amber-500/5 rounded-xl h-32 cursor-pointer transition-all">
          {busy ? (
            <><Loader2 className="w-6 h-6 text-amber-400 animate-spin" /><span className="text-xs text-amber-300">Uploading…</span></>
          ) : (
            <>
              <Upload className="w-6 h-6 text-amber-400/60" />
              <span className="text-xs text-amber-300/70 font-semibold">Tap to upload</span>
              <span className="text-[10px] text-white/25">Photo or PDF</span>
            </>
          )}
          <input type="file" accept="image/*,application/pdf" className="hidden" disabled={busy}
            onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
      )}
    </div>
  );
}

export default function GuestRegisterForm() {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<string[] | null>(null);   // registered guest names

  const [guests, setGuests] = useState<GuestEntry[]>([blankGuest()]);
  // Explicit acknowledgement of the rules above — chiefly the 20+ age rule for
  // couples, which is what gets people turned away at the desk.
  const [acceptedRules, setAcceptedRules] = useState(false);
  // Per-guest upload spinners: { [idx]: { front, back } }
  const [uploading, setUploading] = useState<Record<number, { front: boolean; back: boolean }>>({});

  function update(i: number, field: keyof GuestEntry, val: string) {
    setGuests(prev => prev.map((g, idx) => idx === i ? { ...g, [field]: val } : g));
  }
  function addGuest() {
    if (guests.length >= 10) { toast.error("You can register up to 10 guests at once"); return; }
    setGuests(prev => [...prev, blankGuest()]);
  }
  function removeGuest(i: number) {
    setGuests(prev => prev.filter((_, idx) => idx !== i));
    setUploading(prev => { const n = { ...prev }; delete n[i]; return n; });
  }

  async function uploadId(file: File, side: "front" | "back", i: number) {
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    if (!cloudName) { toast.error("Upload not set up — please ask reception staff."); return; }

    const fd = new FormData();
    fd.append("file", file);
    fd.append("upload_preset", "hotel_ota_upload");
    fd.append("folder", "guest_ids");

    setUploading(p => ({ ...p, [i]: { ...(p[i] ?? { front: false, back: false }), [side]: true } }));
    try {
      // The image endpoint accepts both photos and PDFs; pdfToImage rewrites a
      // PDF result to a viewable first-page JPG.
      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.secure_url) {
        toast.error(`Upload failed: ${data?.error?.message || `HTTP ${res.status}`}`);
        return;
      }
      update(i, side === "front" ? "idFrontUrl" : "idBackUrl", pdfToImage(data.secure_url));
      toast.success(`ID ${side} uploaded ✓`);
    } catch {
      toast.error("Upload failed. Check your connection and try again.");
    } finally {
      setUploading(p => ({ ...p, [i]: { ...(p[i] ?? { front: false, back: false }), [side]: false } }));
    }
  }

  function resetForm() {
    setGuests([blankGuest()]);
    setUploading({});
    setAcceptedRules(false);
    setDone(null);
  }

  const anyUploading = Object.values(uploading).some(u => u.front || u.back);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Per-guest required-field validation
    for (let i = 0; i < guests.length; i++) {
      const g = guests[i];
      const who = `Guest ${i + 1}`;
      if (g.name.trim().length < 2) { toast.error(`${who}: please enter the full name`); return; }
      if (g.phone.replace(/\D/g, "").length !== 10) { toast.error(`${who}: enter a valid 10-digit phone number`); return; }
      if (g.idNumber.trim().length < 3) { toast.error(`${who}: please enter the ID number`); return; }
      if (!g.idFrontUrl) { toast.error(`${who}: please upload the ID front`); return; }
      if (!g.idBackUrl)  { toast.error(`${who}: please upload the ID back`); return; }
    }
    if (!acceptedRules) {
      toast.error("Please accept the rules and regulations to continue");
      return;
    }
    // All phones must be different
    const phones = guests.map(g => g.phone.replace(/\D/g, ""));
    if (new Set(phones).size !== phones.length) {
      toast.error("Each guest must have a different phone number");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/guest-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guests: guests.map(g => ({
            name: g.name.trim(),
            phone: g.phone.replace(/\D/g, ""),
            email: g.email.trim() || "",
            gender: g.gender, idType: g.idType,
            idNumber: g.idNumber.trim(),
            idFrontUrl: g.idFrontUrl, idBackUrl: g.idBackUrl,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Registration failed"); return; }
      setDone(guests.map(g => g.name.trim()));
    } finally {
      setLoading(false);
    }
  }

  // ── Success screen ──
  if (done) {
    return (
      <div className="bg-white/3 border border-green-500/25 rounded-3xl p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mx-auto mb-5">
          <CheckCircle className="w-8 h-8 text-green-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">
          {done.length > 1 ? `${done.length} guests registered!` : `You're registered, ${done[0].split(" ")[0]}!`}
        </h2>
        {done.length > 1 && (
          <p className="text-white/70 text-sm mb-2">{done.join(", ")}</p>
        )}
        <p className="text-white/50 text-sm max-w-sm mx-auto mb-6">
          Please let the reception desk know a <span className="text-white/80 font-semibold">name</span> or
          <span className="text-white/80 font-semibold"> phone number</span> — they&apos;ll pull up everyone&apos;s details instantly.
        </p>
        <button onClick={resetForm}
          className="inline-flex items-center gap-2 bg-white/8 hover:bg-white/12 border border-white/12 text-white font-semibold px-5 py-3 rounded-xl transition-all">
          <UserPlus className="w-4 h-4" /> Register more guests
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Group / same-file / PDF tip */}
      <div className="flex items-start gap-2.5 bg-amber-500/8 border border-amber-500/15 rounded-2xl px-4 py-3">
        <FileText className="w-4 h-4 text-amber-400/80 shrink-0 mt-0.5" />
        <p className="text-[12.5px] text-amber-200/70 leading-relaxed">
          Checking in as a group? Add every guest below.
          If an ID&apos;s front &amp; back are on the <span className="font-semibold text-amber-200/90">same file</span>,
          upload it to <span className="font-semibold text-amber-200/90">both</span> boxes.
        </p>
      </div>

      {guests.map((g, i) => {
        const u = uploading[i] ?? { front: false, back: false };
        return (
          <div key={i} className="bg-white/3 border border-white/8 rounded-3xl p-6 relative">
            {/* Guest header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-amber-500 text-black text-xs font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <h2 className="font-semibold text-white text-base flex items-center gap-2">
                  <User className="w-4 h-4 text-white/40" /> {i === 0 ? "Your Details" : `Guest ${i + 1}`}
                </h2>
              </div>
              {guests.length > 1 && (
                <button type="button" onClick={() => removeGuest(i)}
                  className="flex items-center gap-1.5 text-xs text-white/40 hover:text-red-400 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </button>
              )}
            </div>

            {/* Personal details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={labelCls}>Full Name <Req /></label>
                <input value={g.name} onChange={e => update(i, "name", e.target.value)}
                  placeholder="As per your ID" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Phone Number <Req /></label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                  <input value={g.phone} type="tel" inputMode="numeric"
                    onChange={e => update(i, "phone", e.target.value.replace(/\D/g, "").slice(0, 10))}
                    placeholder="10-digit mobile" className={`${inputCls} pl-10`} />
                </div>
              </div>
              <div>
                <label className={optLabelCls}>Email <span className="text-white/25 normal-case font-normal tracking-normal">(optional)</span></label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                  <input value={g.email} type="email" inputMode="email"
                    onChange={e => update(i, "email", e.target.value)}
                    placeholder="name@example.com" className={`${inputCls} pl-10`} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Gender <Req /></label>
                <select value={g.gender} onChange={e => update(i, "gender", e.target.value)} className={selectCls}>
                  {GENDERS.map(x => <option key={x.value} value={x.value} className="bg-[#0D1B0E]">{x.label}</option>)}
                </select>
              </div>
            </div>

            {/* Identity proof */}
            <div className="mt-5 pt-5 border-t border-white/8">
              <div className="flex items-center gap-2 mb-4">
                <CreditCard className="w-4 h-4 text-white/40" />
                <h3 className="text-sm font-semibold text-white/80">Identity Proof</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className={labelCls}>ID Type <Req /></label>
                  <select value={g.idType} onChange={e => update(i, "idType", e.target.value)} className={selectCls}>
                    {ID_TYPES.map(t => <option key={t.value} value={t.value} className="bg-[#0D1B0E]">{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>ID Number <Req /></label>
                  <input value={g.idNumber} onChange={e => update(i, "idNumber", e.target.value)}
                    placeholder="Enter ID number" className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <UploadBox label="ID Front" url={g.idFrontUrl} busy={u.front}
                  onFile={f => uploadId(f, "front", i)} onClear={() => update(i, "idFrontUrl", "")} />
                <UploadBox label="ID Back" url={g.idBackUrl} busy={u.back}
                  onFile={f => uploadId(f, "back", i)} onClear={() => update(i, "idBackUrl", "")} />
              </div>
            </div>
          </div>
        );
      })}

      {/* Add another guest */}
      <button type="button" onClick={addGuest}
        className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-white/15 hover:border-amber-400/50 hover:bg-amber-500/5 text-white/60 hover:text-amber-300 font-semibold py-3.5 rounded-2xl transition-all">
        <Plus className="w-4 h-4" /> Add another guest
      </button>

      {/* Rules acknowledgement */}
      <label className="flex items-start gap-3 bg-white/3 border border-white/10 rounded-2xl px-4 py-3.5 cursor-pointer hover:border-white/20 transition-colors">
        <input
          type="checkbox"
          checked={acceptedRules}
          onChange={e => setAcceptedRules(e.target.checked)}
          className="accent-amber-500 w-4 h-4 mt-0.5 shrink-0"
        />
        <span className="text-[12.5px] text-white/60 leading-relaxed">
          I have read and accept the rules and regulations above, and confirm that
          everyone in my party meets them — including the{" "}
          <span className="text-amber-300/90 font-semibold">20+ age requirement for couples</span>.
        </span>
      </label>

      {/* Submit */}
      <button type="submit" disabled={loading || anyUploading || !acceptedRules}
        className="w-full flex items-center justify-center gap-2 font-bold py-4 rounded-2xl text-base transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:hover:scale-100 bg-amber-500 text-black shadow-xl shadow-amber-500/20">
        {loading
          ? <><Loader2 className="w-5 h-5 animate-spin" /> Registering…</>
          : <><ShieldCheck className="w-5 h-5" /> Register {guests.length > 1 ? `${guests.length} guests` : ""}</>}
      </button>

      <p className="text-center text-xs text-white/25">
        Fields marked <span className="text-amber-400 font-bold">*</span> are required.
        Your details are kept private and shared only with the hotel.
      </p>
    </form>
  );
}
