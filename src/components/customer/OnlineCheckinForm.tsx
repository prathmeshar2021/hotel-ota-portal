"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2, Plus, Trash2, Upload, CheckCircle, CreditCard,
  MapPin, Car, Users, Clock, ShieldCheck, X,
} from "lucide-react";

type IdType = "AADHAR" | "DRIVING_LICENSE" | "PASSPORT" | "VOTER_ID" | "OTHER";

interface Companion {
  name: string;
  relation: string;
  idType: string;
  idNumber: string;
  idFrontUrl: string;
  idBackUrl: string;
}

interface Props {
  bookingRef: string;
  noOfPersons: number;
  checkInDate: string;   // ISO date string — for time context label
  checkOutDate: string;
  existingData?: {
    idType?: IdType | null;
    idNumber?: string | null;
    idFrontUrl?: string | null;
    idBackUrl?: string | null;
    comingFrom?: string | null;
    goingTo?: string | null;
    purpose?: string | null;
    vehicleNo?: string | null;
    expectedCheckInTime?: string | null;
    expectedCheckOutTime?: string | null;
    companions?: Companion[];
  };
}

const ID_TYPES = [
  { value: "AADHAR", label: "Aadhar Card" },
  { value: "DRIVING_LICENSE", label: "Driving License" },
  { value: "PASSPORT", label: "Passport" },
  { value: "VOTER_ID", label: "Voter ID" },
  { value: "OTHER", label: "Other ID" },
];

// 30-min slots 06:00 → 23:30
function generateTimeSlots(start = 6, end = 23) {
  const slots: string[] = [];
  for (let h = start; h <= end; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
    if (h < end) slots.push(`${String(h).padStart(2, "0")}:30`);
  }
  return slots;
}
const CHECKIN_SLOTS = generateTimeSlots(6, 23);
const CHECKOUT_SLOTS = generateTimeSlots(6, 14); // checkout usually morning

