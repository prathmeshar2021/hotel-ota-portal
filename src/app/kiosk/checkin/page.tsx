"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Camera, Check, Loader2, User, Users, Calendar, BedDouble, CheckCircle2 } from "lucide-react";
import { getKioskToken, kioskFetch } from "@/lib/kiosk/client";
import { useKioskCopy } from "@/lib/kiosk/KioskShell";
import { uploadIdPhoto } from "@/lib/kiosk/upload";
import { KioskStep, NumericKeypad, AlphaKeyboard, DisplayField } from "@/components/kiosk/KioskUI";

type StepId = "find" | "verify" | "confirm" | "guest" | "idphoto" | "companions" | "trip" | "done";

const ID_TYPES = [
  { value: "AADHAR", label: "Aadhaar" },
  { value: "DRIVING_LICENSE", label: "Driving License" },
  { value: "PASSPORT", label: "Passport" },
  { value: "VOTER_ID", label: "Voter ID" },
  { value: "OTHER", label: "Other" },
] as const;

const CITY_CHIPS = ["Raipur", "Durg", "Bhilai", "Bilaspur"];
const PURPOSE_CHIPS = ["Leisure", "Business", "Family", "Transit"];

interface Companion { name: string; idNumber: string; idFrontUrl: string; idBackUrl: string; }
interface VerifiedBooking {
  guestName: string; guestPhone: string; guests: number; nights: number;
  category: string; checkIn: string; checkOut: string; alreadyCheckedIn: boolean;
}

