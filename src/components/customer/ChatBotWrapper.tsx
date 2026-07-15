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

  if (!activated) return <LauncherButton onClick={() => setActivated(true)} />;

  return <ChatBot initialOpen />;
}
