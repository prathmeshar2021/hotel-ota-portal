"use client";

import { createContext, useContext, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import {
  PANEL_LANG_COOKIE, makeT, type PanelLang, type PanelT,
} from "@/lib/i18n/panel";

const Ctx = createContext<{ lang: PanelLang; t: PanelT }>({ lang: "en", t: makeT("en") });

/**
 * Seeded by the admin layouts from the request cookie, so client components
 * render in the same language as the server-rendered page around them.
 */
export function PanelLangProvider({
  lang, children,
}: { lang: PanelLang; children: React.ReactNode }) {
  return <Ctx.Provider value={{ lang, t: makeT(lang) }}>{children}</Ctx.Provider>;
}

/** Translator for a Client Component. Server components use getPanelT(). */
export function usePanelT(): PanelT {
  return useContext(Ctx).t;
}

export function usePanelLang(): PanelLang {
  return useContext(Ctx).lang;
}

/**
 * Flips the panel between English and Hindi. Writes the cookie the server reads
 * and refreshes so server-rendered screens re-render in the new language.
 * Rendered only inside the staff navs — the guest site never sees it.
 */
export function LangToggle({ compact = false }: { compact?: boolean }) {
  const { lang } = useContext(Ctx);
  const router = useRouter();

  const toggle = useCallback(() => {
    const next: PanelLang = lang === "en" ? "hi" : "en";
    // 1 year, site-wide so every admin route picks it up.
    document.cookie = `${PANEL_LANG_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    router.refresh();
  }, [lang, router]);

  // Always label the button with the language it switches TO, in that language,
  // so it reads correctly to whoever is looking at it.
  const label = lang === "en" ? "हिंदी" : "English";

  return (
    <button
      type="button"
      onClick={toggle}
      title={lang === "en" ? "हिंदी में देखें" : "View in English"}
      className={`flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all ${
        compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"
      }`}
    >
      <Languages className="w-4 h-4 shrink-0" />
      <span className="font-semibold">{label}</span>
    </button>
  );
}