export default function KioskCheckinWizard() {
  const router = useRouter();
  const { t } = useKioskCopy();

  const [step, setStep] = useState<StepId>("find");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // identification
  const [ref, setRef] = useState("");
  const [lookupToken, setLookupToken] = useState("");
  const [last4, setLast4] = useState("");
  const [booking, setBooking] = useState<VerifiedBooking | null>(null);

  // primary guest
  const [idType, setIdType] = useState<string>("AADHAR");
  const [idNumber, setIdNumber] = useState("");
  const [idFrontUrl, setIdFrontUrl] = useState("");
  const [idBackUrl, setIdBackUrl] = useState("");

  // companions (group bookings)
  const [companions, setCompanions] = useState<Companion[]>([]);

  // trip
  const [comingFrom, setComingFrom] = useState("");
  const [goingTo, setGoingTo] = useState("");
  const [purpose, setPurpose] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");

  const [resultRef, setResultRef] = useState("");

  // Guard: must be paired.
  useEffect(() => { if (!getKioskToken()) router.replace("/kiosk/pair"); }, [router]);

  // Dynamic step order (companions only for group bookings).
  const steps = useMemo<StepId[]>(() => {
    const base: StepId[] = ["find", "verify", "confirm", "guest", "idphoto"];
    if (booking && booking.guests > 1) base.push("companions");
    base.push("trip");
    return base;
  }, [booking]);

  const stepIndex = steps.indexOf(step);
  const clear = () => setError("");

  function goBack() {
    clear();
    if (stepIndex <= 0) { router.replace("/kiosk"); return; }
    setStep(steps[stepIndex - 1]);
  }
  function goNext() {
    clear();
    if (stepIndex < steps.length - 1) setStep(steps[stepIndex + 1]);
  }

  // ── Step actions ───────────────────────────────────────────────────────────
  async function doLookup() {
    setBusy(true); clear();
    try {
      const res = await kioskFetch("/api/kiosk/lookup", {
        method: "POST", body: JSON.stringify({ bookingRef: ref.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.found) { setError(t("noBookingFound")); return; }
      setLookupToken(data.lookupToken);
      goNext();
    } catch { setError(t("askAtDesk")); }
    finally { setBusy(false); }
  }

  async function doVerify() {
    setBusy(true); clear();
    try {
      const res = await kioskFetch("/api/kiosk/verify", {
        method: "POST", body: JSON.stringify({ lookupToken, code: last4 }),
      });
      const data = await res.json();
      if (!res.ok || !data.verified) { setError(data.error ?? t("askAtDesk")); return; }
      setBooking(data.booking);
      const n = data.booking.guests as number;
      setCompanions(Array.from({ length: Math.max(0, n - 1) }, () => ({ name: "", idNumber: "", idFrontUrl: "", idBackUrl: "" })));
      goNext();
    } catch { setError(t("askAtDesk")); }
    finally { setBusy(false); }
  }

  async function doSubmit() {
    setBusy(true); clear();
    try {
      const res = await kioskFetch("/api/kiosk/checkin", {
        method: "POST",
        body: JSON.stringify({
          lookupToken, idType, idNumber, idFrontUrl, idBackUrl,
          comingFrom, goingTo, purpose, vehicleNo: vehicleNo || undefined,
          expectedCheckInTime: "14:00", expectedCheckOutTime: "10:00",
          companions: booking && booking.guests > 1
            ? companions.filter((c) => c.name.trim()).map((c) => ({
                name: c.name, idType: "AADHAR", idNumber: c.idNumber,
                idFrontUrl: c.idFrontUrl, idBackUrl: c.idBackUrl,
              }))
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? t("askAtDesk")); return; }
      setResultRef(data.bookingRef ?? "");
      setStep("done");
      setTimeout(() => router.replace("/kiosk"), 20000); // auto-reset
    } catch { setError(t("askAtDesk")); }
    finally { setBusy(false); }
  }

  const total = steps.length;

  // ── Render ─────────────────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-6">
        <div className="w-24 h-24 rounded-full bg-green-500/15 border border-green-400/30 flex items-center justify-center mb-6">
          <CheckCircle2 className="w-12 h-12 text-green-400" />
        </div>
        <h1 className="text-4xl font-bold mb-3">{t("doneTitle")}</h1>
        <p className="text-white/55 text-xl mb-2">{t("doneSub")}</p>
        {resultRef && <p className="text-white/35">#{resultRef}</p>}
        <button onClick={() => router.replace("/kiosk")}
          className="mt-10 bg-amber-500 hover:bg-amber-400 text-black font-bold px-10 py-4 rounded-2xl text-lg">
          {t("finish")}
        </button>
      </div>
    );
  }

  const errBox = error && <p className="text-red-400 text-center text-lg mt-4">{error}</p>;

  switch (step) {
    case "find":
      return (
        <KioskStep totalSteps={total} currentStep={0}
          title={t("findTitle")} subtitle={t("findSub")}
          onBack={goBack} backLabel={t("back")}
          onNext={doLookup} nextLabel={t("next")} nextDisabled={ref.trim().length < 3} busy={busy}>
          <DisplayField value={ref} placeholder={t("bookingNumber")} />
          <AlphaKeyboard onKey={(k) => setRef((r) => (r.length < 24 ? r + k : r))} onDelete={() => setRef((r) => r.slice(0, -1))} />
          {errBox}
        </KioskStep>
      );

    case "verify":
      return (
        <KioskStep totalSteps={total} currentStep={1}
          title={t("verifyTitle")} subtitle={t("verifySub")}
          onBack={goBack} backLabel={t("back")}
          onNext={doVerify} nextLabel={t("next")} nextDisabled={last4.length !== 4} busy={busy}>
          <DisplayField value={last4.replace(/./g, "•")} placeholder="••••" />
          <NumericKeypad onDigit={(d) => setLast4((v) => (v.length < 4 ? v + d : v))} onDelete={() => setLast4((v) => v.slice(0, -1))} />
          {errBox}
        </KioskStep>
      );

    case "confirm":
      if (!booking) return null;
      if (booking.alreadyCheckedIn) {
        return (
          <KioskStep totalSteps={total} currentStep={2} title={t("confirmTitle")}
            onBack={() => router.replace("/kiosk")} backLabel={t("back")}>
            <div className="bg-amber-500/10 border border-amber-400/25 rounded-2xl p-6 text-center text-lg text-amber-200">
              {t("alreadyCheckedInMsg")}
            </div>
          </KioskStep>
        );
      }
      return (
        <KioskStep totalSteps={total} currentStep={2} title={t("confirmTitle")}
          onBack={goBack} backLabel={t("back")}
          onNext={goNext} nextLabel={t("yesThatsMe")}>
          <div className="bg-white/5 border border-white/12 rounded-3xl p-6 space-y-4 max-w-md mx-auto">
            <Row icon={<User className="w-5 h-5" />} label={t("fullName")} value={booking.guestName} big />
            <Row icon={<BedDouble className="w-5 h-5" />} label={t("room")} value={booking.category} />
            <Row icon={<Calendar className="w-5 h-5" />} label="" value={`${booking.checkIn} → ${booking.checkOut}`} />
            <Row icon={<Users className="w-5 h-5" />} label={t("guests")} value={`${booking.guests} · ${booking.nights} ${t("nights")}`} />
          </div>
          {errBox}
        </KioskStep>
      );

    case "guest":
      return (
        <KioskStep totalSteps={total} currentStep={3}
          title={t("guestTitle")} subtitle={t("guestSub")}
          onBack={goBack} backLabel={t("back")}
          onNext={goNext} nextLabel={t("next")} nextDisabled={idNumber.trim().length < 4}>
          <div className="max-w-md mx-auto space-y-6">
            <div>
              <p className="text-white/50 mb-2">{t("idTypeLabel")}</p>
              <div className="grid grid-cols-2 gap-2">
                {ID_TYPES.map((it) => (
                  <button key={it.value} onClick={() => setIdType(it.value)}
                    className={`h-14 rounded-xl border text-base font-semibold transition-colors ${
                      idType === it.value ? "bg-amber-500 text-black border-amber-400" : "bg-white/5 border-white/12 text-white/80"
                    }`}>
                    {it.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-white/50 mb-2">{t("idNumberLabel")}</p>
              <input
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value.toUpperCase())}
                inputMode="text"
                autoCapitalize="characters"
                placeholder="XXXX XXXX XXXX"
                className="w-full h-16 rounded-2xl bg-white/5 border border-white/12 px-5 text-xl font-bold tracking-wide focus:outline-none focus:border-amber-400/50 [color-scheme:dark]"
              />
            </div>
          </div>
          {errBox}
        </KioskStep>
      );

    case "idphoto":
      return (
        <KioskStep totalSteps={total} currentStep={4}
          title={t("idPhotoTitle")} subtitle={t("idPhotoSub")}
          onBack={goBack} backLabel={t("back")}
          onNext={goNext} nextLabel={t("next")} nextDisabled={!idFrontUrl || !idBackUrl}>
          <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
            <PhotoCapture label={t("idFront")} url={idFrontUrl} onUrl={setIdFrontUrl} retakeLabel={t("retake")} takeLabel={t("takePhoto")} />
            <PhotoCapture label={t("idBack")} url={idBackUrl} onUrl={setIdBackUrl} retakeLabel={t("retake")} takeLabel={t("takePhoto")} />
          </div>
          {errBox}
        </KioskStep>
      );

    case "companions": {
      const allComplete = companions.every((c) => c.name.trim() && c.idNumber.trim() && c.idFrontUrl && c.idBackUrl);
      return (
        <KioskStep totalSteps={total} currentStep={5}
          title={t("companionsTitle")} subtitle={t("companionsSub")}
          onBack={goBack} backLabel={t("back")}
          onNext={goNext} nextLabel={t("next")} nextDisabled={!allComplete}>
          <div className="space-y-4 max-w-md mx-auto">
            {companions.map((c, i) => (
              <div key={i} className="bg-white/5 border border-white/12 rounded-2xl p-4 space-y-3">
                <p className="font-bold text-white/70">{t("addGuest")} {i + 2}</p>
                <input value={c.name} placeholder={t("fullName")}
                  onChange={(e) => setCompanions((prev) => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                  className="w-full h-14 rounded-xl bg-white/5 border border-white/12 px-4 text-lg focus:outline-none focus:border-amber-400/50 [color-scheme:dark]" />
                <input value={c.idNumber} placeholder={t("idNumberLabel")} autoCapitalize="characters"
                  onChange={(e) => setCompanions((prev) => prev.map((x, j) => j === i ? { ...x, idNumber: e.target.value.toUpperCase() } : x))}
                  className="w-full h-14 rounded-xl bg-white/5 border border-white/12 px-4 text-lg tracking-wide focus:outline-none focus:border-amber-400/50 [color-scheme:dark]" />
                <div className="grid grid-cols-2 gap-3">
                  <PhotoCapture label={t("idFront")} url={c.idFrontUrl} onUrl={(u) => setCompanions((prev) => prev.map((x, j) => j === i ? { ...x, idFrontUrl: u } : x))} retakeLabel={t("retake")} takeLabel={t("takePhoto")} small />
                  <PhotoCapture label={t("idBack")} url={c.idBackUrl} onUrl={(u) => setCompanions((prev) => prev.map((x, j) => j === i ? { ...x, idBackUrl: u } : x))} retakeLabel={t("retake")} takeLabel={t("takePhoto")} small />
                </div>
              </div>
            ))}
          </div>
          {errBox}
        </KioskStep>
      );
    }

    case "trip":
      return (
        <KioskStep totalSteps={total} currentStep={steps.indexOf("trip")}
          title={t("tripTitle")}
          onBack={goBack} backLabel={t("back")}
          onNext={doSubmit} nextLabel={t("reviewSubmit")} busy={busy}
          nextDisabled={!comingFrom.trim() || !goingTo.trim() || !purpose.trim()}>
          <div className="max-w-md mx-auto space-y-6">
            <ChipField label={t("comingFrom")} chips={CITY_CHIPS} value={comingFrom} onChange={setComingFrom} otherLabel={t("other")} />
            <ChipField label={t("goingTo")} chips={CITY_CHIPS} value={goingTo} onChange={setGoingTo} otherLabel={t("other")} />
            <ChipField label={t("purpose")} chips={PURPOSE_CHIPS} value={purpose} onChange={setPurpose} otherLabel={t("other")} />
            <div>
              <p className="text-white/50 mb-2">{t("vehicle")}</p>
              <input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value.toUpperCase())}
                placeholder="CG-07-XX-0000" autoCapitalize="characters"
                className="w-full h-14 rounded-xl bg-white/5 border border-white/12 px-4 text-lg tracking-wide focus:outline-none focus:border-amber-400/50 [color-scheme:dark]" />
            </div>
          </div>
          {errBox}
        </KioskStep>
      );

    default:
      return null;
  }
}

// ── Small components ──────────────────────────────────────────────────────────
function Row({ icon, label, value, big = false }: { icon: React.ReactNode; label: string; value: string; big?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-amber-400 shrink-0">{icon}</span>
      <div>
        {label && <p className="text-white/40 text-xs uppercase tracking-wide">{label}</p>}
        <p className={big ? "text-xl font-bold" : "text-white/85 font-semibold"}>{value}</p>
      </div>
    </div>
  );
}

function PhotoCapture({
  label, url, onUrl, retakeLabel, takeLabel, small = false,
}: {
  label: string; url: string; onUrl: (u: string) => void;
  retakeLabel: string; takeLabel: string; small?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setErr(false);
    try {
      onUrl(await uploadIdPhoto(file));
    } catch {
      setErr(true);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <p className="text-white/50 text-sm mb-1.5">{label}</p>
      <button
        onClick={() => inputRef.current?.click()}
        className={`relative w-full ${small ? "h-24" : "h-40"} rounded-2xl border-2 border-dashed flex flex-col items-center justify-center overflow-hidden transition-colors ${
          url ? "border-green-400/40 bg-green-500/5" : "border-white/20 bg-white/5 hover:border-amber-400/50"
        }`}
      >
        {uploading ? (
          <Loader2 className="w-7 h-7 animate-spin text-amber-400" />
        ) : url ? (
          <>
            <Image src={url} alt={label} fill sizes="200px" className="object-cover opacity-70" />
            <span className="relative z-10 flex items-center gap-1.5 bg-black/60 px-3 py-1.5 rounded-full text-sm font-semibold">
              <Check className="w-4 h-4 text-green-400" /> {retakeLabel}
            </span>
          </>
        ) : (
          <>
            <Camera className="w-7 h-7 text-white/40 mb-1" />
            <span className="text-white/50 text-sm">{takeLabel}</span>
          </>
        )}
      </button>
      {err && <p className="text-red-400 text-xs mt-1">Upload failed. Try again.</p>}
      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
    </div>
  );
}

function ChipField({
  label, chips, value, onChange, otherLabel,
}: { label: string; chips: string[]; value: string; onChange: (v: string) => void; otherLabel: string }) {
  const isOther = value !== "" && !chips.includes(value);
  return (
    <div>
      <p className="text-white/50 mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <button key={c} onClick={() => onChange(c)}
            className={`px-5 h-12 rounded-xl border font-semibold transition-colors ${
              value === c ? "bg-amber-500 text-black border-amber-400" : "bg-white/5 border-white/12 text-white/80"
            }`}>
            {c}
          </button>
        ))}
        <button onClick={() => onChange(isOther ? value : " ")}
          className={`px-5 h-12 rounded-xl border font-semibold transition-colors ${
            isOther ? "bg-amber-500 text-black border-amber-400" : "bg-white/5 border-white/12 text-white/80"
          }`}>
          {otherLabel}
        </button>
      </div>
      {isOther && (
        <input value={value.trim()} onChange={(e) => onChange(e.target.value)} autoFocus
          placeholder={label}
          className="w-full h-14 mt-2 rounded-xl bg-white/5 border border-white/12 px-4 text-lg focus:outline-none focus:border-amber-400/50 [color-scheme:dark]" />
      )}
    </div>
  );
}
