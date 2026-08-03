"use client";

import { useState, useEffect, useCallback } from "react";
import { X, ExternalLink, ChevronLeft, ChevronRight, CreditCard } from "lucide-react";
import { pdfToImage } from "@/lib/utils/id-photo";

interface Props {
  frontUrl?: string | null;
  backUrl?: string | null;
  /** Whose ID this is — shown in the viewer so it's clear at a glance. */
  who: string;
  /** Smaller thumbnails for the companion list. */
  compact?: boolean;
}

/**
 * Guest ID photos with a full-screen viewer.
 *
 * Thumbnails use object-contain, not cover: a cropped ID is useless at the desk
 * because the number and photo sit at the edges. Clicking opens the whole
 * document large enough to actually read, which is the point of having it.
 *
 * A PDF upload is stored with a .pdf URL that an <img> can't render, so it's
 * rewritten to a page image on the way in.
 */
export default function IdPhotos({ frontUrl, backUrl, who, compact = false }: Props) {
  const shots = [
    frontUrl ? { label: "Front", url: pdfToImage(frontUrl), raw: frontUrl } : null,
    backUrl ? { label: "Back", url: pdfToImage(backUrl), raw: backUrl } : null,
  ].filter(Boolean) as { label: string; url: string; raw: string }[];

  const [openAt, setOpenAt] = useState<number | null>(null);
  const isOpen = openAt !== null;

  const close = useCallback(() => setOpenAt(null), []);
  const step = useCallback(
    (delta: number) => setOpenAt(i => (i === null ? null : (i + delta + shots.length) % shots.length)),
    [shots.length]
  );

  // Arrow keys to flip front/back, Escape to close — this gets used one-handed
  // while the guest is standing there.
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close, step]);

  if (shots.length === 0) {
    return compact ? null : (
      <p className="flex items-center gap-1.5 text-white/25 text-xs mt-3">
        <CreditCard className="w-3.5 h-3.5" /> No ID photos on file
      </p>
    );
  }

  const current = openAt !== null ? shots[openAt] : null;

  return (
    <>
      <div className={`flex gap-2 ${compact ? "mt-2" : "mt-4 gap-3"}`}>
        {shots.map((s, i) => (
          <button
            key={s.label}
            onClick={() => setOpenAt(i)}
            title={`View ${who} — ${s.label}`}
            className={`relative rounded-xl overflow-hidden border border-white/10 hover:border-white/30 bg-black/30 transition-colors group ${
              compact ? "w-20 h-14" : "flex-1 max-w-[150px] h-28"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.url} alt={`${who} ID ${s.label}`} className="w-full h-full object-contain" />
            <div className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] text-white/70 text-center py-0.5">
              {s.label}
            </div>
          </button>
        ))}
      </div>

      {/* Full-screen viewer */}
      {current && (
        <div
          className="fixed inset-0 z-[70] flex flex-col bg-black/90 backdrop-blur-sm"
          onClick={close}
        >
          <div className="flex items-center justify-between px-5 py-3 shrink-0" onClick={e => e.stopPropagation()}>
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm truncate">{who}</p>
              <p className="text-white/40 text-xs">
                ID {current.label}
                {shots.length > 1 ? ` · ${openAt! + 1} of ${shots.length}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={current.raw}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white border border-white/15 hover:border-white/30 px-3 py-2 rounded-xl transition-all"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Open original
              </a>
              <button onClick={close} className="text-white/50 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center px-4 pb-5 min-h-0" onClick={e => e.stopPropagation()}>
            {shots.length > 1 && (
              <button onClick={() => step(-1)}
                className="shrink-0 text-white/40 hover:text-white p-2 rounded-full hover:bg-white/10 transition-all">
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current.url}
              alt={`${who} ID ${current.label}`}
              className="max-h-full max-w-full object-contain rounded-xl"
            />
            {shots.length > 1 && (
              <button onClick={() => step(1)}
                className="shrink-0 text-white/40 hover:text-white p-2 rounded-full hover:bg-white/10 transition-all">
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
