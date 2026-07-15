"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { MessageCircle } from "lucide-react";

/**
 * The chat UI + intent engine (~600 lines + framer-motion) only download
 * when the guest actually taps the launcher. Until then every page ships
 * just this tiny button.
 */
const ChatBot = dynamic(() => import("./ChatBot"), {
  ssr: false,
  // Keep an identical button on screen while the chunk downloads so the
  // launcher never flickers or jumps.
  loading: () => <LauncherButton pulse />,
});

const WA_LINK = `https://wa.me/917000630016?text=${encodeURIComponent(
  "Hi! I'd like to know more about booking a stay at The Urban Escape."
)}`;

/** Direct WhatsApp line — most local guests trust this over any chatbot. */
function WhatsAppFab() {
  return (
    <a
      href={WA_LINK}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp"
      className="fixed bottom-[5.5rem] right-6 z-[59] w-12 h-12 bg-[#25D366] rounded-full flex items-center justify-center shadow-xl shadow-black/40 transition-transform hover:scale-110 active:scale-95"
    >
      <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white" aria-hidden>
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    </a>
  );
}

function LauncherButton({ pulse = false, onClick }: { pulse?: boolean; onClick?: () => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-[60]">
      <button
        onClick={onClick}
        className={`w-14 h-14 bg-amber-500 hover:bg-amber-400 text-black rounded-full flex items-center justify-center shadow-2xl shadow-amber-500/40 transition-transform hover:scale-110 active:scale-95 ${pulse ? "animate-pulse" : ""}`}
        aria-label="Open resort chat"
      >
        <MessageCircle className="w-6 h-6" />
      </button>
    </div>
  );
}

/** Renders ChatBot only on customer-facing pages (not admin / auth). */
export default function ChatBotWrapper() {
  const pathname = usePathname();
  const [activated, setActivated] = useState(false);

  // Hide on admin pages, auth pages, and checkin (already focused flow)
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/checkin")
  ) {
    return null;
  }

  return (
    <>
      <WhatsAppFab />
      {activated ? <ChatBot initialOpen /> : <LauncherButton onClick={() => setActivated(true)} />}
    </>
  );
}
