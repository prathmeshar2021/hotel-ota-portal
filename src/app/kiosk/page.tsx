"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Loader2, KeyRound, CalendarPlus, ArrowRight } from "lucide-react";
import { getKioskToken } from "@/lib/kiosk/client";
import { useKioskCopy } from "@/lib/kiosk/KioskShell";

/**
 * Attract screen — the kiosk's home / idle state. Two big choices:
 * check in, or make a new booking. Redirects to pairing if the device
 * isn't paired yet.
 */

const SLIDES = [
  "/rooms/luxury/1.jpg",
  "/rooms/pinewood/1.jpg",
  "/rooms/theatre/1.jpg",
];

export default function KioskAttract() {
  const router = useRouter();
  const { t } = useKioskCopy();
  const [ready, setReady] = useState(false);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    if (!getKioskToken()) {
      router.replace("/kiosk/pair");
      return;
    }
    setReady(true);
  }, [router]);

  useEffect(() => {
    const id = setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), 6000);
    return () => clearInterval(id);
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-amber-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen relative flex flex-col items-center justify-center px-6 py-10 pb-24 overflow-hidden">
      {/* Slideshow background */}
      <div className="absolute inset-0 -z-10">
        {SLIDES.map((src, i) => (
          <Image
            key={src}
            src={src}
            alt=""
            aria-hidden
            fill
            sizes="100vw"
            quality={60}
            priority={i === 0}
            className="object-cover transition-opacity duration-[2000ms]"
            style={{ opacity: i === slide ? 0.35 : 0 }}
          />
        ))}
        <div className="absolute inset-0 bg-gradient-to-b from-[#071209]/80 via-[#071209]/70 to-[#071209]" />
      </div>

      {/* Welcome */}
      <div className="text-center mb-8 sm:mb-12 max-w-3xl">
        <p className="text-amber-400 font-bold tracking-[0.2em] uppercase text-sm mb-4">
          The Urban Escape · Bhilai
        </p>
        <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-4">{t("welcome")}</h1>
        <p className="text-white/55 text-xl">{t("welcomeSub")}</p>
      </div>

      {/* Two big choices */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full max-w-3xl">
        <ChoiceCard
          onClick={() => router.push("/kiosk/checkin")}
          icon={<KeyRound className="w-9 h-9" />}
          title={t("haveBooking")}
          subtitle={t("haveBookingSub")}
          primary
        />
        <ChoiceCard
          onClick={() => router.push("/kiosk/walkin")}
          icon={<CalendarPlus className="w-9 h-9" />}
          title={t("newBooking")}
          subtitle={t("newBookingSub")}
        />
      </div>
    </div>
  );
}

function ChoiceCard({
  onClick, icon, title, subtitle, primary = false,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex flex-col items-start gap-4 p-6 sm:p-8 rounded-3xl border text-left transition-all active:scale-[0.98] min-h-[10rem] sm:min-h-[13rem] ${
        primary
          ? "bg-amber-500 hover:bg-amber-400 border-amber-400 text-black"
          : "bg-white/[0.06] hover:bg-white/[0.1] border-white/12 text-white"
      }`}
    >
      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${primary ? "bg-black/10" : "bg-amber-500/15 text-amber-400"}`}>
        {icon}
      </div>
      <div className="flex-1">
        <h2 className="text-2xl font-bold mb-1">{title}</h2>
        <p className={primary ? "text-black/70" : "text-white/50"}>{subtitle}</p>
      </div>
      <ArrowRight className={`w-6 h-6 ${primary ? "text-black/60" : "text-white/40"} group-hover:translate-x-1 transition-transform`} />
    </button>
  );
}
