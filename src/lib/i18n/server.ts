import { cookies } from "next/headers";
import { PANEL_LANG_COOKIE, isPanelLang, makeT, type PanelLang, type PanelT } from "./panel";

/**
 * Panel language for a Server Component. Most admin screens render on the
 * server, so the choice lives in a cookie rather than React state — that way
 * one toggle flips server-rendered and client-rendered text alike.
 */
export async function getPanelLang(): Promise<PanelLang> {
  const store = await cookies();
  const value = store.get(PANEL_LANG_COOKIE)?.value;
  return isPanelLang(value) ? value : "en";
}

/** Translator bound to the current request's language. */
export async function getPanelT(): Promise<PanelT> {
  return makeT(await getPanelLang());
}