function fmt24(t: string) {
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

const inputCls =
  "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/40 focus:bg-white/8 transition-all";
const reqInputCls =
  "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/60 focus:bg-white/8 transition-all";
const labelCls = "block text-xs font-semibold text-white/45 uppercase tracking-wider mb-2";
const reqLabelCls = "block text-xs font-semibold text-white/70 uppercase tracking-wider mb-2";
const selectCls =
  "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-amber-400/40 transition-all appearance-none cursor-pointer";

function SectionBadge({ n }: { n: number }) {
  return (
    <span className="w-7 h-7 rounded-full bg-amber-500 text-black text-xs font-bold flex items-center justify-center shrink-0">
      {n}
    </span>
  );
}

function RequiredBadge() {
  return <span className="text-amber-400 ml-0.5">*</span>;
}

export default function OnlineCheckinForm({ bookingRef, noOfPersons, checkInDate, checkOutDate, existingData }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Per-companion upload state: { [index]: { front: bool, back: bool } }
  const [compUploading, setCompUploading] = useState<Record<number, { front: boolean; back: boolean }>>({});

  // Identity
  const [idType, setIdType] = useState<IdType>(existingData?.idType ?? "AADHAR");
  const [idNumber, setIdNumber] = useState(existingData?.idNumber ?? "");
  const [idFrontUrl, setIdFrontUrl] = useState(existingData?.idFrontUrl ?? "");
  const [idBackUrl, setIdBackUrl] = useState(existingData?.idBackUrl ?? "");
  const [uploadingFront, setUploadingFront] = useState(false);
  const [uploadingBack, setUploadingBack] = useState(false);

  // Travel
  const [comingFrom, setComingFrom] = useState(existingData?.comingFrom ?? "");
  const [goingTo, setGoingTo] = useState(existingData?.goingTo ?? "");
  const [purpose, setPurpose] = useState(existingData?.purpose ?? "");
  const [vehicleNo, setVehicleNo] = useState(existingData?.vehicleNo ?? "");

  // Expected times
  const [expectedCheckInTime, setExpectedCheckInTime] = useState(existingData?.expectedCheckInTime ?? "");
  const [expectedCheckOutTime, setExpectedCheckOutTime] = useState(existingData?.expectedCheckOutTime ?? "");

  // Companions — pre-seed 1 blank companion when this is a group booking
  const [companions, setCompanions] = useState<Companion[]>(
    existingData?.companions?.length
      ? existingData.companions
      : noOfPersons > 1
      ? [{ name: "", relation: "", idType: "AADHAR", idNumber: "", idFrontUrl: "", idBackUrl: "" }]
      : []
  );

  // Whether photos were already saved on the guest profile
  const photosOnProfile = !!(existingData?.idFrontUrl && existingData?.idBackUrl);

  async function uploadImage(file: File, side: "front" | "back") {
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    if (!cloudName) { toast.error("Upload not configured. Contact hotel staff."); return; }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", "hotel_ota_uploads");
    formData.append("folder", "guest_ids");

    if (side === "front") setUploadingFront(true);
    else setUploadingBack(true);

    try {
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        { method: "POST", body: formData }
      );
      const data = await res.json();
      if (!res.ok || !data.secure_url) { toast.error("Upload failed. Try again."); return; }
      if (side === "front") setIdFrontUrl(data.secure_url);
      else setIdBackUrl(data.secure_url);
      toast.success(`ID ${side} photo uploaded ✓`);
    } catch {
      toast.error("Upload failed. Check your connection.");
    } finally {
      if (side === "front") setUploadingFront(false);
      else setUploadingBack(false);
    }
  }

  async function uploadCompanionImage(file: File, side: "front" | "back", idx: number) {
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    if (!cloudName) { toast.error("Upload not configured. Contact hotel staff."); return; }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", "hotel_ota_uploads");
    formData.append("folder", "guest_ids");

    setCompUploading(p => ({ ...p, [idx]: { ...(p[idx] ?? { front: false, back: false }), [side]: true } }));
    try {
      const res  = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok || !data.secure_url) { toast.error("Upload failed. Try again."); return; }
      const field = side === "front" ? "idFrontUrl" : "idBackUrl";
      setCompanions(prev => prev.map((c, i) => i === idx ? { ...c, [field]: data.secure_url } : c));
      toast.success(`Guest ${idx + 2} ID ${side} photo uploaded ✓`);
    } catch {
      toast.error("Upload failed. Check your connection.");
    } finally {
      setCompUploading(p => ({ ...p, [idx]: { ...(p[idx] ?? { front: false, back: false }), [side]: false } }));
    }
  }

  function addCompanion() {
    if (companions.length >= noOfPersons - 1) {
      toast.error(`Max ${noOfPersons - 1} additional guest${noOfPersons - 1 !== 1 ? "s" : ""} for this booking`);
      return;
    }
    setCompanions([...companions, { name: "", relation: "", idType: "AADHAR", idNumber: "", idFrontUrl: "", idBackUrl: "" }]);
  }

  function updateCompanion(i: number, field: keyof Companion, value: string) {
    setCompanions(companions.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)));
  }

  function removeCompanion(i: number) {
    if (noOfPersons > 1 && companions.length <= 1) {
      toast.error("At least 1 companion is required for this group booking");
      return;
    }
    setCompanions(companions.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Required field validation
    if (!idNumber.trim()) { toast.error("ID number is required"); return; }
    if (!idFrontUrl) { toast.error("Please upload the front photo of your ID"); return; }
    if (!idBackUrl) { toast.error("Please upload the back photo of your ID"); return; }
    if (!comingFrom.trim()) { toast.error("Please fill in where you are coming from"); return; }
    if (!goingTo.trim()) { toast.error("Please fill in where you are going after this stay"); return; }
    if (!purpose) { toast.error("Please select your purpose of visit"); return; }
    if (!expectedCheckInTime) { toast.error("Please select your expected check-in time"); return; }
    if (!expectedCheckOutTime) { toast.error("Please select your expected check-out time"); return; }

    // Group booking: require at least 1 companion with name + ID + photos
    if (noOfPersons > 1) {
      const valid = companions.filter(c => c.name.trim() && c.idNumber.trim() && c.idFrontUrl && c.idBackUrl);
      if (valid.length < 1) {
        toast.error("Please complete the first companion's details — name, ID number, and both ID photos are required");
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
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingRef,
          idType,
          idNumber: idNumber.trim(),
          idFrontUrl,
          idBackUrl,
          comingFrom: comingFrom.trim(),
          goingTo: goingTo.trim(),
          purpose,
          vehicleNo: vehicleNo.trim() || undefined,
          expectedCheckInTime,
          expectedCheckOutTime,
          companions: companions.filter(c => c.name.trim()),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success("Online check-in complete! See you at the resort.");
        router.refresh();
      } else {
        toast.error(data.error ?? "Something went wrong");
      }
    } finally {
      setLoading(false);
    }
  }

  const ciDate = new Date(checkInDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const coDate = new Date(checkOutDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* ── Section 1: Identity Proof ── */}
      <div className="bg-white/3 border border-white/8 rounded-3xl p-6">
        <div className="flex items-center gap-3 mb-2">
          <SectionBadge n={1} />
          <h2 className="font-semibold text-white text-base flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-white/40" />
            Identity Proof
          </h2>
        </div>
        <p className="text-white/30 text-xs mb-5 ml-10">As per Government ID — required for hotel records</p>

        {/* Saved on profile banner */}
        {photosOnProfile && (
          <div className="flex items-center gap-2 bg-green-500/8 border border-green-500/20 rounded-xl px-4 py-3 mb-4">
            <ShieldCheck className="w-4 h-4 text-green-400 shrink-0" />
            <p className="text-green-300 text-xs font-medium">
              ID photos saved on your profile — you can update them below if needed.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className={reqLabelCls}>ID Type <RequiredBadge /></label>
            <select value={idType} onChange={e => setIdType(e.target.value as IdType)} className={selectCls}>
              {ID_TYPES.map(t => (
                <option key={t.value} value={t.value} className="bg-[#0D1B0E]">{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={reqLabelCls}>ID Number <RequiredBadge /></label>
            <input
              value={idNumber}
              onChange={e => setIdNumber(e.target.value)}
              placeholder="Enter your ID number"
              className={reqInputCls}
            />
          </div>
        </div>

        {/* Photo upload */}
        <div className="grid grid-cols-2 gap-3">
          {(["front", "back"] as const).map(side => {
            const url = side === "front" ? idFrontUrl : idBackUrl;
            const uploading = side === "front" ? uploadingFront : uploadingBack;
            const setUrl = side === "front" ? setIdFrontUrl : setIdBackUrl;
            const isRequired = !photosOnProfile;
            return (
              <div key={side}>
                <label className={isRequired ? reqLabelCls : labelCls}>
                  ID {side === "front" ? "Front" : "Back"} Photo
                  {isRequired ? <RequiredBadge /> : <span className="text-white/25 normal-case font-normal ml-1">(update)</span>}
                </label>
                {url ? (
                  <div className="relative border border-white/15 rounded-xl overflow-hidden h-32 bg-white/3 group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`ID ${side}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setUrl("")}
                      className="absolute top-2 right-2 bg-black/70 border border-white/20 rounded-full p-1 opacity-0 group-hover:opacity-100 hover:bg-red-500/50 transition-all"
                    >
                      <X className="w-3.5 h-3.5 text-white" />
                    </button>
                    <label className="absolute inset-0 flex items-end justify-center pb-2 cursor-pointer opacity-0 group-hover:opacity-100 transition-all">
                      <span className="text-[10px] text-white/70 bg-black/60 px-2 py-0.5 rounded-full">tap to replace</span>
                      <input type="file" accept="image/*" className="hidden"
                        onChange={e => e.target.files?.[0] && uploadImage(e.target.files[0], side)} />
                    </label>
                  </div>
                ) : (
                  <label className={`flex flex-col items-center justify-center gap-1.5 border-2 border-dashed rounded-xl h-32 cursor-pointer transition-all ${
                    isRequired
                      ? "border-amber-400/30 hover:border-amber-400/60 hover:bg-amber-500/5"
                      : "border-white/10 hover:border-amber-400/30 hover:bg-amber-500/3"
                  }`}>
                    {uploading ? (
                      <>
                        <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
                        <span className="text-xs text-amber-300">Uploading…</span>
                      </>
                    ) : (
                      <>
                        <Upload className={`w-6 h-6 ${isRequired ? "text-amber-400/60" : "text-white/20"}`} />
                        <span className={`text-xs ${isRequired ? "text-amber-300/70 font-semibold" : "text-white/30"}`}>
                          {isRequired ? "Required — tap to upload" : "Tap to upload"}
                        </span>
                        <span className="text-[10px] text-white/20">JPG, PNG, HEIC</span>
                      </>
                    )}
                    <input type="file" accept="image/*" className="hidden" disabled={uploading}
                      onChange={e => e.target.files?.[0] && uploadImage(e.target.files[0], side)} />
                  </label>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Section 2: Travel Details ── */}
      <div className="bg-white/3 border border-white/8 rounded-3xl p-6">
        <div className="flex items-center gap-3 mb-2">
          <SectionBadge n={2} />
          <h2 className="font-semibold text-white text-base flex items-center gap-2">
            <MapPin className="w-4 h-4 text-white/40" />
            Travel Details
          </h2>
        </div>
        <p className="text-white/30 text-xs mb-5 ml-10">Required for hotel records</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={reqLabelCls}>Coming From <RequiredBadge /></label>
            <input
              value={comingFrom}
              onChange={e => setComingFrom(e.target.value)}
              placeholder="City / Town / Address"
              className={reqInputCls}
            />
          </div>
          <div>
            <label className={reqLabelCls}>Going To (after this stay) <RequiredBadge /></label>
            <input
              value={goingTo}
              onChange={e => setGoingTo(e.target.value)}
              placeholder="City / Town / Address"
              className={reqInputCls}
            />
          </div>
          <div>
            <label className={reqLabelCls}>Purpose of Visit <RequiredBadge /></label>
            <select value={purpose} onChange={e => setPurpose(e.target.value)} className={selectCls}>
              <option value="" className="bg-[#0D1B0E]">Select purpose</option>
              {["Leisure / Tourism", "Business", "Family Visit", "Medical", "Education", "Other"].map(p => (
                <option key={p} value={p} className="bg-[#0D1B0E]">{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>
              Vehicle Number{" "}
              <span className="text-white/20 normal-case font-normal tracking-normal">(optional)</span>
            </label>
            <div className="relative">
              <Car className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
              <input
                value={vehicleNo}
                onChange={e => setVehicleNo(e.target.value.toUpperCase())}
                placeholder="CG04AB1234"
                className={`${inputCls} pl-10 uppercase`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 3: Expected Arrival & Departure ── */}
      <div className="bg-white/3 border border-white/8 rounded-3xl p-6">
        <div className="flex items-center gap-3 mb-2">
          <SectionBadge n={3} />
          <h2 className="font-semibold text-white text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-white/40" />
            Expected Arrival &amp; Departure
          </h2>
        </div>
        <p className="text-white/30 text-xs mb-5 ml-10">Helps the hotel prepare your room on time</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={reqLabelCls}>
              Expected Check-in Time <RequiredBadge />
              <span className="text-white/30 normal-case font-normal ml-1">({ciDate})</span>
            </label>
            <select value={expectedCheckInTime} onChange={e => setExpectedCheckInTime(e.target.value)} className={selectCls}>
              <option value="" className="bg-[#0D1B0E]">Select arrival time</option>
              {CHECKIN_SLOTS.map(t => (
                <option key={t} value={t} className="bg-[#0D1B0E]">{fmt24(t)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={reqLabelCls}>
              Expected Check-out Time <RequiredBadge />
              <span className="text-white/30 normal-case font-normal ml-1">({coDate})</span>
            </label>
            <select value={expectedCheckOutTime} onChange={e => setExpectedCheckOutTime(e.target.value)} className={selectCls}>
              <option value="" className="bg-[#0D1B0E]">Select departure time</option>
              {CHECKOUT_SLOTS.map(t => (
                <option key={t} value={t} className="bg-[#0D1B0E]">{fmt24(t)}</option>
              ))}
              <option value="14:00" className="bg-[#0D1B0E]">02:00 PM (Standard)</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Section 4: Companions ── */}
      {noOfPersons > 1 && (
        <div className="bg-white/3 border border-amber-500/15 rounded-3xl p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <SectionBadge n={4} />
              <h2 className="font-semibold text-white text-base flex items-center gap-2">
                <Users className="w-4 h-4 text-white/40" />
                Companion Details
                <RequiredBadge />
              </h2>
            </div>
            <button
              type="button"
              onClick={addCompanion}
              className="flex items-center gap-1.5 text-xs font-semibold text-white/60 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-xl transition-all"
            >
              <Plus className="w-3.5 h-3.5" /> Add Guest
            </button>
          </div>

          {/* Required notice */}
          <div className="ml-10 mb-4">
            <p className="text-xs text-amber-400/70">
              Group booking — at least 1 companion's name, ID number, and ID photos are required.
            </p>
          </div>

          <div className="space-y-4">
            {companions.map((c, i) => {
              const isLastRequired = noOfPersons > 1 && companions.length <= 1;
              const cu = compUploading[i] ?? { front: false, back: false };
              return (
                <div key={i} className="bg-white/3 border border-white/8 rounded-2xl p-4 space-y-3 relative">
                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={() => removeCompanion(i)}
                    disabled={isLastRequired}
                    className={`absolute top-3 right-3 transition-colors ${
                      isLastRequired ? "text-white/10 cursor-not-allowed" : "text-white/20 hover:text-red-400"
                    }`}
                    title={isLastRequired ? "At least 1 companion required" : "Remove companion"}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <p className="text-xs font-bold text-amber-400/50 uppercase tracking-wider">
                    Guest {i + 2}
                    {i === 0 && <span className="text-amber-400/80 ml-1">(required)</span>}
                  </p>

                  {/* Name + Relation */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={reqLabelCls}>Name <RequiredBadge /></label>
                      <input value={c.name} onChange={e => updateCompanion(i, "name", e.target.value)}
                        placeholder="Full name" className={reqInputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Relation</label>
                      <input value={c.relation} onChange={e => updateCompanion(i, "relation", e.target.value)}
                        placeholder="Spouse, Friend…" className={inputCls} />
                    </div>
                  </div>

                  {/* ID type + number */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={reqLabelCls}>ID Type <RequiredBadge /></label>
                      <select value={c.idType} onChange={e => updateCompanion(i, "idType", e.target.value)} className={selectCls}>
                        {ID_TYPES.map(t => <option key={t.value} value={t.value} className="bg-[#0D1B0E]">{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={reqLabelCls}>ID Number <RequiredBadge /></label>
                      <input value={c.idNumber} onChange={e => updateCompanion(i, "idNumber", e.target.value)}
                        placeholder="ID number" className={reqInputCls} />
                    </div>
                  </div>

                  {/* ID Photos */}
                  <div className="grid grid-cols-2 gap-3">
                    {(["front", "back"] as const).map(side => {
                      const url       = side === "front" ? c.idFrontUrl : c.idBackUrl;
                      const uploading = side === "front" ? cu.front : cu.back;
                      const field     = side === "front" ? "idFrontUrl" : "idBackUrl";
                      return (
                        <div key={side}>
                          <label className={reqLabelCls}>
                            ID {side === "front" ? "Front" : "Back"} Photo <RequiredBadge />
                          </label>
                          {url ? (
                            <div className="relative border border-white/15 rounded-xl overflow-hidden h-28 bg-white/3 group">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt={`ID ${side}`} className="w-full h-full object-cover" />
                              <button type="button"
                                onClick={() => updateCompanion(i, field as keyof Companion, "")}
                                className="absolute top-2 right-2 bg-black/70 border border-white/20 rounded-full p-1 opacity-0 group-hover:opacity-100 hover:bg-red-500/50 transition-all">
                                <X className="w-3.5 h-3.5 text-white" />
                              </button>
                              <label className="absolute inset-0 flex items-end justify-center pb-2 cursor-pointer opacity-0 group-hover:opacity-100 transition-all">
                                <span className="text-[10px] text-white/70 bg-black/60 px-2 py-0.5 rounded-full">tap to replace</span>
                                <input type="file" accept="image/*" className="hidden"
                                  onChange={e => e.target.files?.[0] && uploadCompanionImage(e.target.files[0], side, i)} />
                              </label>
                            </div>
                          ) : (
                            <label className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-amber-400/30 hover:border-amber-400/60 hover:bg-amber-500/4 rounded-xl h-28 cursor-pointer transition-all">
                              {uploading ? (
                                <>
                                  <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
                                  <span className="text-xs text-amber-300">Uploading…</span>
                                </>
                              ) : (
                                <>
                                  <Upload className="w-5 h-5 text-amber-400/60" />
                                  <span className="text-xs text-amber-300/70 font-semibold">Required — tap to upload</span>
                                  <span className="text-[10px] text-white/20">JPG · PNG · HEIC</span>
                                </>
                              )}
                              <input type="file" accept="image/*" className="hidden" disabled={uploading}
                                onChange={e => e.target.files?.[0] && uploadCompanionImage(e.target.files[0], side, i)} />
                            </label>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Submit ── */}
      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 font-bold py-4 rounded-2xl text-base transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 bg-amber-500 text-black shadow-xl shadow-amber-500/20"
      >
        {loading ? (
          <><Loader2 className="w-5 h-5 animate-spin" /> Saving details…</>
        ) : (
          <><CheckCircle className="w-5 h-5" /> Complete Online Check-in</>
        )}
      </button>

      <p className="text-center text-xs text-white/25">
        Fields marked <span className="text-amber-400 font-bold">*</span> are required.
        Your data is encrypted and shared only with the hotel.
      </p>
    </form>
  );
}
