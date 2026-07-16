"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Loader2, Users, CheckCircle2, Check } from "lucide-react";
import { getKioskToken, kioskFetch } from "@/lib/kiosk/client";
import { useKioskCopy } from "@/lib/kiosk/KioskShell";
import { KioskStep, Stepper } from "@/components/kiosk/KioskUI";

type StepId = "room" | "stay" | "details" | "summary" | "done";

interface RoomOption {
  category: string; name: string; maxGuests: number;
  image: string | null; price: number; originalPrice: number; available: number;
}

export default function KioskWalkinWizard() {
  const router = useRouter();
  const { t } = useKioskCopy();

  const [step, setStep] = useState<StepId>("room");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [rooms, setRooms] = useState<RoomOption[] | null>(null);
  const [selected, setSelected] = useState<RoomOption | null>(null);
  const [nights, setNights] = useState(1);
  const [guests, setGuests] = useState(2);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const [result, setResult] = useState<{ bookingRef: string; totalAmount: number } | null>(null);

  // Guard + load availability.
  useEffect(() => {
    if (!getKioskToken()) { router.replace("/kiosk/pair"); return; }
    (async () => {
      try {
        const res = await kioskFetch("/api/kiosk/walkin", { method: "GET" });
        const data = await res.json();
        setRooms(data.categories ?? []);
      } catch { setRooms([]); }
    })();
  }, [router]);

  const steps: StepId[] = ["room", "stay", "details", "summary"];
  const idx = steps.indexOf(step);
  const total = steps.length;
  const clear = () => setError("");

  function back() {
    clear();
    if (idx <= 0) { router.replace("/kiosk"); return; }
    setStep(steps[idx - 1]);
  }
  function next() { clear(); if (idx < steps.length - 1) setStep(steps[idx + 1]); }

  function pickRoom(r: RoomOption) {
    if (r.available < 1) return;
    setSelected(r);
    setGuests(Math.min(2, r.maxGuests));
    setStep("stay");
  }

  async function submit() {
    if (!selected) return;
    setBusy(true); clear();
    try {
      const res = await kioskFetch("/api/kiosk/walkin", {
        method: "POST",
        body: JSON.stringify({ category: selected.category, guestName: name.trim(), guestPhone: phone, guests, nights }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? t("askAtDesk")); return; }
      setResult({ bookingRef: data.bookingRef, totalAmount: data.totalAmount });
      setStep("done");
      setTimeout(() => router.replace("/kiosk"), 25000);
    } catch { setError(t("askAtDesk")); }
    finally { setBusy(false); }
  }

  const estimate = useMemo(() => (selected ? selected.price * nights : 0), [selected, nights]);
  const errBox = error && <p className="text-red-400 text-center text-lg mt-4">{error}</p>;

  // ── Done ─────────────────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-6">
        <div className="w-24 h-24 rounded-full bg-green-500/15 border border-green-400/30 flex items-center justify-center mb-6">
          <CheckCircle2 className="w-12 h-12 text-green-400" />
        </div>
        <h1 className="text-4xl font-bold mb-3">{t("walkinDoneTitle")}</h1>
        <p className="text-white/55 text-xl mb-4">{t("walkinDoneSub")}</p>
        {result && (
          <div className="bg-white/5 border border-white/12 rounded-2xl px-8 py-4">
            <p className="text-white/40 text-sm">#{result.bookingRef}</p>
            <p className="text-3xl font-bold text-amber-400 mt-1">₹{result.totalAmount.toLocaleString("en-IN")}</p>
          </div>
        )}
        <button onClick={() => router.replace("/kiosk")}
          className="mt-10 bg-amber-500 hover:bg-amber-400 text-black font-bold px-10 py-4 rounded-2xl text-lg">
          {t("finish")}
        </button>
      </div>
    );
  }

  // ── Pick room ────────────────────────────────────────────────────────────
  if (step === "room") {
    return (
      <KioskStep totalSteps={total} currentStep={0}
        title={t("pickRoomTitle")} subtitle={t("pickRoomSub")}
        onBack={back} backLabel={t("back")}>
        {rooms === null ? (
          <div className="flex justify-center py-16"><Loader2 className="w-10 h-10 text-amber-400 animate-spin" /></div>
        ) : (
          <div className="space-y-3">
            {rooms.map((r) => {
              const sold = r.available < 1;
              return (
                <button key={r.category} onClick={() => pickRoom(r)} disabled={sold}
                  className={`w-full flex items-center gap-4 rounded-2xl border p-3 text-left transition-all ${
                    sold ? "opacity-40 border-white/8" : "border-white/12 hover:border-amber-400/40 active:scale-[0.99]"
                  }`}>
                  <div className="relative w-24 h-24 rounded-xl overflow-hidden shrink-0 bg-white/5">
                    {r.image && <Image src={r.image} alt={r.name} fill sizes="96px" className="object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-lg">{r.name}</p>
                    <p className="text-white/45 text-sm flex items-center gap-1.5"><Users className="w-4 h-4" /> {r.maxGuests}</p>
                    <p className={`text-sm font-semibold mt-1 ${sold ? "text-red-300" : "text-green-400"}`}>
                      {sold ? t("soldOut") : `${r.available} ${t("available")}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-2xl font-bold text-amber-400">₹{r.price.toLocaleString("en-IN")}</p>
                    <p className="text-white/35 text-xs">{t("perNight")}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {errBox}
      </KioskStep>
    );
  }

  // ── Nights & guests ──────────────────────────────────────────────────────
  if (step === "stay" && selected) {
    return (
      <KioskStep totalSteps={total} currentStep={1}
        title={t("stayTitle")} subtitle={selected.name}
        onBack={back} backLabel={t("back")} onNext={next} nextLabel={t("next")}>
        <div className="max-w-md mx-auto space-y-4">
          <Stepper label={t("nightsCount")} value={nights} min={1} max={14} onChange={setNights} />
          <Stepper label={t("guestsCount")} value={guests} min={1} max={selected.maxGuests} onChange={setGuests} />
          <p className="text-white/35 text-sm text-center">{t("maxGuestsNote")}: {selected.maxGuests}</p>
        </div>
        {errBox}
      </KioskStep>
    );
  }

  // ── Details ──────────────────────────────────────────────────────────────
  if (step === "details") {
    return (
      <KioskStep totalSteps={total} currentStep={2}
        title={t("detailsTitle")} subtitle={t("detailsSub")}
        onBack={back} backLabel={t("back")} onNext={next} nextLabel={t("next")}
        nextDisabled={name.trim().length < 2 || phone.length !== 10}>
        <div className="max-w-md mx-auto space-y-5">
          <div>
            <p className="text-white/50 mb-2">{t("fullName")}</p>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("fullName")}
              className="w-full h-16 rounded-2xl bg-white/5 border border-white/12 px-5 text-xl focus:outline-none focus:border-amber-400/50 [color-scheme:dark]" />
          </div>
          <div>
            <p className="text-white/50 mb-2">{t("mobileNumber")}</p>
            <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              inputMode="numeric" placeholder="10-digit number"
              className="w-full h-16 rounded-2xl bg-white/5 border border-white/12 px-5 text-xl tracking-wide focus:outline-none focus:border-amber-400/50 [color-scheme:dark]" />
          </div>
        </div>
        {errBox}
      </KioskStep>
    );
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  if (step === "summary" && selected) {
    return (
      <KioskStep totalSteps={total} currentStep={3}
        title={t("summaryTitle")}
        onBack={back} backLabel={t("back")}
        onNext={submit} nextLabel={t("payAtDesk")} busy={busy}>
        <div className="max-w-md mx-auto bg-white/5 border border-white/12 rounded-3xl p-6 space-y-4">
          <SummaryRow label={selected.name} value={`₹${selected.price.toLocaleString("en-IN")} ${t("perNight")}`} />
          <SummaryRow label={t("nightsCount")} value={String(nights)} />
          <SummaryRow label={t("guestsCount")} value={String(guests)} />
          <SummaryRow label={t("fullName")} value={name} />
          <SummaryRow label={t("mobileNumber")} value={phone} />
          <div className="border-t border-white/10 pt-4 flex items-center justify-between">
            <span className="text-lg font-semibold">{t("total")}</span>
            <span className="text-2xl font-bold text-amber-400">₹{estimate.toLocaleString("en-IN")}+</span>
          </div>
          <p className="flex items-center gap-2 text-white/40 text-sm">
            <Check className="w-4 h-4 text-green-400 shrink-0" /> {t("plusTaxesDeposit")}
          </p>
        </div>
        {errBox}
      </KioskStep>
    );
  }

  return null;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-white/50">{label}</span>
      <span className="font-semibold text-right">{value}</span>
    </div>
  );
}
