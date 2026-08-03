"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus, Loader2, X, Upload, CreditCard } from "lucide-react";
import GuestSearch, { type GuestResult } from "./GuestSearch";
import { pdfToImage } from "@/lib/utils/id-photo";

interface Props {
  bookingId: string;
  /** How many more people the booking still expects details for. */
  pending: number;
  onClose: () => void;
}

const ID_TYPES = [
  { value: "AADHAR", label: "Aadhar Card" },
  { value: "DRIVING_LICENSE", label: "Driving License" },
  { value: "PASSPORT", label: "Passport" },
  { value: "VOTER_ID", label: "Voter ID" },
  { value: "OTHER", label: "Other ID" },
];

const inputCls =
  "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/50 transition-all";
const selectCls =
  "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-amber-400/50 transition-all appearance-none cursor-pointer";
const labelCls = "block text-[11px] font-semibold text-white/45 uppercase tracking-wider mb-1.5";

/**
 * Register one more guest on a stay already under way — someone who joined, or
 * a phone booking that turned out to be more people than first said. Captures
 * the same ID details check-in does, because the law wants them for everyone
 * staying, not only those present at check-in.
 */
export default function AddCompanionModal({ bookingId, pending, onClose }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("Friend");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [idType, setIdType] = useState("AADHAR");
  const [idNumber, setIdNumber] = useState("");
  const [idFrontUrl, setIdFrontUrl] = useState("");
  const [idBackUrl, setIdBackUrl] = useState("");
  const [uploading, setUploading] = useState<{ front: boolean; back: boolean }>({ front: false, back: false });

  async function upload(file: File, side: "front" | "back") {
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    if (!cloudName) { toast.error("Upload is not configured"); return; }
    const fd = new FormData();
    fd.append("file", file);
    fd.append("upload_preset", "hotel_ota_upload");
    fd.append("folder", "guest_ids");
    setUploading(u => ({ ...u, [side]: true }));
    try {
      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.secure_url) {
        toast.error(`Upload failed: ${data?.error?.message || `HTTP ${res.status}`}`);
        return;
      }
      // A PDF is stored as .pdf, which an <img> can't show — rewrite to a page image.
      const url = pdfToImage(data.secure_url);
      if (side === "front") setIdFrontUrl(url); else setIdBackUrl(url);
      toast.success(`ID ${side} uploaded`);
    } catch {
      toast.error("Upload failed. Check your connection.");
    } finally {
      setUploading(u => ({ ...u, [side]: false }));
    }
  }

  async function submit() {
    if (!name.trim())     { toast.error("Guest name is required"); return; }
    if (!idNumber.trim()) { toast.error("ID number is required"); return; }
    if (!idFrontUrl)      { toast.error("Upload the front of the ID"); return; }
    if (!idBackUrl)       { toast.error("Upload the back of the ID"); return; }

    setSaving(true);
    try {
      const res = await fetch(`/api/hotel-admin/bookings/${bookingId}/companions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          relation: relation.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          idType, idNumber: idNumber.trim(),
          idFrontUrl, idBackUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Could not add the guest"); return; }
      toast.success(data.message);
      onClose();
      router.refresh();
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setSaving(false);
    }
  }

  const PhotoBox = ({ side }: { side: "front" | "back" }) => {
    const url = side === "front" ? idFrontUrl : idBackUrl;
    const busy = uploading[side];
    return (
      <div>
        <label className={labelCls}>ID {side === "front" ? "Front" : "Back"} <span className="text-amber-400">*</span></label>
        {url ? (
          <div className="relative border border-white/15 rounded-xl overflow-hidden h-28 bg-black/20 group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`ID ${side}`} className="w-full h-full object-contain" />
            <button type="button"
              onClick={() => (side === "front" ? setIdFrontUrl("") : setIdBackUrl(""))}
              className="absolute top-2 right-2 bg-black/70 border border-white/20 rounded-full p-1 hover:bg-red-500/50 transition-all">
              <X className="w-3.5 h-3.5 text-white" />
            </button>
          </div>
        ) : (
          <label className="flex flex-col items-center justify-center gap-1 border-2 border-dashed border-amber-400/30 hover:border-amber-400/60 rounded-xl h-28 cursor-pointer transition-all">
            {busy
              ? <><Loader2 className="w-5 h-5 text-amber-400 animate-spin" /><span className="text-xs text-amber-300">Uploading…</span></>
              : <><Upload className="w-5 h-5 text-amber-400/60" /><span className="text-xs text-amber-300/70 font-semibold">Tap to upload</span><span className="text-[10px] text-white/25">Photo or PDF</span></>}
            <input type="file" accept="image/*,application/pdf" className="hidden" disabled={busy}
              onChange={e => e.target.files?.[0] && upload(e.target.files[0], side)} />
          </label>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !saving && onClose()} />
      <div className="relative bg-[#0d1a0e] border border-white/10 rounded-3xl p-6 w-full max-w-md shadow-2xl max-h-[92vh] overflow-y-auto">

        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="font-bold text-white">Add Guest Details</h2>
              <p className="text-white/35 text-xs">
                {pending} more guest{pending !== 1 ? "s" : ""} to register on this stay
              </p>
            </div>
          </div>
          <button onClick={() => !saving && onClose()} className="text-white/30 hover:text-white/60 p-1 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          {/* Stayed before? Pull their ID in rather than photographing it again. */}
          <GuestSearch
            placeholder="Stayed before? Search to auto-fill…"
            onSelect={(g: GuestResult) => {
              setName(g.name);
              if (g.phone) setPhone(g.phone);
              if (g.email) setEmail(g.email);
              if (g.idType) setIdType(g.idType);
              setIdNumber(g.idNumber ?? "");
              setIdFrontUrl(g.idFrontUrl ?? "");
              setIdBackUrl(g.idBackUrl ?? "");
              toast.success(`Loaded ${g.name}`);
            }}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Full Name <span className="text-amber-400">*</span></label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Relation</label>
              <input value={relation} onChange={e => setRelation(e.target.value)} placeholder="Spouse, Friend…" className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Phone <span className="text-white/25 normal-case font-normal">(optional)</span></label>
              <input value={phone} inputMode="tel"
                onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="10-digit mobile" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Email <span className="text-white/25 normal-case font-normal">(optional)</span></label>
              <input value={email} inputMode="email" onChange={e => setEmail(e.target.value)}
                placeholder="name@example.com" className={inputCls} />
            </div>
          </div>

          <div className="pt-1">
            <div className="flex items-center gap-2 mb-3">
              <CreditCard className="w-4 h-4 text-white/40" />
              <h3 className="text-sm font-semibold text-white/80">Identity Proof</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className={labelCls}>ID Type <span className="text-amber-400">*</span></label>
                <select value={idType} onChange={e => setIdType(e.target.value)} className={selectCls}>
                  {ID_TYPES.map(t => <option key={t.value} value={t.value} className="bg-[#0D1B0E]">{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>ID Number <span className="text-amber-400">*</span></label>
                <input value={idNumber} onChange={e => setIdNumber(e.target.value)} placeholder="ID number" className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <PhotoBox side="front" />
              <PhotoBox side="back" />
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={() => !saving && onClose()} disabled={saving}
            className="flex-1 py-3 rounded-xl border border-white/10 text-white/50 hover:text-white hover:border-white/20 text-sm font-semibold transition-all disabled:opacity-50">
            Cancel
          </button>
          <button onClick={submit} disabled={saving || uploading.front || uploading.back}
            className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><UserPlus className="w-4 h-4" /> Add Guest</>}
          </button>
        </div>
      </div>
    </div>
  );
}
