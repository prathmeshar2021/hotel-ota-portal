"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { usePanelT } from "@/components/i18n/PanelLang";
import {
  X, LogIn, Loader2, CreditCard, MapPin, Car, Users, Plus, Trash2,
  ShieldCheck, Upload, Send,
} from "lucide-react";
import GuestSearch, { type GuestResult } from "./GuestSearch";
import { REFUNDABLE_DEPOSIT } from "@/lib/utils/booking-calc";

// ─── Types ────────────────────────────────────────────────────────────────────

type IdType = "AADHAR" | "DRIVING_LICENSE" | "PASSPORT" | "VOTER_ID" | "OTHER";

interface CompanionData {
  name: string;
  relation: string;
  phone: string;
  email: string;
  idType: string;
  idNumber: string;
  idFrontUrl: string;
  idBackUrl: string;
}

interface ExistingCheckinData {
  idType?: string | null;
  idNumber?: string | null;
  idFrontUrl?: string | null;
  idBackUrl?: string | null;
  comingFrom?: string | null;
  goingTo?: string | null;
  purpose?: string | null;
  vehicleNo?: string | null;
  companions?: {
    name: string;
    relation?: string | null;
    phone?: string | null;
    email?: string | null;
    idType?: string | null;
    idNumber?: string | null;
    idFrontUrl?: string | null;
    idBackUrl?: string | null;
  }[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  bookingId: string;
  bookingRef: string;
  guestName: string;
  noOfPersons: number;
  existingData?: ExistingCheckinData;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ID_TYPES = [
  { value: "AADHAR",          label: "Aadhar Card" },
  { value: "DRIVING_LICENSE", label: "Driving License" },
  { value: "PASSPORT",        label: "Passport" },
  { value: "VOTER_ID",        label: "Voter ID" },
  { value: "OTHER",           label: "Other ID" },
];

const PURPOSES = [
  "Leisure / Tourism", "Business", "Family Visit", "Medical", "Education", "Other",
];

// Nearby towns — most guests are local, so quick-select saves typing.
const NEARBY_PLACES = ["Durg", "Bhilai", "Raipur", "Rajnandgaon", "Bilaspur"];

// ─── Style helpers ────────────────────────────────────────────────────────────

const inputCls    = "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/40 transition-all";
const reqInputCls = "w-full bg-white/5 border border-white/15 rounded-xl px-4 py-2.5 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/60 transition-all";
const selectCls   = "w-full bg-white/5 border border-white/15 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-amber-400/40 transition-all appearance-none cursor-pointer";
const labelCls    = "block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5";
const reqLabelCls = "block text-[11px] font-semibold text-white/65 uppercase tracking-wider mb-1.5";

function Req() { return <span className="text-amber-400 ml-0.5">*</span>; }

/**
 * Origin / destination field with quick-select chips for nearby towns.
 * Most guests are local, so a tap on "Bhilai" beats typing it out. Picking
 * "Other" reveals a free-text box for anywhere not in the list.
 * A value that is a non-empty string outside NEARBY_PLACES = "Other" mode.
 */
function PlaceField({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  const isOther = value !== "" && !NEARBY_PLACES.includes(value);
  const chipCls = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
      active
        ? "bg-amber-500 text-black border-amber-400"
        : "bg-white/5 border-white/10 text-white/60 hover:text-white/90 hover:border-white/20"
    }`;
  return (
    <div>
      <label className={reqLabelCls}>{label} <Req /></label>
      <div className="flex flex-wrap gap-1.5">
        {NEARBY_PLACES.map(place => (
          <button type="button" key={place} onClick={() => onChange(place)}
            className={chipCls(value === place)}>
            {place}
          </button>
        ))}
        {/* Sentinel " " marks Other-mode active while the box is still empty. */}
        <button type="button" onClick={() => onChange(isOther ? value : " ")}
          className={chipCls(isOther)}>
          Other
        </button>
      </div>
      {isOther && (
        <input value={value.trim()} onChange={e => onChange(e.target.value)} autoFocus
          placeholder="City / Town / Address" className={`${reqInputCls} mt-2`} />
      )}
    </div>
  );
}

function SectionHead({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.2)" }}>
        <span className="text-amber-400">{icon}</span>
      </div>
      <div>
        <p className="font-semibold text-white text-sm">{title}</p>
        {sub && <p className="text-xs text-white/30 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Reusable photo upload widget ────────────────────────────────────────────

interface PhotoBoxProps {
  label: string;
  required?: boolean;
  url: string;
  uploading: boolean;
  onFile: (file: File) => void;
  onClear: () => void;
}

function PhotoBox({ label, required, url, uploading, onFile, onClear }: PhotoBoxProps) {
  return (
    <div>
      <label className={required ? reqLabelCls : labelCls}>
        {label} {required && <Req />}
      </label>
      {url ? (
        <div className="relative border border-white/15 rounded-xl overflow-hidden h-28 bg-white/3 group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={label} className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={onClear}
            className="absolute top-2 right-2 bg-black/70 border border-white/20 rounded-full p-1 opacity-0 group-hover:opacity-100 hover:bg-red-500/60 transition-all"
          >
            <X className="w-3.5 h-3.5 text-white" />
          </button>
          <label className="absolute inset-0 flex items-end justify-center pb-2 cursor-pointer opacity-0 group-hover:opacity-100 transition-all">
            <span className="text-[10px] text-white/70 bg-black/60 px-2 py-0.5 rounded-full">tap to replace</span>
            <input type="file" accept="image/*" className="hidden"
              onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
        </div>
      ) : (
        <label className={`flex flex-col items-center justify-center gap-1.5 border-2 border-dashed rounded-xl h-28 cursor-pointer transition-all ${
          required
            ? "border-amber-400/30 hover:border-amber-400/60 hover:bg-amber-500/4"
            : "border-white/10 hover:border-amber-400/25 hover:bg-white/3"
        }`}>
          {uploading ? (
            <>
              <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
              <span className="text-xs text-amber-300">Uploading…</span>
            </>
          ) : (
            <>
              <Upload className={`w-5 h-5 ${required ? "text-amber-400/60" : "text-white/20"}`} />
              <span className={`text-xs ${required ? "text-amber-300/70 font-semibold" : "text-white/30"}`}>
                {required ? "Required — tap to upload" : "Tap to upload"}
              </span>
              <span className="text-[10px] text-white/20">JPG · PNG · HEIC</span>
            </>
          )}
          <input type="file" accept="image/*" className="hidden" disabled={uploading}
            onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
      )}
    </div>
  );
}

// ─── Cloudinary upload helper ─────────────────────────────────────────────────

async function uploadToCloudinary(file: File): Promise<string> {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (!cloudName) throw new Error("Upload not configured. Contact hotel staff.");

  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", "hotel_ota_upload");
  fd.append("folder", "guest_ids");

  const res  = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok || !data.secure_url) throw new Error(`Upload failed: ${data?.error?.message || `HTTP ${res.status}`}`);
  return data.secure_url as string;
}

// ─── Default blank companion ──────────────────────────────────────────────────

const blankCompanion = (): CompanionData => ({
  name: "", relation: "Friend", phone: "", email: "",
  idType: "AADHAR", idNumber: "", idFrontUrl: "", idBackUrl: "",
});

// ─── Main component ───────────────────────────────────────────────────────────

export default function CounterCheckinModal({
  open, onClose, bookingId, bookingRef, guestName, noOfPersons, existingData,
}: Props) {
  const router = useRouter();
  const t = usePanelT();
  const [loading, setLoading] = useState(false);

  // Primary guest
  const [primaryName, setPrimaryName] = useState(guestName);
  const [idType, setIdType]         = useState<IdType>((existingData?.idType as IdType) ?? "AADHAR");
  const [idNumber, setIdNumber]     = useState(existingData?.idNumber ?? "");
  const [idFrontUrl, setIdFrontUrl] = useState(existingData?.idFrontUrl ?? "");
  const [idBackUrl, setIdBackUrl]   = useState(existingData?.idBackUrl ?? "");
  const [uploadingFront, setUploadingFront] = useState(false);
  const [uploadingBack, setUploadingBack]   = useState(false);

  // Travel
  const [comingFrom, setComingFrom] = useState(existingData?.comingFrom ?? "");
  const [goingTo, setGoingTo]       = useState(existingData?.goingTo ?? "");
  const [purpose, setPurpose]       = useState(existingData?.purpose || "Leisure / Tourism");
  const [vehicleNo, setVehicleNo]   = useState(existingData?.vehicleNo ?? "");

  // Refundable deposit — editable, may be skipped.
  const [collectDeposit, setCollectDeposit] = useState(true);
  const [depositAmount, setDepositAmount]   = useState(String(REFUNDABLE_DEPOSIT));
  const [depositMode, setDepositMode]       = useState<"CASH" | "ONLINE">("CASH");
  // Sending a Razorpay link is a separate action from saving the form: the
  // guest pays on their phone and the webhook records it, which is what lets
  // checkout refund the deposit instantly to the same account.
  const [sendingLink, setSendingLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [checkingPaid, setCheckingPaid] = useState(false);
  const [depositPaid, setDepositPaid] = useState(false);

  // Companions
  const initCompanions = (): CompanionData[] => {
    if (existingData?.companions?.length) {
      return existingData.companions.map(c => ({
        name: c.name, relation: c.relation || "Friend",
        phone: c.phone ?? "", email: c.email ?? "",
        idType: c.idType ?? "AADHAR", idNumber: c.idNumber ?? "",
        idFrontUrl: c.idFrontUrl ?? "", idBackUrl: c.idBackUrl ?? "",
      }));
    }
    return noOfPersons > 1 ? [blankCompanion()] : [];
  };
  const [companions, setCompanions] = useState<CompanionData[]>(initCompanions);

  // Per-companion upload state: { [index]: { front: bool, back: bool } }
  const [compUploading, setCompUploading] = useState<Record<number, { front: boolean; back: boolean }>>({});

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setPrimaryName(guestName);
    setIdType((existingData?.idType as IdType) ?? "AADHAR");
    setIdNumber(existingData?.idNumber ?? "");
    setIdFrontUrl(existingData?.idFrontUrl ?? "");
    setIdBackUrl(existingData?.idBackUrl ?? "");
    setComingFrom(existingData?.comingFrom ?? "");
    setGoingTo(existingData?.goingTo ?? "");
    setPurpose(existingData?.purpose || "Leisure / Tourism");
    setVehicleNo(existingData?.vehicleNo ?? "");
    setCompanions(initCompanions());
    setCompUploading({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Primary guest photo upload ─────────────────────────────────────────────

  async function uploadPrimaryPhoto(file: File, side: "front" | "back") {
    const setter = side === "front" ? setUploadingFront : setUploadingBack;
    setter(true);
    try {
      const url = await uploadToCloudinary(file);
      if (side === "front") setIdFrontUrl(url); else setIdBackUrl(url);
      toast.success(`Primary guest ID ${side} photo uploaded ✓`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setter(false);
    }
  }

  // ── Companion photo upload ─────────────────────────────────────────────────

  async function uploadCompanionPhoto(file: File, side: "front" | "back", idx: number) {
    setCompUploading(p => ({ ...p, [idx]: { ...(p[idx] ?? { front: false, back: false }), [side]: true } }));
    try {
      const url = await uploadToCloudinary(file);
      setCompanions(prev =>
        prev.map((c, i) => i === idx
          ? { ...c, [side === "front" ? "idFrontUrl" : "idBackUrl"]: url }
          : c
        )
      );
      toast.success(`Guest ${idx + 2} ID ${side} photo uploaded ✓`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setCompUploading(p => ({ ...p, [idx]: { ...(p[idx] ?? { front: false, back: false }), [side]: false } }));
    }
  }

  // ── Companion list helpers ─────────────────────────────────────────────────

  function addCompanion() {
    if (companions.length >= noOfPersons - 1) {
      toast.error(`Max ${noOfPersons - 1} companion${noOfPersons - 1 !== 1 ? "s" : ""} for this booking`);
      return;
    }
    setCompanions(p => [...p, blankCompanion()]);
  }

  function updateCompanion(i: number, field: keyof CompanionData, val: string) {
    setCompanions(p => p.map((c, idx) => idx === i ? { ...c, [field]: val } : c));
  }

  function removeCompanion(i: number) {
    if (noOfPersons > 1 && companions.length <= 1) {
      toast.error("At least 1 companion is required for this group booking");
      return;
    }
    setCompanions(p => p.filter((_, idx) => idx !== i));
    setCompUploading(p => {
      const next = { ...p };
      delete next[i];
      return next;
    });
  }

  // ── Pre-fill from an existing (returning) guest ────────────────────────────
  function fillPrimaryFromGuest(g: GuestResult) {
    if (g.name) setPrimaryName(g.name);
    if (g.idType) setIdType(g.idType as IdType);
    setIdNumber(g.idNumber ?? "");
    setIdFrontUrl(g.idFrontUrl ?? "");
    setIdBackUrl(g.idBackUrl ?? "");
    toast.success(`Loaded ID from ${g.name}`);
  }

  function fillCompanionFromGuest(i: number, g: GuestResult) {
    setCompanions(prev =>
      prev.map((c, idx) =>
        idx === i
          ? {
              ...c,
              name: g.name,
              phone: g.phone ?? c.phone,
              email: g.email ?? c.email,
              idType: g.idType ?? "AADHAR",
              idNumber: g.idNumber ?? "",
              idFrontUrl: g.idFrontUrl ?? "",
              idBackUrl: g.idBackUrl ?? "",
            }
          : c
      )
    );
    toast.success(`Loaded ${g.name}`);
  }

  async function sendDepositLink() {
    setSendingLink(true);
    try {
      const res = await fetch(`/api/hotel-admin/bookings/${bookingId}/deposit-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(depositAmount) || REFUNDABLE_DEPOSIT }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Could not send the deposit link"); return; }
      setLinkUrl(data.url ?? null);
      if (data.delivered) toast.success(data.message);
      else toast.warning(data.message);
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setSendingLink(false);
    }
  }

  /** Confirm payment on demand, so the desk never waits on the webhook. */
  async function checkDepositPaid() {
    setCheckingPaid(true);
    try {
      const res = await fetch(`/api/hotel-admin/bookings/${bookingId}/deposit-link`);
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Could not check payment"); return; }
      if (data.paid) {
        setDepositPaid(true);
        setDepositAmount(String(data.amount));
        setDepositMode("ONLINE");
        toast.success(data.message);
      } else {
        toast.info("Not paid yet — ask the guest to complete the link.");
      }
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setCheckingPaid(false);
    }
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Primary guest
    if (!primaryName.trim()) { toast.error("Primary guest name is required"); return; }
    if (!idNumber.trim())   { toast.error("Primary guest ID number is required"); return; }
    if (!idFrontUrl)        { toast.error("Primary guest ID front photo is required"); return; }
    if (!idBackUrl)         { toast.error("Primary guest ID back photo is required"); return; }
    if (!comingFrom.trim()) { toast.error("Please enter where the guest is coming from"); return; }
    if (!goingTo.trim())    { toast.error("Please enter where the guest is going after the stay"); return; }
    if (!purpose)           { toast.error("Please select the purpose of visit"); return; }

    // Companions
    if (noOfPersons > 1) {
      const withData = companions.filter(c => c.name.trim());
      if (withData.length < 1) {
        toast.error("Please fill in at least 1 companion's details");
        return;
      }
      for (let i = 0; i < companions.length; i++) {
        const c = companions[i];
        if (!c.name.trim()) continue;
        if (!c.idNumber.trim()) { toast.error(`Please enter ID number for Guest ${i + 2}`); return; }
        if (!c.idFrontUrl)     { toast.error(`Please upload ID front photo for Guest ${i + 2}`); return; }
        if (!c.idBackUrl)      { toast.error(`Please upload ID back photo for Guest ${i + 2}`); return; }
      }
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/hotel-admin/bookings/${bookingId}/counter-checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: primaryName.trim(),
          idType, idNumber: idNumber.trim(), idFrontUrl, idBackUrl,
          comingFrom: comingFrom.trim(), goingTo: goingTo.trim(),
          purpose, vehicleNo: vehicleNo.trim() || undefined,
          depositCollected: collectDeposit ? Number(depositAmount) || 0 : 0,
          depositMode,
          companions: companions.filter(c => c.name.trim()),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(data.message ?? "Registration saved");
        onClose();
        router.refresh();
      } else {
        toast.error(data.error ?? "Check-in failed");
      }
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}>
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl"
        style={{
          background: "linear-gradient(160deg, rgba(10,24,12,0.98) 0%, rgba(7,18,9,0.99) 100%)",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.12)",
        }}
      >
        {/* Amber top highlight */}
        <div className="absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent rounded-full pointer-events-none" />

        {/* ── Sticky header ───────────────────────────────────────────────── */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-white/8"
          style={{ background: "rgba(7,18,9,0.95)", backdropFilter: "blur(12px)" }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)" }}>
              <LogIn className="w-4 h-4 text-green-400" />
            </div>
            <div>
              <p className="font-bold text-white text-sm">Counter Check-in</p>
              <p className="text-[11px] text-white/35">
                {guestName} · <span className="font-mono">{bookingRef}</span>
                {noOfPersons > 1 && <span className="text-amber-400/70 ml-1">· {noOfPersons} guests</span>}
              </p>
            </div>
          </div>
          <button onClick={onClose} disabled={loading}
            className="text-white/25 hover:text-white/60 transition-colors p-1.5 rounded-xl hover:bg-white/5">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Notices ─────────────────────────────────────────────────────── */}
        <div className="px-6 pt-5 space-y-3">
          {existingData?.comingFrom ? (
            <div className="flex items-start gap-3 bg-green-500/8 border border-green-500/20 rounded-2xl px-4 py-3">
              <ShieldCheck className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
              <p className="text-green-300 text-xs leading-relaxed">
                <span className="font-bold">Online check-in done</span> — details pre-filled. Verify original ID document before confirming.
              </p>
            </div>
          ) : existingData?.idFrontUrl ? (
            <div className="flex items-start gap-3 bg-blue-500/8 border border-blue-500/20 rounded-2xl px-4 py-3">
              <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-blue-300 text-xs leading-relaxed">
                <span className="font-bold">ID already on file</span> — pre-filled from the guest profile. Just add travel details. Verify against the original before confirming.
              </p>
            </div>
          ) : null}
          {noOfPersons > 1 && (
            <div className="flex items-start gap-3 bg-amber-500/8 border border-amber-500/20 rounded-2xl px-4 py-3">
              <Users className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-amber-300 text-xs leading-relaxed">
                <span className="font-bold">Group booking ({noOfPersons} guests)</span> — ID proof with front &amp; back photos required for every person.
              </p>
            </div>
          )}
        </div>

        {/* ── Form ────────────────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          {/* Section 1 — Primary guest identity */}
          <div className="bg-white/3 border border-white/8 rounded-2xl p-5 space-y-4">
            <SectionHead
              icon={<CreditCard className="w-4 h-4" />}
              title="Primary Guest — Identity Proof"
              sub="Verify original document and upload photos"
            />
            <GuestSearch
              onSelect={fillPrimaryFromGuest}
              placeholder="Returning guest? Search by name, phone or ID to auto-fill…"
            />
            <div>
              <label className={reqLabelCls}>Full Name <Req /></label>
              <input value={primaryName} onChange={e => setPrimaryName(e.target.value)}
                placeholder="Guest's full name" className={reqInputCls} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={reqLabelCls}>{t("ci.idType")} <Req /></label>
                <select value={idType} onChange={e => setIdType(e.target.value as IdType)} className={selectCls}>
                  {ID_TYPES.map(t => <option key={t.value} value={t.value} className="bg-[#0D1B0E]">{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className={reqLabelCls}>{t("ci.idNumber")} <Req /></label>
                <input value={idNumber} onChange={e => setIdNumber(e.target.value)}
                  placeholder="Enter ID number" className={reqInputCls} />
              </div>
            </div>
            {/* Photo upload */}
            <div className="grid grid-cols-2 gap-3">
              <PhotoBox
                label="ID Front Photo" required
                url={idFrontUrl} uploading={uploadingFront}
                onFile={f => uploadPrimaryPhoto(f, "front")}
                onClear={() => setIdFrontUrl("")}
              />
              <PhotoBox
                label="ID Back Photo" required
                url={idBackUrl} uploading={uploadingBack}
                onFile={f => uploadPrimaryPhoto(f, "back")}
                onClear={() => setIdBackUrl("")}
              />
            </div>
          </div>

          {/* Section 2 — Travel details */}
          <div className="bg-white/3 border border-white/8 rounded-2xl p-5 space-y-4">
            <SectionHead
              icon={<MapPin className="w-4 h-4" />}
              title="Travel Details"
              sub="Required for hotel register"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <PlaceField label="Coming From" value={comingFrom} onChange={setComingFrom} />
              <PlaceField label="Going To (after stay)" value={goingTo} onChange={setGoingTo} />
              <div>
                <label className={reqLabelCls}>Purpose of Visit <Req /></label>
                <select value={purpose} onChange={e => setPurpose(e.target.value)} className={selectCls}>
                  <option value="" className="bg-[#0D1B0E]">Select purpose</option>
                  {PURPOSES.map(p => <option key={p} value={p} className="bg-[#0D1B0E]">{p}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>
                  Vehicle Number <span className="text-white/20 normal-case font-normal tracking-normal">(optional)</span>
                </label>
                <div className="relative">
                  <Car className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                  <input value={vehicleNo} onChange={e => setVehicleNo(e.target.value.toUpperCase())}
                    placeholder="CG04AB1234" className={`${inputCls} pl-10 uppercase`} />
                </div>
              </div>
            </div>
          </div>

          {/* Refundable deposit — editable, may be skipped */}
          <div className="rounded-2xl p-5 border bg-white/2 border-white/6 space-y-3">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="font-semibold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-green-400" /> Collect refundable deposit
              </span>
              <input type="checkbox" checked={collectDeposit} onChange={e => setCollectDeposit(e.target.checked)} className="accent-green-500 w-4 h-4" />
            </label>
            {collectDeposit ? (
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={labelCls}>Amount (₹)</label>
                  <input type="number" min={0} value={depositAmount} onChange={e => setDepositAmount(e.target.value)} className={inputCls} />
                </div>
                <div className="flex-1">
                  <label className={labelCls}>Mode</label>
                  <div className="flex gap-2">
                    {(["CASH", "ONLINE"] as const).map(m => (
                      <button type="button" key={m} onClick={() => setDepositMode(m)}
                        className={`flex-1 h-11 rounded-xl text-sm font-semibold border transition-all ${depositMode === m ? "bg-white/10 border-white/25 text-white" : "border-white/10 text-white/40 hover:text-white/70"}`}>
                        {m === "CASH" ? "Cash" : "UPI"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-white/35">No deposit will be collected — it can still be taken later.</p>
            )}

            {collectDeposit && (
              <div className="border-t border-white/8 pt-3 mt-1">
                <button type="button" onClick={sendDepositLink} disabled={sendingLink}
                  className="w-full flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-semibold border border-green-500/25 bg-green-500/10 text-green-300 hover:bg-green-500/20 transition-all disabled:opacity-50">
                  {sendingLink ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {sendingLink ? "Sending…" : linkUrl ? "Resend payment link" : "Send payment link on WhatsApp"}
                </button>

                {linkUrl && !depositPaid && (
                  <button type="button" onClick={checkDepositPaid} disabled={checkingPaid}
                    className="w-full flex items-center justify-center gap-2 h-10 mt-2 rounded-xl text-xs font-semibold border border-white/12 text-white/60 hover:text-white hover:border-white/25 transition-all disabled:opacity-50">
                    {checkingPaid ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                    {checkingPaid ? "Checking…" : "Check payment"}
                  </button>
                )}

                {depositPaid && (
                  <p className="flex items-center gap-1.5 text-xs text-green-300 mt-2 font-semibold">
                    <ShieldCheck className="w-3.5 h-3.5" /> Deposit received online — refundable instantly at checkout.
                  </p>
                )}
                <p className="text-[11px] text-white/30 mt-2 leading-relaxed">
                  Guest pays the deposit online, so at checkout it can be refunded
                  instantly to the same account instead of handing cash back.
                  {linkUrl && (
                    <>
                      {" "}Link:{" "}
                      <a href={linkUrl} target="_blank" rel="noopener noreferrer"
                        className="text-green-300 underline break-all">{linkUrl}</a>
                    </>
                  )}
                </p>
              </div>
            )}
          </div>

          {/* Section 3 — Companions */}
          <div className={`rounded-2xl p-5 border space-y-4 ${
            noOfPersons > 1 ? "bg-white/3 border-amber-500/20" : "bg-white/2 border-white/6"
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.2)" }}>
                  <Users className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <p className="font-semibold text-white text-sm">
                    Companion Details
                    {noOfPersons > 1 && <span className="text-amber-400 ml-1.5 text-xs font-bold">* required</span>}
                  </p>
                  <p className="text-xs text-white/30 mt-0.5">
                    {noOfPersons > 1
                      ? `ID + photos required for each companion (${noOfPersons - 1} max)`
                      : "Add accompanying guests (optional)"}
                  </p>
                </div>
              </div>
              {companions.length < Math.max(noOfPersons - 1, 0) && (
                <button type="button" onClick={addCompanion}
                  className="flex items-center gap-1.5 text-xs font-semibold text-white/55 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-xl transition-all">
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              )}
            </div>

            {companions.length === 0 ? (
              <p className="text-sm text-white/25 ml-11">No companions added.</p>
            ) : (
              <div className="space-y-4">
                {companions.map((c, i) => {
                  const isLast = noOfPersons > 1 && companions.length <= 1;
                  const cu = compUploading[i] ?? { front: false, back: false };
                  return (
                    <div key={i} className="bg-white/3 border border-white/8 rounded-xl p-4 space-y-3 relative">
                      {/* Remove */}
                      <button type="button" onClick={() => removeCompanion(i)} disabled={isLast}
                        title={isLast ? "At least 1 companion required" : "Remove"}
                        className={`absolute top-3 right-3 transition-colors ${isLast ? "text-white/10 cursor-not-allowed" : "text-white/20 hover:text-red-400"}`}>
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <p className="text-[11px] font-bold uppercase tracking-wider"
                        style={{ color: i === 0 && noOfPersons > 1 ? "rgba(251,191,36,0.65)" : "rgba(255,255,255,0.25)" }}>
                        Guest {i + 2}
                        {i === 0 && noOfPersons > 1 && <span className="ml-1 text-amber-400/80">(required)</span>}
                      </p>

                      <GuestSearch
                        onSelect={(g) => fillCompanionFromGuest(i, g)}
                        placeholder="Returning companion? Search to auto-fill…"
                      />

                      {/* Name + relation */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={i === 0 && noOfPersons > 1 ? reqLabelCls : labelCls}>
                            Full Name {i === 0 && noOfPersons > 1 && <Req />}
                          </label>
                          <input value={c.name} onChange={e => updateCompanion(i, "name", e.target.value)}
                            placeholder="Full name"
                            className={i === 0 && noOfPersons > 1 ? reqInputCls : inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>{t("ci.relation")}</label>
                          <input value={c.relation} onChange={e => updateCompanion(i, "relation", e.target.value)}
                            placeholder="Spouse, Friend…" className={inputCls} />
                        </div>
                      </div>

                      {/* Phone + email — optional, but saved to the guest's profile
                          so this companion is searchable & auto-fills next visit. */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelCls}>Phone <span className="text-white/30 normal-case font-normal">(optional)</span></label>
                          <input value={c.phone} onChange={e => updateCompanion(i, "phone", e.target.value)}
                            inputMode="tel" placeholder="10-digit mobile" className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Email <span className="text-white/30 normal-case font-normal">(optional)</span></label>
                          <input value={c.email} onChange={e => updateCompanion(i, "email", e.target.value)}
                            inputMode="email" placeholder="name@example.com" className={inputCls} />
                        </div>
                      </div>

                      {/* ID type + number */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={reqLabelCls}>{t("ci.idType")} <Req /></label>
                          <select value={c.idType} onChange={e => updateCompanion(i, "idType", e.target.value)} className={selectCls}>
                            {ID_TYPES.map(t => <option key={t.value} value={t.value} className="bg-[#0D1B0E]">{t.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className={reqLabelCls}>{t("ci.idNumber")} <Req /></label>
                          <input value={c.idNumber} onChange={e => updateCompanion(i, "idNumber", e.target.value)}
                            placeholder="ID number" className={reqInputCls} />
                        </div>
                      </div>

                      {/* ID photos */}
                      <div className="grid grid-cols-2 gap-3">
                        <PhotoBox
                          label="ID Front Photo" required
                          url={c.idFrontUrl} uploading={cu.front}
                          onFile={f => uploadCompanionPhoto(f, "front", i)}
                          onClear={() => updateCompanion(i, "idFrontUrl", "")}
                        />
                        <PhotoBox
                          label="ID Back Photo" required
                          url={c.idBackUrl} uploading={cu.back}
                          onFile={f => uploadCompanionPhoto(f, "back", i)}
                          onClear={() => updateCompanion(i, "idBackUrl", "")}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Submit row */}
          <div className="flex items-center gap-3 pt-1">
            <button type="button" onClick={onClose} disabled={loading}
              className="flex-1 py-3 rounded-xl text-sm font-semibold text-white/45 hover:text-white/70 bg-white/4 hover:bg-white/8 border border-white/8 transition-all disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-[2] flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white bg-green-600 hover:bg-green-500 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 shadow-lg shadow-green-600/20">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Checking In…</> : <><LogIn className="w-4 h-4" /> Complete Check-in</>}
            </button>
          </div>

          <p className="text-center text-[10px] text-white/20">
            Fields marked <span className="text-amber-400">*</span> are required. Guest data is stored securely.
          </p>
        </form>
      </div>
    </div>
  );
}
